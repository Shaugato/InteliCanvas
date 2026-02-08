import { z } from "zod";
import { DrawingCommandSchema } from "./commands";
import { zodToJsonSchema } from "zod-to-json-schema";

export const CommandEnvelopeSchema = z.object({
  commands: z.array(DrawingCommandSchema),
  notes: z.string().optional(),
  refused: z.boolean().optional(),
  refusalReason: z.string().optional(),
});

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;

export const CommandEnvelopeJsonSchema = zodToJsonSchema(CommandEnvelopeSchema, "CommandEnvelope");
