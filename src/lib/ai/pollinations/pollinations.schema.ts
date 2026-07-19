import { z } from "zod";

const usageSchema = z
  .object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const pollinationsResponseSchema = z
  .object({
    id: z.string().max(200).optional(),
    model: z.string().max(200).optional(),
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string().min(1),
              })
              .passthrough(),
          })
          .passthrough()
      )
      .min(1),
    usage: usageSchema.optional(),
  })
  .passthrough();
