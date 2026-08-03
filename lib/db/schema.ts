import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const goalStatus = pgEnum("goal_status", ["active", "paused", "done"]);
export const syllabusStatus = pgEnum("syllabus_status", ["draft", "active", "archived"]);
export const nodeType = pgEnum("node_type", ["lesson", "project"]);
export const nodeStatus = pgEnum("node_status", [
  "locked",
  "available",
  "in_progress",
  "completed",
]);
export const submissionStatus = pgEnum("submission_status", ["pending", "reviewed"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: goalStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("goals_user_id_idx").on(table.userId)],
);

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
    masteryLevel: integer("mastery_level").notNull().default(0),
    evidenceCount: integer("evidence_count").notNull().default(0),
    lastAssessedAt: timestamp("last_assessed_at", { withTimezone: true }),
  },
  (table) => [
    index("skills_user_id_idx").on(table.userId),
    unique("skills_user_name_unique").on(table.userId, table.name),
  ],
);

export const syllabi = pgTable(
  "syllabi",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: syllabusStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("syllabi_user_id_idx").on(table.userId)],
);

export const syllabusNodes = pgTable(
  "syllabus_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syllabusId: uuid("syllabus_id")
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    title: text("title").notNull(),
    type: nodeType("type").notNull(),
    status: nodeStatus("status").notNull().default("locked"),
    targetSkillIds: jsonb("target_skill_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("syllabus_nodes_user_id_idx").on(table.userId),
    index("syllabus_nodes_syllabus_id_idx").on(table.syllabusId),
    unique("syllabus_nodes_order_unique").on(table.syllabusId, table.orderIndex),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syllabusNodeId: uuid("syllabus_node_id")
      .notNull()
      .references(() => syllabusNodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    modelVersion: text("model_version"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lessons_user_id_idx").on(table.userId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syllabusNodeId: uuid("syllabus_node_id")
      .notNull()
      .references(() => syllabusNodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brief: jsonb("brief").$type<Record<string, unknown>>().notNull(),
    rubric: jsonb("rubric").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("projects_user_id_idx").on(table.userId)],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    artifactRef: text("artifact_ref"),
    status: submissionStatus("status").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("submissions_user_id_idx").on(table.userId)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feedback: text("feedback").notNull(),
    score: integer("score").notNull(),
    skillDeltas: jsonb("skill_deltas").$type<Record<string, number>>().notNull().default({}),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reviews_user_id_idx").on(table.userId)],
);

export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentName: text("agent_name").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agent_events_user_id_idx").on(table.userId)],
);
