import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireTenantCaller } from "../../lib/auth/tenant";
import { createSubmission, getProjectByNode, logAgentEvent } from "../../lib/student-model";

export default defineTool({
  description:
    "Persist the student's submitted project work for the current project-type node, before delegating to project-coach for review.",
  inputSchema: z.object({
    nodeId: z.string().uuid(),
    content: z.string().min(1).describe("The student's submitted work, verbatim."),
  }),
  async execute({ nodeId, content }, ctx) {
    const { clerkUserId } = requireTenantCaller(ctx);
    const project = await getProjectByNode(clerkUserId, nodeId);
    if (!project) {
      throw new Error("No project brief exists for this node yet.");
    }

    const submission = await createSubmission(clerkUserId, { projectId: project.id, content });
    await logAgentEvent(clerkUserId, {
      agentName: "mentor",
      eventType: "submission.recorded",
      payload: { submissionId: submission.id, projectId: project.id },
    });
    return { submissionId: submission.id, projectId: project.id };
  },
});
