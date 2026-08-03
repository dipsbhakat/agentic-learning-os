import { defineAgent } from "eve";
import { z } from "zod";

export default defineAgent({
  description:
    "Write the lesson content for one syllabus node, calibrated to the student's current skill mastery.",
  model: "anthropic/claude-sonnet-5",
  outputSchema: z.object({
    lessonId: z.string(),
    title: z.string(),
  }),
});
