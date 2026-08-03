import { defineAgent } from "eve";
import { z } from "zod";

export default defineAgent({
  description:
    "Turn a learning goal and the student's current skills into an ordered syllabus of lesson and project nodes.",
  model: "anthropic/claude-sonnet-5",
  outputSchema: z.object({
    syllabusId: z.string(),
    nodeCount: z.number(),
    firstNodeTitle: z.string(),
  }),
});
