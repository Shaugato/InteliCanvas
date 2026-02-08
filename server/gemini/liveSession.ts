import { GoogleGenAI, Modality } from "@google/genai";

export type LiveStatus = "connecting" | "connected" | "disconnected" | "error";

export interface LiveSessionConfig {
  apiKey?: string;
  model?: string;
  sampleRate?: number; // actual AudioContext.sampleRate
  debug?: boolean;
}

export interface LiveSessionCallbacks {
  onStatus?: (status: LiveStatus, message?: string) => void;
  onTranscriptPartial?: (text: string) => void;
  onTranscriptFinal?: (text: string) => Promise<void> | void;
  onError?: (err: Error) => void;
}

interface SessionHandle {
  id: string;
  session: any;
  isActive: boolean;
  isReady: boolean;

  lastPartial: string;
  lastTranscriptAt: number;
  transcriptLatencyMs: number[];
  audioLatencyMs: number[];

  sampleRate: number;
  debug?: boolean;

  callbacks: LiveSessionCallbacks;
}

const sessions = new Map<string, SessionHandle>();

/* ---------------- helpers ---------------- */

function getAi(apiKey?: string): GoogleGenAI {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY environment variable is not set");
  return new GoogleGenAI({ apiKey: key });
}

function clampSampleRate(n: unknown, fallback: number) {
  const v =
    typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(48000, Math.max(8000, v));
}

function pushBounded(arr: number[], value: number, max = 10) {
  arr.push(value);
  if (arr.length > max) arr.shift();
}

function normalizeMessage(input: any) {
  return input?.data ?? input;
}

/**
 * Drop garbage finals so we don't spam the Director / hit quota.
 * Tune as needed, but keep conservative.
 */
function isGoodFinalTranscript(t: string): boolean {
  const s = (t || "").trim();
  if (!s) return false;

  // common noise markers
  if (s === "<noise>" || s.startsWith("<noise>")) return false;

  // too short = VAD glitches (e.g., "و", "が", "і", "So")
  if (s.length < 4) return false;

  // Require at least one Latin letter to avoid random single-char non-English results
  // (You can relax this later if you want multilingual support.)
  if (!/[A-Za-z]/.test(s)) return false;

  return true;
}

/* ---------------- public API ---------------- */

export function getSessionLatency(sessionId: string): {
  audioAvgMs: number;
  transcriptAvgMs: number;
} {
  const s = sessions.get(sessionId);
  if (!s) return { audioAvgMs: 0, transcriptAvgMs: 0 };

  const audioAvgMs =
    s.audioLatencyMs.length > 0
      ? s.audioLatencyMs.reduce((a, b) => a + b, 0) / s.audioLatencyMs.length
      : 0;

  const transcriptAvgMs =
    s.transcriptLatencyMs.length > 0
      ? s.transcriptLatencyMs.reduce((a, b) => a + b, 0) /
        s.transcriptLatencyMs.length
      : 0;

  return { audioAvgMs, transcriptAvgMs };
}

export async function createLiveSession(
  callbacks: LiveSessionCallbacks,
  config?: LiveSessionConfig,
): Promise<string> {
  const id = `live_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const handle: SessionHandle = {
    id,
    session: null,
    isActive: true,
    isReady: false,

    lastPartial: "",
    lastTranscriptAt: Date.now(),
    transcriptLatencyMs: [],
    audioLatencyMs: [],

    sampleRate: clampSampleRate(config?.sampleRate, 16000),
    debug: config?.debug,

    callbacks,
  };

  sessions.set(id, handle);

  const ai = getAi(config?.apiKey);

  // ✅ Live model for streaming PCM
  const model =
    config?.model || "gemini-2.5-flash-native-audio-preview-12-2025";

  callbacks.onStatus?.("connecting", "Connecting to Gemini Live...");

  try {
    const session = await ai.live.connect({
      model,
      config: {
        // ✅ Must be AUDIO for native-audio live models
        responseModalities: [Modality.AUDIO],

        // IMPORTANT: must be empty object (no language field allowed)
        inputAudioTranscription: {},

        realtimeInputConfig: {
          automaticActivityDetection: { disabled: false },
        },
      },
      callbacks: {
        onopen: () => {
          const s = sessions.get(id);
          if (!s || !s.isActive) return;

          s.isReady = true;
          s.callbacks.onStatus?.("connected", "Live session connected");
        },

        onmessage: (raw: any) => {
          const s = sessions.get(id);
          if (!s || !s.isActive) return;

          const message = normalizeMessage(raw);

          if (s.debug) {
            console.log(
              "[Live DEBUG] message:",
              JSON.stringify(message).slice(0, 2000),
            );
          }

          const serverContent =
            message?.serverContent ??
            message?.server_content ??
            message?.data?.serverContent;

          if (!serverContent) return;

          // ✅ ONLY accept USER audio transcription.
          // Do NOT fall back to outputTranscription / modelTurn text.
          const inputTr =
            serverContent?.inputTranscription ??
            serverContent?.input_transcription;

          const text =
            typeof inputTr?.text === "string" ? inputTr.text : undefined;

          if (text !== undefined) {
            s.lastPartial = text;
            s.callbacks.onTranscriptPartial?.(text);
          }

          const turnComplete =
            serverContent?.turnComplete ??
            serverContent?.turn_complete ??
            false;

          if (turnComplete === true) {
            const finalText = (s.lastPartial || "").trim();
            s.lastPartial = "";

            // latency stats (optional)
            if (finalText) {
              const now = Date.now();
              pushBounded(s.transcriptLatencyMs, now - s.lastTranscriptAt);
              s.lastTranscriptAt = now;
            }

            // ✅ gate junk finals
            if (finalText && isGoodFinalTranscript(finalText)) {
              void s.callbacks.onTranscriptFinal?.(finalText);
            } else {
              // clear UI partial if your client shows it
              s.callbacks.onTranscriptPartial?.("");
            }
          }
        },

        onerror: (err: any) => {
          console.error("[Live] Gemini onerror raw:", err);

          const s = sessions.get(id);
          if (!s) return;

          s.isActive = false;
          s.isReady = false;

          const e =
            err instanceof Error ? err : new Error(err?.message || String(err));

          s.callbacks.onStatus?.("error", e.message);
          s.callbacks.onError?.(e);

          sessions.delete(id);
        },

        onclose: (e: any) => {
          console.error("[Live] Gemini onclose raw:", e);

          const s = sessions.get(id);
          if (!s) return;

          s.isActive = false;
          s.isReady = false;

          s.callbacks.onStatus?.("disconnected", "Live session closed");
          sessions.delete(id);
        },
      },
    });

    handle.session = session;
    return id;
  } catch (err: any) {
    sessions.delete(id);
    throw new Error(
      `Failed to create Live session: ${err?.message || String(err)}`,
    );
  }
}

export async function sendAudioChunk(
  sessionId: string,
  audioPcm16: Buffer,
): Promise<void> {
  const s = sessions.get(sessionId);

  if (!s || !s.isActive) {
    throw new Error(`Live session ${sessionId} not found or inactive`);
  }

  if (!s.session || !s.isReady) {
    // Startup window → silently drop
    return;
  }

  const start = Date.now();
  const base64 = audioPcm16.toString("base64");

  await s.session.sendRealtimeInput({
    audio: {
      data: base64,
      mimeType: `audio/pcm;rate=${s.sampleRate}`,
    },
  });

  pushBounded(s.audioLatencyMs, Date.now() - start);
}

export function closeLiveSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;

  s.isActive = false;
  s.isReady = false;

  try {
    s.session?.close?.();
  } catch (e) {
    console.error("[Live] close error:", e);
  } finally {
    sessions.delete(sessionId);
  }
}
