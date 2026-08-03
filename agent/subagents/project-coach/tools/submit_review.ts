import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireTenantCaller } from "../../../../lib/auth/tenant";
import { logAgentEvent, saveReview } from "../../../../lib/student-model";

export default defineTool({
  description: "Save the review of a submission: score, pass/fail, feedback, and skill deltas.",
  inputSchema: z.object({
    submissionId: z.string().uuid(),
    score: z.number().min(0).max(100),
    feedback: z.string().min(1),
    skillDeltas: z.record(z.string(), z.number()),
  }),
  async execute({ submissionId, score, feedback, skillDeltas }, ctx) {
    const { clerkUserId } = requireTenantCaller(ctx);
    await saveReview(clerkUserId, { submissionId, score, feedback, skillDeltas });
    const passed = score >= 70;
    await logAgentEvent(clerkUserId, {
      agentName: "project-coach",
      eventType: "submission.reviewed",
      payload: { submissionId, score, passed },
    });
    return { mode: "review" as const, score, passed, feedback, skillDeltas };
  },
});
