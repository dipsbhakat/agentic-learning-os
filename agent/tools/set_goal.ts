import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireTenantCaller } from "../../lib/auth/tenant";
import { createGoal, logAgentEvent } from "../../lib/student-model";

export default defineTool({
  description: "Record a new learning goal for the student, stated in their own words.",
  inputSchema: z.object({
    title: z.string().min(1).describe("Short goal title, e.g. 'Learn the Claude Agent SDK'"),
    description: z.string().optional(),
  }),
  async execute(input, ctx) {
    const { clerkUserId } = requireTenantCaller(ctx);
    const goal = await createGoal(clerkUserId, input);
    await logAgentEvent(clerkUserId, {
      agentName: "mentor",
      eventType: "goal.created",
      payload: { goalId: goal.id, title: goal.title },
    });
    return { goalId: goal.id, title: goal.title };
  },
});
