import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireTenantCaller } from "../../../../lib/auth/tenant";
import { logAgentEvent, saveProject } from "../../../../lib/student-model";

export default defineTool({
  description: "Save a project brief and rubric for a project-type syllabus node.",
  inputSchema: z.object({
    syllabusNodeId: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().min(1),
    rubric: z.record(z.string(), z.string()).describe("skill name -> what 'met' looks like"),
  }),
  async execute({ syllabusNodeId, title, description, rubric }, ctx) {
    const { clerkUserId } = requireTenantCaller(ctx);
    const project = await saveProject(clerkUserId, {
      syllabusNodeId,
      brief: { title, description },
      rubric,
    });
    await logAgentEvent(clerkUserId, {
      agentName: "project-coach",
      eventType: "project.created",
      payload: { projectId: project.id, syllabusNodeId },
    });
    return { mode: "brief" as const, projectId: project.id, title };
  },
});
