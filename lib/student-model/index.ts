import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  agentEvents,
  goals,
  lessons,
  projects,
  reviews,
  skills,
  submissions,
  syllabi,
  syllabusNodes,
  users,
} from "../db/schema";

/**
 * Every function here is scoped by the stable Clerk user id, never an internal
 * uuid the caller could forge. This is the only place tenant scoping is
 * enforced; agent tools and Next.js routes both go through this module instead
 * of touching the schema directly.
 */

export async function getOrCreateUser(clerkUserId: string, email: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({ clerkUserId, email })
    .onConflictDoUpdate({ target: users.clerkUserId, set: { email } })
    .returning();

  return created;
}

async function requireInternalUserId(clerkUserId: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
    columns: { id: true },
  });
  if (!user) {
    throw new Error(`No user record for clerkUserId ${clerkUserId}. Create one first.`);
  }
  return user.id;
}

export async function createGoal(
  clerkUserId: string,
  input: { title: string; description?: string },
) {
  const userId = await requireInternalUserId(clerkUserId);
  const [goal] = await db
    .insert(goals)
    .values({ userId, title: input.title, description: input.description })
    .returning();
  return goal;
}

export async function getActiveGoal(clerkUserId: string) {
  const userId = await requireInternalUserId(clerkUserId);
  return db.query.goals.findFirst({
    where: and(eq(goals.userId, userId), eq(goals.status, "active")),
    orderBy: desc(goals.createdAt),
  });
}

export async function getSkills(clerkUserId: string) {
  const userId = await requireInternalUserId(clerkUserId);
  return db.query.skills.findMany({ where: eq(skills.userId, userId) });
}

export async function createSyllabus(
  clerkUserId: string,
  input: {
    goalId: string;
    title: string;
    nodes: Array<{
      title: string;
      type: "lesson" | "project";
      targetSkillIds?: string[];
    }>;
  },
) {
  const userId = await requireInternalUserId(clerkUserId);

  const [syllabus] = await db
    .insert(syllabi)
    .values({ userId, goalId: input.goalId, title: input.title, status: "active" })
    .returning();

  const nodeRows = await db
    .insert(syllabusNodes)
    .values(
      input.nodes.map((node, index) => ({
        syllabusId: syllabus.id,
        userId,
        orderIndex: index,
        title: node.title,
        type: node.type,
        status: index === 0 ? ("available" as const) : ("locked" as const),
        targetSkillIds: node.targetSkillIds ?? [],
      })),
    )
    .returning();

  return { syllabus, nodes: nodeRows };
}

export async function getActiveSyllabusNode(clerkUserId: string) {
  const userId = await requireInternalUserId(clerkUserId);
  return db.query.syllabusNodes.findFirst({
    where: and(
      eq(syllabusNodes.userId, userId),
      eq(syllabusNodes.status, "available"),
    ),
    orderBy: asc(syllabusNodes.orderIndex),
  });
}

export async function getSyllabusNodes(clerkUserId: string, syllabusId: string) {
  const userId = await requireInternalUserId(clerkUserId);
  return db.query.syllabusNodes.findMany({
    where: and(eq(syllabusNodes.syllabusId, syllabusId), eq(syllabusNodes.userId, userId)),
    orderBy: asc(syllabusNodes.orderIndex),
  });
}

export async function markNodeInProgress(clerkUserId: string, nodeId: string) {
  const userId = await requireInternalUserId(clerkUserId);
  const [node] = await db
    .update(syllabusNodes)
    .set({ status: "in_progress" })
    .where(and(eq(syllabusNodes.id, nodeId), eq(syllabusNodes.userId, userId)))
    .returning();
  return node;
}

/** The only mutation that flips node status to completed and unlocks the next node. Mentor-only. */
export async function advanceNode(clerkUserId: string, nodeId: string) {
  const userId = await requireInternalUserId(clerkUserId);

  const [completed] = await db
    .update(syllabusNodes)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(syllabusNodes.id, nodeId), eq(syllabusNodes.userId, userId)))
    .returning();

  if (!completed) return { completed: null, unlocked: null };

  const siblings = await db.query.syllabusNodes.findMany({
    where: and(
      eq(syllabusNodes.syllabusId, completed.syllabusId),
      eq(syllabusNodes.userId, userId),
    ),
    orderBy: asc(syllabusNodes.orderIndex),
  });

  const next = siblings.find((node) => node.orderIndex === completed.orderIndex + 1);
  if (!next || next.status !== "locked") {
    return { completed, unlocked: null };
  }

  const [unlocked] = await db
    .update(syllabusNodes)
    .set({ status: "available" })
    .where(and(eq(syllabusNodes.id, next.id), eq(syllabusNodes.userId, userId)))
    .returning();

  return { completed, unlocked };
}

export async function saveLesson(
  clerkUserId: string,
  input: { syllabusNodeId: string; content: Record<string, unknown>; modelVersion?: string },
) {
  const userId = await requireInternalUserId(clerkUserId);
  const [lesson] = await db
    .insert(lessons)
    .values({
      syllabusNodeId: input.syllabusNodeId,
      userId,
      content: input.content,
      modelVersion: input.modelVersion,
    })
    .returning();
  return lesson;
}

export async function saveProject(
  clerkUserId: string,
  input: {
    syllabusNodeId: string;
    brief: Record<string, unknown>;
    rubric: Record<string, unknown>;
  },
) {
  const userId = await requireInternalUserId(clerkUserId);
  const [project] = await db
    .insert(projects)
    .values({
      syllabusNodeId: input.syllabusNodeId,
      userId,
      brief: input.brief,
      rubric: input.rubric,
    })
    .returning();
  return project;
}

export async function getProjectByNode(clerkUserId: string, syllabusNodeId: string) {
  const userId = await requireInternalUserId(clerkUserId);
  return db.query.projects.findFirst({
    where: and(eq(projects.syllabusNodeId, syllabusNodeId), eq(projects.userId, userId)),
    orderBy: desc(projects.createdAt),
  });
}

export async function createSubmission(
  clerkUserId: string,
  input: { projectId: string; content: string; artifactRef?: string },
) {
  const userId = await requireInternalUserId(clerkUserId);
  const [submission] = await db
    .insert(submissions)
    .values({
      projectId: input.projectId,
      userId,
      content: input.content,
      artifactRef: input.artifactRef,
    })
    .returning();
  return submission;
}

export async function getSubmissionWithProject(clerkUserId: string, submissionId: string) {
  const userId = await requireInternalUserId(clerkUserId);
  const submission = await db.query.submissions.findFirst({
    where: and(eq(submissions.id, submissionId), eq(submissions.userId, userId)),
  });
  if (!submission) return null;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, submission.projectId), eq(projects.userId, userId)),
  });

  return { submission, project };
}

export async function getPendingSubmission(clerkUserId: string, projectId: string) {
  const userId = await requireInternalUserId(clerkUserId);
  return db.query.submissions.findFirst({
    where: and(
      eq(submissions.projectId, projectId),
      eq(submissions.userId, userId),
      eq(submissions.status, "pending"),
    ),
    orderBy: desc(submissions.submittedAt),
  });
}

/** Writes the review, marks the submission reviewed, and applies skill_deltas by name (upsert). */
export async function saveReview(
  clerkUserId: string,
  input: {
    submissionId: string;
    feedback: string;
    score: number;
    skillDeltas: Record<string, number>;
  },
) {
  const userId = await requireInternalUserId(clerkUserId);

  const [review] = await db
    .insert(reviews)
    .values({
      submissionId: input.submissionId,
      userId,
      feedback: input.feedback,
      score: input.score,
      skillDeltas: input.skillDeltas,
    })
    .returning();

  await db
    .update(submissions)
    .set({ status: "reviewed" })
    .where(and(eq(submissions.id, input.submissionId), eq(submissions.userId, userId)));

  for (const [skillName, delta] of Object.entries(input.skillDeltas)) {
    const existing = await db.query.skills.findFirst({
      where: and(eq(skills.userId, userId), eq(skills.name, skillName)),
    });

    if (existing) {
      const nextLevel = Math.max(0, Math.min(100, existing.masteryLevel + delta));
      await db
        .update(skills)
        .set({
          masteryLevel: nextLevel,
          evidenceCount: existing.evidenceCount + 1,
          lastAssessedAt: new Date(),
        })
        .where(eq(skills.id, existing.id));
    } else {
      await db.insert(skills).values({
        userId,
        name: skillName,
        masteryLevel: Math.max(0, Math.min(100, delta)),
        evidenceCount: 1,
        lastAssessedAt: new Date(),
      });
    }
  }

  return review;
}

export async function logAgentEvent(
  clerkUserId: string,
  input: { agentName: string; eventType: string; payload?: Record<string, unknown> },
) {
  const userId = await requireInternalUserId(clerkUserId);
  await db.insert(agentEvents).values({
    userId,
    agentName: input.agentName,
    eventType: input.eventType,
    payload: input.payload ?? {},
  });
}

export async function getStudentSnapshot(clerkUserId: string) {
  const userId = await requireInternalUserId(clerkUserId);

  const [goal, skillRows, activeNode] = await Promise.all([
    db.query.goals.findFirst({
      where: and(eq(goals.userId, userId), eq(goals.status, "active")),
      orderBy: desc(goals.createdAt),
    }),
    db.query.skills.findMany({ where: eq(skills.userId, userId) }),
    getActiveSyllabusNode(clerkUserId),
  ]);

  return { goal, skills: skillRows, activeNode };
}
