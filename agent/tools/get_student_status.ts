import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireTenantCaller } from "../../lib/auth/tenant";
import { getStudentSnapshot, getSyllabusNodes } from "../../lib/student-model";

export default defineTool({
  description:
    "Read the student's current goal, skill levels, and active syllabus node. Call this first on every turn.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const { clerkUserId } = requireTenantCaller(ctx);
    const snapshot = await getStudentSnapshot(clerkUserId);
    const nodes = snapshot.activeNode
      ? await getSyllabusNodes(clerkUserId, snapshot.activeNode.syllabusId)
      : [];

    return {
      goal: snapshot.goal
        ? { id: snapshot.goal.id, title: snapshot.goal.title, description: snapshot.goal.description }
        : null,
      skills: snapshot.skills.map((skill) => ({ name: skill.name, masteryLevel: skill.masteryLevel })),
      activeNode: snapshot.activeNode
        ? {
            id: snapshot.activeNode.id,
            title: snapshot.activeNode.title,
            type: snapshot.activeNode.type,
            targetSkillIds: snapshot.activeNode.targetSkillIds,
          }
        : null,
      syllabusProgress: nodes.map((node) => ({ title: node.title, status: node.status })),
    };
  },
});
