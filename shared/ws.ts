import { z } from "zod";
import { SceneGraphSchema, CommandEnvelopeSchema } from "./index";
import { DrawingCommandSchema } from "./commands";

export const EventStatusSchema = z.enum([
  "applied",
  "rejected",
  "refused",
  "error",
]);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export const SessionEventSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  utterance: z.string(),
  commands: z.array(DrawingCommandSchema),
  status: EventStatusSchema,
  notes: z.string().optional(),
  latencyMs: z.number().optional(),
  diffSummary: z.string().optional(),
});
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const ClientToServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("submit_utterance"),
    utterance: z.string(),
    clientEventId: z.string().optional(),
  }),
  z.object({
    type: z.literal("request_director_pass"),
  }),
  z.object({
    type: z.literal("toggle_textures"),
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal("final_render"),
  }),
  z.object({
    type: z.literal("apply_command_envelope"),
    envelope: CommandEnvelopeSchema,
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal("reset_scene"),
  }),
  z.object({
    type: z.literal("ping"),
  }),
]);
export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchema>;

export const ServerToClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("transcript_partial"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("transcript_final"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("command_envelope"),
    envelope: CommandEnvelopeSchema,
  }),
  z.object({
    type: z.literal("scene_update"),
    sceneGraph: SceneGraphSchema,
    sessionEvents: z.array(SessionEventSchema),
    activePreviewIds: z.array(z.string()),
    revision: z.number(),
  }),
  z.object({
    type: z.literal("status"),
    message: z.string(),
    level: z.enum(["info", "warn", "error"]).optional(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    code: z.string().optional(),
  }),
  z.object({
    type: z.literal("pong"),
  }),
]);
export type ServerToClientMessage = z.infer<typeof ServerToClientMessageSchema>;
