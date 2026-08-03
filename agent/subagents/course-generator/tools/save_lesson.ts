import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireTenantCaller } from "../../../../lib/auth/tenant";
import { logAgentEvent, saveLesson } from "../../../../lib/student-model";

export default defineTool({
  description: "Save the generated lesson content for a syllabus node.",
  inputSchema: z.object({
    syllabusNodeId: z.string().uuid(),
    title: z.string().min(1),
    markdown: z.string().min(1),
  }),
  async execute({ syllabusNodeId, title, markdown }, ctx) {
    const { clerkUserId } = requireTenantCaller(ctx);
    const lesson = await saveLesson(clerkUserId, {
      syllabusNodeId,
      content: { title, markdown },
      modelVersion: "anthropic/claude-sonnet-5",
    });
    await logAgentEvent(clerkUserId, {
      agentName: "course-generator",
      eventType: "lesson.created",
      payload: { lessonId: lesson.id, syllabusNodeId },
    });
    return { lessonId: lesson.id, title };
  },
});
