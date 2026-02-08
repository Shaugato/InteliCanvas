import { reactive } from "vue";

type SpeechState = {
  isSupported: boolean;

  // Desired listening state (what the user toggled)
  wantListening: boolean;

  // Actual engine state (what the browser reports)
  isListening: boolean;

  interimTranscript: string;
  finalTranscript: string;

  error: string | null;

  // For silence segmentation / debugging
  lastResultAt: number;
  lastFinalAt: number;
  lastFinalText: string;
};

const SILENCE_MS = 700;
const RESTART_DELAY_MS = 250;

const state = reactive<SpeechState>({
  isSupported: false,
  wantListening: false,
  isListening: false,
  interimTranscript: "",
  finalTranscript: "",
  error: null,
  lastResultAt: 0,
  lastFinalAt: 0,
  lastFinalText: "",
});

let recognition: any = null;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

function clearSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function clearRestartTimer() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function getSpeechCtor(): any | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function mapError(errCode: string): string {
  switch (errCode) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission denied. Please allow mic access in browser settings.";
    case "audio-capture":
      return "No microphone detected. Please connect a microphone and try again.";
    case "no-speech":
      return "No speech detected. Try speaking a bit louder or closer to the microphone.";
    case "network":
      return "Speech recognition network error. Try again or use manual input.";
    case "aborted":
      return "Speech recognition was aborted.";
    default:
      return `Speech recognition error: ${errCode || "unknown"}`;
  }
}

function initRecognition() {
  const Ctor = getSpeechCtor();
  state.isSupported = !!Ctor;

  if (!Ctor || recognition) return;

  recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;

  // Better for AU demo environment; change if you want.
  recognition.lang = "en-AU";

  recognition.onstart = () => {
    state.isListening = true;
    state.error = null;
  };

  recognition.onend = () => {
    state.isListening = false;

    // Browser engines end frequently; restart only if user still wants it
    if (state.wantListening) {
      scheduleRestart(RESTART_DELAY_MS);
    }
  };

  recognition.onerror = (e: any) => {
    const code = String(e?.error ?? "");
    state.isListening = false;
    state.error = mapError(code);

    // If user still wants listening, some errors can recover by restarting
    // But if permission is denied, don't loop forever.
    if (state.wantListening) {
      if (code === "not-allowed" || code === "service-not-allowed") {
        state.wantListening = false;
        return;
      }
      scheduleRestart(800);
    }
  };

  recognition.onresult = (event: any) => {
    const now = Date.now();
    state.lastResultAt = now;

    let interim = "";
    let final = "";

    // Build up interim/final fragments from this event batch
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const text = String(res?.[0]?.transcript ?? "");
      if (!text) continue;

      if (res.isFinal) final += text + " ";
      else interim += text;
    }

    const finalTrim = final.trim();
    const interimTrim = interim.trim();

    // If browser delivered a final segment, emit immediately
    if (finalTrim) {
      clearSilenceTimer();
      state.interimTranscript = "";
      emitFinal(finalTrim);
      return;
    }

    // Otherwise update interim + silence segmentation
    if (interimTrim) {
      state.interimTranscript = interimTrim;

      clearSilenceTimer();
      silenceTimer = setTimeout(() => {
        // If we have interim text and user paused, treat it as a final utterance
        const t = state.interimTranscript.trim();
        if (t) {
          state.interimTranscript = "";
          emitFinal(t);
        }
      }, SILENCE_MS);
    }
  };
}

function scheduleRestart(delayMs: number) {
  clearRestartTimer();

  restartTimer = setTimeout(() => {
    if (!state.wantListening) return;

    // If it's already listening, don't restart
    if (state.isListening) return;

    try {
      recognition?.start?.();
    } catch {
      // Some browsers throw InvalidStateError if start() is called too quickly
      // Just try again shortly if user still wants it.
      if (state.wantListening) scheduleRestart(600);
    }
  }, delayMs);
}

function emitFinal(text: string) {
  const now = Date.now();

  // Basic duplicate suppression (helps some engines that repeat finals)
  const sameAsLast =
    text.trim().toLowerCase() === state.lastFinalText.toLowerCase();
  if (sameAsLast && now - state.lastFinalAt < 900) return;

  state.lastFinalText = text.trim();
  state.lastFinalAt = now;
  state.finalTranscript = text.trim();
}

export const speechStore = reactive({
  get isSupported() {
    // Lazy-init so we don’t touch window at import time in weird contexts
    if (!recognition) initRecognition();
    return state.isSupported;
  },
  get wantListening() {
    return state.wantListening;
  },
  get isListening() {
    return state.isListening;
  },
  get interimTranscript() {
    return state.interimTranscript;
  },
  get finalTranscript() {
    return state.finalTranscript;
  },
  get error() {
    return state.error;
  },

  startListening() {
    initRecognition();
    if (!state.isSupported) {
      state.error =
        "Voice mode not supported in this browser. Use Chrome/Edge/Safari.";
      return;
    }

    state.error = null;
    state.wantListening = true;

    // If already listening, no-op
    if (state.isListening) return;

    try {
      recognition.start();
    } catch {
      // If start() fails (InvalidStateError), schedule a restart
      scheduleRestart(400);
    }
  },

  stopListening() {
    state.wantListening = false;
    clearSilenceTimer();
    clearRestartTimer();

    // Keep transcripts visible, but stop engine
    if (!recognition) return;

    try {
      recognition.stop();
    } catch {
      // ignore
    }
  },

  clearTranscripts() {
    state.interimTranscript = "";
    state.finalTranscript = "";
  },

  clearFinal() {
    state.finalTranscript = "";
  },

  setLanguage(lang: string) {
    initRecognition();
    if (recognition) {
      recognition.lang = lang;
    }
  },
});
