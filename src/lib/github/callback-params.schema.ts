import { z } from "zod";

/**
 * Zod schema for the query parameters sent by GitHub after App installation.
 *
 * GitHub sends:
 *   ?installation_id=<number>&setup_action=install|update
 *
 * The setup_action may be absent in some edge-case flows.
 * No other query parameters are read or trusted.
 */
export const callbackParamsSchema = z.object({
  installation_id: z
    .string()
    .regex(/^\d+$/, "installation_id must be a numeric string")
    .transform((v) => parseInt(v, 10)),
  setup_action: z.enum(["install", "update"]).optional(),
});

export type CallbackParams = z.infer<typeof callbackParamsSchema>;
