import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireTenantCaller } from "../../../../lib/auth/tenant";
import { createSyllabus, logAgentEvent } from "../../../../lib/student-model";

export default defineTool({
  description: "Create the syllabus and its ordered nodes for the student's active goal.",
  inputSchema: z.object({
    goalId: z.string().uuid(),
    title: z.string().min(1),
    nodes: z
      .array(
        z.object({
          title: z.string().min(1),
          type: z.enum(["lesson", "project"]),
          targetSkillIds: z.array(z.string()).optional(),
        }),
      )
      .min(1),
  }),
  async execute(input, ctx) {
    const { clerkUserId } = requireTenantCaller(ctx);
    const { syllabus, nodes } = await createSyllabus(clerkUserId, input);
    await logAgentEvent(clerkUserId, {
      agentName: "planner",
      eventType: "syllabus.created",
      payload: { syllabusId: syllabus.id, nodeCount: nodes.length },
    });
    return { syllabusId: syllabus.id, nodeCount: nodes.length, firstNodeTitle: nodes[0]?.title };
  },
});
