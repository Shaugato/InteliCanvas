import { reactive } from "vue";
import { CheetahWorker } from "@picovoice/cheetah-web";
import { WebVoiceProcessor } from "@picovoice/web-voice-processor";

type CheetahStatus = "disconnected" | "connecting" | "connected" | "error";

type CheetahStopOptions = {
  emitFinal?: boolean;
};

type CheetahTranscriptChunk = {
  transcript: string;
  isEndpoint: boolean;
};

interface CheetahState {
  status: CheetahStatus;
  partialTranscript: string;
  finalTranscript: string;
  error: string | null;
}

const DEFAULT_MODEL_PUBLIC_PATH = "/Cheetah/inteliCanvas-vocab-cheetah.pv";
const DEFAULT_ENDPOINT_DURATION_SEC = 1.0;
const DEFAULT_ENABLE_AUTOMATIC_PUNCTUATION = true;

const accessKey = (import.meta.env.VITE_PICOVOICE_ACCESS_KEY ?? "").trim();
const modelPublicPath =
  (
    import.meta.env.VITE_CHEETAH_MODEL_PATH ?? DEFAULT_MODEL_PUBLIC_PATH
  ).trim() || DEFAULT_MODEL_PUBLIC_PATH;
const endpointDurationSec = parseNumberEnv(
  import.meta.env.VITE_CHEETAH_ENDPOINT_DURATION_SEC,
  DEFAULT_ENDPOINT_DURATION_SEC,
);
const enableAutomaticPunctuation = parseBooleanEnv(
  import.meta.env.VITE_CHEETAH_AUTO_PUNCTUATION,
  DEFAULT_ENABLE_AUTOMATIC_PUNCTUATION,
);

const state = reactive<CheetahState>({
  status: "disconnected",
  partialTranscript: "",
  finalTranscript: "",
  error: null,
});

let worker: CheetahWorker | null = null;
let stopping = false;
let transcriptBuffer = "";

function parseNumberEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const normalized = raw.toLowerCase().trim();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function isBrowserVoiceSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.isSecureContext && navigator.mediaDevices?.getUserMedia,
  );
}

function appendTranscriptFragment(fragment: string): void {
  if (!fragment) return;
  transcriptBuffer += fragment;
  state.partialTranscript = transcriptBuffer.trim();
}

function emitFinalIfPresent(): void {
  const finalText = transcriptBuffer.trim();
  if (!finalText) return;
  state.finalTranscript = finalText;
  transcriptBuffer = "";
  state.partialTranscript = "";
}

function onTranscript(chunk: CheetahTranscriptChunk): void {
  appendTranscriptFragment(chunk.transcript ?? "");
  if (chunk.isEndpoint) {
    emitFinalIfPresent();
  }
}

export async function startCheetahSession(): Promise<void> {
  if (state.status === "connected" || state.status === "connecting") return;

  if (!isBrowserVoiceSupported()) {
    state.error =
      "Cheetah voice requires HTTPS (or localhost) and microphone access.";
    state.status = "error";
    return;
  }

  if (!accessKey) {
    state.error =
      "Missing VITE_PICOVOICE_ACCESS_KEY. Add it to your environment to enable Cheetah voice.";
    state.status = "error";
    return;
  }

  state.status = "connecting";
  state.error = null;
  state.partialTranscript = "";
  state.finalTranscript = "";
  transcriptBuffer = "";

  try {
    worker = await CheetahWorker.create(
      accessKey,
      onTranscript,
      {
        publicPath: modelPublicPath,
      },
      {
        endpointDurationSec,
        enableAutomaticPunctuation,
      },
    );

    await WebVoiceProcessor.subscribe(worker);
    state.status = "connected";
  } catch (err: any) {
    if (worker) {
      try {
        await worker.release();
      } catch {}
      worker = null;
    }

    const message =
      err?.message || "Failed to start Cheetah voice transcription.";
    state.error = message;
    state.status = "error";
  }
}

export async function stopCheetahSession(
  _reason = "client stop",
  options: CheetahStopOptions = {},
): Promise<void> {
  if (stopping) return;
  stopping = true;

  const emitFinal = options.emitFinal !== false;
  const activeWorker = worker;
  worker = null;

  try {
    if (activeWorker) {
      try {
        await WebVoiceProcessor.unsubscribe(activeWorker);
      } catch {}

      if (emitFinal) {
        try {
          const flushed = (await activeWorker.flush()) as unknown;
          if (typeof flushed === "string") {
            appendTranscriptFragment(flushed);
          } else if (flushed && typeof flushed === "object") {
            const typed = flushed as Partial<CheetahTranscriptChunk>;
            if (typed.transcript) {
              appendTranscriptFragment(typed.transcript);
            }
            if (typed.isEndpoint) {
              emitFinalIfPresent();
            }
          }
        } catch {
          // Keep stop flow resilient even if flush is unavailable.
        }
      }

      try {
        await activeWorker.release();
      } catch {}
    }

    if (emitFinal) {
      emitFinalIfPresent();
    } else {
      transcriptBuffer = "";
      state.partialTranscript = "";
    }
  } finally {
    state.status = "disconnected";
    stopping = false;
  }
}

export const cheetahStore = reactive({
  get status() {
    return state.status;
  },
  get partialTranscript() {
    return state.partialTranscript;
  },
  get finalTranscript() {
    return state.finalTranscript;
  },
  get error() {
    return state.error;
  },
  get isConnected() {
    return state.status === "connected";
  },
  get isSupported() {
    return isBrowserVoiceSupported();
  },
  get isConfigured() {
    return Boolean(accessKey);
  },
  get modelPath() {
    return modelPublicPath;
  },
  startCheetahSession,
  stopCheetahSession,
  clearFinalTranscript() {
    state.finalTranscript = "";
  },
  clearError() {
    state.error = null;
  },
});
