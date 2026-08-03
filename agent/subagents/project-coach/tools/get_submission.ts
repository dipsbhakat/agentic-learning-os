import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireTenantCaller } from "../../../../lib/auth/tenant";
import { getSubmissionWithProject } from "../../../../lib/student-model";

export default defineTool({
  description: "Read a submitted project's content along with its brief and rubric.",
  inputSchema: z.object({ submissionId: z.string().uuid() }),
  async execute({ submissionId }, ctx) {
    const { clerkUserId } = requireTenantCaller(ctx);
    const result = await getSubmissionWithProject(clerkUserId, submissionId);
    if (!result?.project) {
      throw new Error("Submission or its project brief was not found.");
    }
    return {
      content: result.submission.content,
      brief: result.project.brief,
      rubric: result.project.rubric,
    };
  },
});
