import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireTenantCaller } from "../../lib/auth/tenant";
import { advanceNode, logAgentEvent } from "../../lib/student-model";

export default defineTool({
  description:
    "Mark a syllabus node completed and unlock the next one. Call this only after project-coach returns a passing review, or after the student finishes a lesson-type node.",
  inputSchema: z.object({ nodeId: z.string().uuid() }),
  async execute({ nodeId }, ctx) {
    const { clerkUserId } = requireTenantCaller(ctx);
    const result = await advanceNode(clerkUserId, nodeId);
    await logAgentEvent(clerkUserId, {
      agentName: "mentor",
      eventType: "node.advanced",
      payload: { nodeId, unlockedNodeId: result.unlocked?.id ?? null },
    });
    return {
      completedNodeId: result.completed?.id ?? null,
      unlockedNode: result.unlocked
        ? { id: result.unlocked.id, title: result.unlocked.title, type: result.unlocked.type }
        : null,
    };
  },
});
