import { z } from "zod";

/**
 * Structured body of timeline content (tips, recommendations, instructions).
 * Stored as JSON and rendered as text by the app: never HTML, so clinic content can't inject markup.
 */
export const contentBodySchema = z.object({
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string().max(2000) }),
        z.object({ type: z.literal("checklist"), items: z.array(z.string().max(300)).max(20) }),
      ]),
    )
    .max(20),
});

export type ContentBody = z.infer<typeof contentBodySchema>;

/** Unknown or malformed bodies render as empty rather than breaking the patient's day. */
export function parseContentBody(raw: unknown): ContentBody {
  const parsed = contentBodySchema.safeParse(raw);
  return parsed.success ? parsed.data : { blocks: [] };
}
