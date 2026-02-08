import { reactive } from "vue";
import { LiveServerToClientMessageSchema } from "@shared/liveWs";

type LiveStatus = "disconnected" | "connecting" | "connected" | "error";

interface LiveState {
  status: LiveStatus;
  socket: WebSocket | null;
  partialTranscript: string;
  finalTranscript: string;
  error: string | null;
}

const state = reactive<LiveState>({
  status: "disconnected",
  socket: null,
  partialTranscript: "",
  finalTranscript: "",
  error: null,
});

let audioContext: AudioContext | null = null;
let audioWorkletNode: AudioWorkletNode | null = null;
let mediaStream: MediaStream | null = null;
let zeroGain: GainNode | null = null;

let stopping = false;

function getLiveWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws-live`;
}

function cleanupAudioResources() {
  try {
    audioWorkletNode?.disconnect();
  } catch {}
  audioWorkletNode = null;

  try {
    zeroGain?.disconnect();
  } catch {}
  zeroGain = null;

  try {
    audioContext?.close();
  } catch {}
  audioContext = null;

  try {
    mediaStream?.getTracks().forEach((t) => t.stop());
  } catch {}
  mediaStream = null;
}

async function setupAudioPipeline() {
  // Secure context check (HTTPS or localhost)
  if (!window.isSecureContext) {
    throw new Error("Microphone requires a secure (HTTPS) connection");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access not available in this browser");
  }

  console.log("[LIVE] setupAudioPipeline: requesting microphone...");
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  console.log("[LIVE] setupAudioPipeline: microphone acquired");

  // Let browser choose real rate; we will send actual sampleRate (Option A)
  audioContext = new AudioContext();
  console.log("[LIVE] AudioContext sampleRate:", audioContext.sampleRate);

  await audioContext.audioWorklet.addModule("/audio/pcmWorklet.js");

  // Some browsers start suspended
  try {
    await audioContext.resume();
  } catch {}

  const source = audioContext.createMediaStreamSource(mediaStream);
  audioWorkletNode = new AudioWorkletNode(audioContext, "pcm-processor");

  zeroGain = audioContext.createGain();
  zeroGain.gain.value = 0;

  source.connect(audioWorkletNode);
  audioWorkletNode.connect(zeroGain);
  zeroGain.connect(audioContext.destination);

  audioWorkletNode.port.onmessage = (e: MessageEvent) => {
    const ws = state.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (state.status !== "connected") return;

    const msg = e.data;
    if (msg?.type === "audio_chunk" && msg.data instanceof ArrayBuffer) {
      try {
        ws.send(msg.data); // binary audio frame
      } catch (err) {
        console.error("[LIVE] ws.send failed:", err);
      }
    }
  };

  console.log("[LIVE] setupAudioPipeline: complete");
}

export async function startLiveSession(opts?: { model?: string }) {
  console.log("[LIVE] startLiveSession CALLED", opts);
  console.trace("[LIVE] startLiveSession STACK"); // ✅ catch double-starts
  // If a session is already running, stop it first (and invalidate old handlers)
  if (state.socket) stopLiveSession("restart");

  stopping = false;
  state.status = "connecting";
  state.error = null;
  state.partialTranscript = "";
  state.finalTranscript = "";

  // 1) audio first
  try {
    await setupAudioPipeline();
  } catch (err: any) {
    const name = err?.name || "UnknownError";
    const msg =
      err?.message || String(err) || "Failed to start microphone/worklet";
    console.error("[LIVE] setupAudioPipeline failed:", name, msg);
    state.error = `${name}: ${msg}`;
    state.status = "error";
    cleanupAudioResources();
    return;
  }

  // 2) open ws-live
  const ws = new WebSocket(getLiveWsUrl());
  ws.binaryType = "arraybuffer";
  state.socket = ws;

  // --- IMPORTANT: socket identity guard ---
  // All handlers below must ignore events from stale sockets.
  const isStale = () => state.socket !== ws;

  ws.onopen = () => {
    if (isStale()) return;
    console.log("[LIVE] ws.onopen");

    const sr = audioContext?.sampleRate; // Option A
    console.log("[LIVE] ws open, sending start_live, sampleRate=", sr);

    try {
      ws.send(
        JSON.stringify({
          type: "start_live",
          config: {
            model: opts?.model, // undefined -> omitted -> server default
            sampleRate: sr,
            language: navigator.language,
          },
        }),
      );
    } catch (err) {
      console.error("[LIVE] failed to send start_live:", err);
      state.error = "Failed to start Live session";
      state.status = "error";
      stopLiveSession("start_live send failed");
    }
  };

  ws.onmessage = (event) => {
    if (isStale()) return;

    try {
      const data = JSON.parse(event.data);
      const parsed = LiveServerToClientMessageSchema.safeParse(data);
      if (!parsed.success) return;

      const msg = parsed.data;

      switch (msg.type) {
        case "live_status":
          state.status = msg.status;
          break;

        case "transcript_partial":
          state.partialTranscript = msg.text;
          break;

        case "transcript_final":
          state.finalTranscript = msg.text;
          state.partialTranscript = "";
          window.setTimeout(() => {
            state.finalTranscript = "";
          }, 250);
          break;

        case "live_error":
          console.error("[LIVE] server live_error:", msg.error);
          state.error = msg.error;
          state.status = "error";
          stopLiveSession("server live_error");
          break;
      }
    } catch {
      // ignore
    }
  };

  ws.onerror = (e) => {
    if (isStale()) return;
    console.error("[LIVE] ws error:", e);
    state.error = "Live WebSocket error";
    state.status = "error";
  };

  ws.onclose = (ev) => {
    // If this ws is not the active one, ignore.
    if (isStale()) return;

    console.log(
      "[LIVE] ws.onclose code=",
      ev.code,
      "reason=",
      ev.reason,
      "wasClean=",
      ev.wasClean,
      "stopping=",
      stopping,
    );

    // If we didn't initiate it, cleanup
    if (!stopping) stopLiveSession("socket closed");
  };
}

export function stopLiveSession(reason = "client stop") {
  console.log("[LIVE] stopLiveSession CALLED reason=", reason);
  console.trace("[LIVE] stopLiveSession STACK"); // ✅ this prints the caller stack

  if (stopping) return;
  stopping = true;

  // Detach active socket FIRST so stale events can’t kill a new session later
  const ws = state.socket;
  state.socket = null;

  try {
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "stop_live" }));
        } catch {}
      }
      try {
        ws.close(1000, reason);
      } catch {
        try {
          ws.close();
        } catch {}
      }
    }
  } finally {
    cleanupAudioResources();
    state.status = "disconnected";
    state.partialTranscript = "";
    state.finalTranscript = "";
    // keep state.error for overlay visibility
    stopping = false;
  }
}

export const liveStore = reactive({
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
  startLiveSession,
  stopLiveSession,
});
