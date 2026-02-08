import { reactive, ref, computed } from "vue";
import type { SceneGraph } from "@shared/scene";
import type {
  ServerToClientMessage,
  ClientToServerMessage,
  SessionEvent,
} from "@shared/ws";
import { ServerToClientMessageSchema } from "@shared/ws";
import { CommandEnvelopeSchema } from "@shared/index";
import { createEmptyScene } from "./reducer";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface WsState {
  scene: SceneGraph;
  sessionEvents: SessionEvent[];
  activePreviewIds: string[];
  revision: number;
  status: ConnectionStatus;
  lastTranscript: string;
  lastError: string | null;
}

const state = reactive<WsState>({
  scene: createEmptyScene(),
  sessionEvents: [],
  activePreviewIds: [],
  revision: 0,
  status: "disconnected",
  lastTranscript: "",
  lastError: null,
});

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const RECONNECT_DELAY = 2000;

function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function connect(): void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  state.status = "connecting";
  state.lastError = null;

  try {
    socket = new WebSocket(getWsUrl());

    socket.onopen = () => {
      console.log("[WS] Connected");
      state.status = "connected";
      state.lastError = null;
    };

    socket.onclose = (e) => {
      console.log("[WS] Disconnected");
      state.status = "disconnected";
      socket = null;
      // Only reconnect on abnormal closures, not intentional ones
      if (e.code !== 1000 && e.code !== 1001) {
        scheduleReconnect();
      }
    };

    socket.onerror = (e) => {
      console.error("[WS] Error:", e);
      state.status = "error";
      state.lastError = "Connection error";
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const parsed = ServerToClientMessageSchema.safeParse(data);

        if (!parsed.success) {
          console.error("[WS] Invalid message:", parsed.error);
          return;
        }

        handleMessage(parsed.data);
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };
  } catch (e) {
    console.error("[WS] Failed to connect:", e);
    state.status = "error";
    state.lastError = "Failed to connect";
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  reconnectTimer = setTimeout(() => {
    console.log("[WS] Attempting reconnect...");
    connect();
  }, RECONNECT_DELAY);
}

function handleMessage(msg: ServerToClientMessage): void {
  switch (msg.type) {
    case "scene_update":
      state.scene = msg.sceneGraph;
      state.sessionEvents = msg.sessionEvents;
      state.activePreviewIds = msg.activePreviewIds;
      state.revision = msg.revision;
      break;

    case "transcript_partial":
    case "transcript_final":
      state.lastTranscript = msg.text;
      break;

    case "command_envelope":
      break;

    case "status":
      console.log(`[WS] Status: ${msg.message}`);
      break;

    case "error":
      console.error(`[WS] Error: ${msg.message}`);
      state.lastError = msg.message;
      break;

    case "pong":
      break;
  }
}

function send(message: ClientToServerMessage): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("[WS] Not connected, cannot send");
    return false;
  }

  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch (e) {
    console.error("[WS] Send error:", e);
    return false;
  }
}

function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  state.status = "disconnected";
}

export const wsStore = reactive({
  get scene() {
    return state.scene;
  },
  get sessionEvents() {
    return state.sessionEvents;
  },
  get activePreviewIds() {
    return state.activePreviewIds;
  },
  get revision() {
    return state.revision;
  },
  get status() {
    return state.status;
  },
  get lastTranscript() {
    return state.lastTranscript;
  },
  get lastError() {
    return state.lastError;
  },
  get isConnected() {
    return state.status === "connected";
  },

  connect,
  disconnect,
  send,

  submitUtterance(utterance: string): boolean {
    return send({ type: "submit_utterance", utterance });
  },

  applyCommandEnvelope(envelopeJsonOrObj: unknown, label?: string): boolean {
    const parsed = CommandEnvelopeSchema.safeParse(envelopeJsonOrObj);
    if (!parsed.success) {
      console.error("[WS] Invalid envelope, not sending:", parsed.error);
      state.lastError = "Invalid CommandEnvelope (client-side)";
      return false;
    }
    return send({
      type: "apply_command_envelope",
      envelope: parsed.data,
      label,
    });
  },

  resetScene(): boolean {
    return send({ type: "reset_scene" });
  },

  ping(): boolean {
    return send({ type: "ping" });
  },
});
