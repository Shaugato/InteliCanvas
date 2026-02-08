import { z } from "zod";

/**
 * Live WS (client <-> server) messages for Gemini Live streaming.
 * Kept separate from shared/ws.ts so /ws stays stable.
 */

export const LiveClientToServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start_live"),
    config: z
      .object({
        model: z.string().optional(),
        // Option A: send real sample rate (AudioContext.sampleRate)
        sampleRate: z.number().int().min(8000).max(48000).optional(),
        // Optional if you want later
        language: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("stop_live"),
  }),
  z.object({
    type: z.literal("ping_live"),
  }),

  // Optional fallback path (we primarily stream binary audio frames):
  z.object({
    type: z.literal("audio_chunk"),
    data: z.string(), // base64 PCM16
    mimeType: z.string().optional(),
  }),
]);

export type LiveClientToServerMessage = z.infer<
  typeof LiveClientToServerMessageSchema
>;

export const LiveServerToClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("live_status"),
    status: z.enum(["connecting", "connected", "error", "disconnected"]),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal("live_error"),
    error: z.string(),
    code: z.string().optional(),
  }),
  z.object({
    type: z.literal("pong_live"),
  }),

  z.object({
    type: z.literal("transcript_partial"),
    text: z.string(),
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal("transcript_final"),
    text: z.string(),
    timestamp: z.number().optional(),
  }),
]);

export type LiveServerToClientMessage = z.infer<
  typeof LiveServerToClientMessageSchema
>;
