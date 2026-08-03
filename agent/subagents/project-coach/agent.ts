import { defineAgent } from "eve";
import { z } from "zod";

export default defineAgent({
  description:
    "Write a project brief for a syllabus node, or review a student's submitted work against a brief's rubric.",
  model: "anthropic/claude-sonnet-5",
  outputSchema: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("brief"), projectId: z.string(), title: z.string() }),
    z.object({
      mode: z.literal("review"),
      score: z.number(),
      passed: z.boolean(),
      feedback: z.string(),
      skillDeltas: z.record(z.string(), z.number()),
    }),
  ]),
});
