// server/deepgram/liveSession.ts
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

export type LiveStatus = "connecting" | "connected" | "disconnected" | "error";

export interface LiveSessionConfig {
  apiKey?: string;
  model?: string; // default nova-2
  sampleRate?: number;
  language?: string; // e.g. "en-US"
  debug?: boolean;

  // Optional tuning overrides (safe-clamped)
  endpointing?: number; // ms silence for speech_final
  utteranceEndMs?: number; // ms after last word for UtteranceEnd
}

export interface LiveSessionCallbacks {
  onStatus?: (status: LiveStatus, message?: string) => void;
  onTranscriptPartial?: (text: string) => void;
  onTranscriptFinal?: (text: string) => Promise<void> | void;
  onError?: (err: Error) => void;
}

interface SessionHandle {
  id: string;
  connection: DeepgramConnection | null;
  isActive: boolean;
  isReady: boolean;

  lastPartial: string;
  lastTranscriptAt: number; // last time we saw any transcript text (partial/final)

  // latency metrics
  lastFinalAt: number | null;
  transcriptLatencyMs: number[];
  audioLatencyMs: number[];

  sampleRate: number;
  language: string;
  model: string;
  debug?: boolean;

  callbacks: LiveSessionCallbacks;

  chunksSent: number;
  bytesSent: number;

  hasLoggedErrorObject: boolean;

  // prevent double-finalization race (UtteranceEnd + watchdog + final)
  finalizing: boolean;
}

const sessions = new Map<string, SessionHandle>();

// If Deepgram never sends speech_final, promote partial after this silence.
const AUTO_FINAL_SILENCE_MS = 4500;
const AUTO_FINAL_TICK_MS = 500;

// ---- typing without relying on a specific exported name
type DeepgramClient = ReturnType<typeof createClient>;
type DeepgramConnection = ReturnType<DeepgramClient["listen"]["live"]>;

function mustGetDeepgram(apiKey?: string) {
  const key = apiKey || process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY environment variable is not set");
  return createClient(key);
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

function pickLanguage(input?: string): string {
  const raw = (input || "").trim();
  if (!raw) return "en-US";
  const first = raw.split(",")[0]?.trim();
  return first || "en-US";
}

function isGoodFinalTranscript(t: string): boolean {
  const s = (t || "").trim();
  if (!s) return false;
  if (s === "<noise>" || s.startsWith("<noise>")) return false;
  if (s.length < 3) return false;
  return true;
}

// Deepgram can be picky about some param ranges (you saw 400s).
// These clamps avoid known-bad aggressive settings.
function clampEndpointing(ms: number | undefined): number {
  const v =
    typeof ms === "number" && Number.isFinite(ms) ? Math.round(ms) : 350;
  // keep it in a conservative, “known good” range
  return Math.min(2000, Math.max(300, v));
}

function clampUtteranceEndMs(ms: number | undefined): number {
  const v =
    typeof ms === "number" && Number.isFinite(ms) ? Math.round(ms) : 1200;
  // keep it >= 1000ms (aggressive values sometimes trigger 400)
  return Math.min(5000, Math.max(1000, v));
}

function finalizeFromPartial(s: SessionHandle, reason: string) {
  if (!s.isActive || s.finalizing) return;
  const t = (s.lastPartial || "").trim();
  if (!t) return;

  s.finalizing = true;

  // clear partial first to avoid double sends
  s.lastPartial = "";
  s.callbacks.onTranscriptPartial?.("");

  const now = Date.now();
  if (s.lastFinalAt != null)
    pushBounded(s.transcriptLatencyMs, now - s.lastFinalAt);
  s.lastFinalAt = now;

  if (!isGoodFinalTranscript(t)) {
    if (s.debug)
      console.log(
        `[DG DEBUG] finalizeFromPartial dropped junk reason=${reason} text="${t}"`,
      );
    s.finalizing = false;
    return;
  }

  if (s.debug)
    console.log(`[DG DEBUG] finalizeFromPartial reason=${reason} text="${t}"`);
  void s.callbacks.onTranscriptFinal?.(t);

  // allow future finals
  s.finalizing = false;
}

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

// ---- watchdog: promote partial after silence
setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) {
    if (!s.isActive || !s.isReady) continue;
    if (!s.lastPartial) continue;

    const since = now - s.lastTranscriptAt;
    if (since >= AUTO_FINAL_SILENCE_MS) {
      finalizeFromPartial(s, `watchdog_${since}ms`);
    }
  }
}, AUTO_FINAL_TICK_MS);

export async function createLiveSession(
  callbacks: LiveSessionCallbacks,
  config?: LiveSessionConfig,
): Promise<string> {
  const id = `live_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const sampleRate = clampSampleRate(config?.sampleRate, 16000);
  const language = pickLanguage(config?.language);
  const model = (config?.model || "nova-3").trim();

  const endpointing = clampEndpointing(config?.endpointing);
  const utteranceEndMs = clampUtteranceEndMs(config?.utteranceEndMs);

  const handle: SessionHandle = {
    id,
    connection: null,
    isActive: true,
    isReady: false,

    lastPartial: "",
    lastTranscriptAt: Date.now(),

    lastFinalAt: null,
    transcriptLatencyMs: [],
    audioLatencyMs: [],

    sampleRate,
    language,
    model,
    debug: config?.debug,

    callbacks,

    chunksSent: 0,
    bytesSent: 0,

    hasLoggedErrorObject: false,
    finalizing: false,
  };

  sessions.set(id, handle);

  callbacks.onStatus?.("connecting", "Connecting to Deepgram Live STT...");

  const deepgram = mustGetDeepgram(config?.apiKey);

  console.log(
    `[DG] create session id=${id} model=${model} lang=${language} sr=${sampleRate} endpointing=${endpointing} utterance_end_ms=${utteranceEndMs}`,
  );

  const connection = deepgram.listen.live({
    model,
    language,
    encoding: "linear16",
    sample_rate: sampleRate,
    channels: 1,

    interim_results: true,

    vad_events: true,

    // These are the knobs that control when Deepgram considers speech finished. :contentReference[oaicite:1]{index=1}
    endpointing,
    utterance_end_ms: utteranceEndMs,

    punctuate: true,
    smart_format: true,
  } as any);

  handle.connection = connection;

  connection.on(LiveTranscriptionEvents.Open, () => {
    const s = sessions.get(id);
    if (!s || !s.isActive) return;

    s.isReady = true;
    s.callbacks.onStatus?.("connected", "Deepgram Live connected");
    console.log(`[DG] open id=${id}`);
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
    const s = sessions.get(id);
    if (!s || !s.isActive) return;

    const alt = data?.channel?.alternatives?.[0];
    const text = typeof alt?.transcript === "string" ? alt.transcript : "";
    if (!text) return;

    const now = Date.now();
    s.lastTranscriptAt = now;

    const isFinal = Boolean(data?.is_final || data?.speech_final);

    if (s.debug) {
      console.log(
        `[DG DEBUG] transcript id=${id} final=${isFinal} is_final=${Boolean(data?.is_final)} speech_final=${Boolean(
          data?.speech_final,
        )} text="${text.slice(0, 160)}"`,
      );
    }

    if (!isFinal) {
      s.lastPartial = text;
      s.callbacks.onTranscriptPartial?.(text);
      return;
    }

    // FINAL from Deepgram
    s.lastPartial = "";
    s.callbacks.onTranscriptPartial?.("");

    if (s.lastFinalAt != null)
      pushBounded(s.transcriptLatencyMs, now - s.lastFinalAt);
    s.lastFinalAt = now;

    const finalText = text.trim();
    if (!isGoodFinalTranscript(finalText)) return;

    void s.callbacks.onTranscriptFinal?.(finalText);
  });

  // If Deepgram emits UtteranceEnd, treat it as “user paused, send it now”
  // (This is exactly what utterance_end_ms is for). :contentReference[oaicite:2]{index=2}
  connection.on(LiveTranscriptionEvents.UtteranceEnd as any, (data: any) => {
    const s = sessions.get(id);
    if (!s || !s.isActive) return;

    if (s.debug) {
      console.log(
        `[DG DEBUG] utterance_end id=${id} data=${JSON.stringify(data).slice(0, 300)}`,
      );
    }

    // Promote whatever partial we have (if Deepgram didn't mark it final)
    finalizeFromPartial(s, "utterance_end");
  });

  connection.on(LiveTranscriptionEvents.Error, (err: any) => {
    console.error(`[DG] error id=${id} message=${err?.message || String(err)}`);

    const s = sessions.get(id);
    if (!s) return;

    if (!s.hasLoggedErrorObject) {
      s.hasLoggedErrorObject = true;
      try {
        console.error("[DG] error object:", JSON.stringify(err).slice(0, 2000));
      } catch {}
    }

    s.isActive = false;
    s.isReady = false;

    const e =
      err instanceof Error ? err : new Error(err?.message || String(err));
    s.callbacks.onStatus?.("error", e.message);
    s.callbacks.onError?.(e);

    try {
      s.connection?.finish?.();
    } catch {}

    sessions.delete(id);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log(`[DG] close id=${id}`);

    const s = sessions.get(id);
    if (!s) return;

    s.isActive = false;
    s.isReady = false;

    s.callbacks.onStatus?.("disconnected", "Deepgram session closed");
    sessions.delete(id);
  });

  return id;
}

export async function sendAudioChunk(
  sessionId: string,
  audioPcm16: Buffer,
): Promise<void> {
  const s = sessions.get(sessionId);
  if (!s || !s.isActive)
    throw new Error(`Live session ${sessionId} not found or inactive`);

  if (!s.connection || !s.isReady) return;

  const start = Date.now();

  s.connection.send(audioPcm16);

  s.chunksSent++;
  s.bytesSent += audioPcm16.length;

  pushBounded(s.audioLatencyMs, Date.now() - start);

  if (s.debug && s.chunksSent % 50 === 0) {
    const lat = getSessionLatency(sessionId);
    console.log(
      `[DG DEBUG] id=${sessionId} chunks=${s.chunksSent} bytes=${s.bytesSent} audioAvg=${lat.audioAvgMs.toFixed(
        0,
      )}ms transcriptAvg=${lat.transcriptAvgMs.toFixed(0)}ms`,
    );
  }
}

export function closeLiveSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;

  console.log(`[DG] closeLiveSession id=${sessionId}`);

  s.isActive = false;
  s.isReady = false;

  try {
    s.connection?.finish?.();
  } catch {
    try {
      (s.connection as any)?.close?.();
    } catch {}
  } finally {
    sessions.delete(sessionId);
  }
}
