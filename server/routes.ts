import type { Express } from "express";
import { type Server } from "http";
import WebSocket, { WebSocketServer } from "ws";
import type { RawData } from "ws";
import { randomUUID } from "crypto";
import type { SceneGraph, SceneObject } from "../shared/scene";
import {
  ClientToServerMessageSchema,
  CommandEnvelopeSchema,
  type ServerToClientMessage,
  type SessionEvent,
} from "../shared/index";
import { createEmptyScene, applyCommands } from "./reducer";
import { classifyIntent } from "./gemini/router";
import { generateCommandEnvelope } from "./gemini/commandDirector";
import { initGeminiCache } from "./gemini/cache";
import {
  canonicalizeVoiceTranscript,
  isVoiceCanonicalizationEnabled,
  type VoiceCanonicalizationResult,
} from "./voice/canonicalizer";

// Phase 8 (Live)
import {
  LiveClientToServerMessageSchema,
  type LiveServerToClientMessage,
} from "../shared/liveWs";
import {
  createLiveSession,
  sendAudioChunk,
  closeLiveSession,
  getSessionLatency,
} from "./deepgram/liveSession";

interface CanonicalState {
  sceneGraph: SceneGraph;
  sessionEvents: SessionEvent[];
  activePreviewIds: Set<string>;
  revision: number;
  lastTouchedObjectId: string | null;
}

const canonical: CanonicalState = {
  sceneGraph: createEmptyScene(),
  sessionEvents: [],
  activePreviewIds: new Set(),
  revision: 0,
  lastTouchedObjectId: null,
};

const clients = new Set<WebSocket>();

function rawDataToBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (Array.isArray(raw)) return Buffer.concat(raw);
  // Fallback (shouldn't happen with ws RawData, but keeps runtime safe)
  return Buffer.from(String(raw));
}

function safeSend(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (e) {
      console.error("Error sending message:", e);
    }
  }
}

function broadcast(message: ServerToClientMessage): void {
  const serialized = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(serialized);
      } catch (e) {
        console.error("Error broadcasting:", e);
      }
    }
  }
}

function getActivePreviewIds(): string[] {
  const ids: string[] = [];
  for (const [id, obj] of Object.entries(canonical.sceneGraph.objects)) {
    if (obj.status === "preview") ids.push(id);
  }
  return ids;
}

function buildSceneSummary(): string {
  const objects = canonical.sceneGraph.objects;
  const order = canonical.sceneGraph.order;
  if (order.length === 0) return "";

  const lines: string[] = [];
  for (const id of order) {
    const obj = objects[id];
    if (!obj) continue;
    const { transform, layer, status, semanticTag, shapes } = obj;
    lines.push(
      `${id}: tag=${semanticTag || "none"}, layer=${layer}, status=${status}, pos=(${transform.x.toFixed(
        1,
      )},${transform.y.toFixed(1)}), scale=${transform.scale.toFixed(
        2,
      )}, shapes=${shapes.length}`,
    );
  }

  if (canonical.sceneGraph.intent) {
    lines.push(`intent: ${canonical.sceneGraph.intent.description}`);
  }

  return lines.join("\n");
}

function buildPreviewContext(): string {
  const previews = canonical.sceneGraph.order
    .map((id) => canonical.sceneGraph.objects[id])
    .filter((o): o is SceneObject => !!o && o.status === "preview");

  const last = canonical.lastTouchedObjectId;
  const lastObj = last ? canonical.sceneGraph.objects[last] : undefined;

  const lines: string[] = [];
  lines.push(
    `LastTouchedObjectId=${last ?? "none"}${
      lastObj
        ? ` (tag=${lastObj.semanticTag ?? "none"}, status=${lastObj.status})`
        : ""
    }`,
  );

  if (previews.length === 0) {
    lines.push("Active previews: none.");
    lines.push(
      `Target rule: If user says "it/that/this", and LastTouchedObjectId exists, use it. Otherwise refuse.`,
    );
    lines.push(`Commit rule: If no previews exist, "commit" should refuse.`);
    return lines.join("\n");
  }

  lines.push(
    `Active previews (${previews.length}): ` +
      previews.map((p) => `${p.id}(tag=${p.semanticTag ?? "none"})`).join(", "),
  );

  lines.push(`Target rules:`);
  lines.push(
    `- For move/scale/rotate edits ("move it", "make it bigger"): target LastTouchedObjectId if it exists.`,
  );
  lines.push(
    `- For preview-only actions (commit/cancel/update_preview): target a PREVIEW object only.`,
  );
  lines.push(`- If user says "commit/finish" with no noun:`);
  lines.push(
    `  - If LastTouchedObjectId exists AND it is a preview, commit it.`,
  );
  lines.push(`  - Else if exactly 1 preview exists, commit that preview.`);
  lines.push(
    `  - Else if multiple previews exist, require a noun/tag (e.g., "commit the mountain") or refuse.`,
  );
  lines.push(
    `- If user says "commit the <tag>": choose the most recently-added preview with semanticTag=<tag> (latest in scene.order).`,
  );
  lines.push(`- If still ambiguous, refuse with refused=true.`);

  return lines.join("\n");
}

function sendSceneUpdate(ws?: WebSocket): void {
  const message: ServerToClientMessage = {
    type: "scene_update",
    sceneGraph: canonical.sceneGraph,
    sessionEvents: canonical.sessionEvents,
    activePreviewIds: Array.from(canonical.activePreviewIds),
    revision: canonical.revision,
  };

  if (ws) safeSend(ws, message);
  else broadcast(message);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  await initGeminiCache();
  console.log("[registerRoutes] Gemini cache initialized");
  const voiceCanonicalizationEnabled = isVoiceCanonicalizationEnabled();
  console.log(
    `[registerRoutes] voice canonicalization demo mode=${voiceCanonicalizationEnabled ? "on" : "off"}`,
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // ---------------------------
  // Existing WS: /ws (using noServer to avoid upgrade conflicts with Vite HMR)
  // ---------------------------
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws, req) => {
    console.log("[WS] Client connected");
    clients.add(ws);

    sendSceneUpdate(ws);
    safeSend(ws, { type: "status", message: "connected", level: "info" });

    ws.on("message", (rawMessage) => {
      try {
        const data = JSON.parse(rawDataToBuffer(rawMessage as any).toString());
        const parsed = ClientToServerMessageSchema.safeParse(data);

        if (!parsed.success) {
          safeSend(ws, {
            type: "error",
            message: "Invalid message format",
            code: "INVALID_MESSAGE",
          });
          return;
        }

        const msg = parsed.data;

        switch (msg.type) {
          case "ping":
            safeSend(ws, { type: "pong" });
            break;

          case "submit_utterance":
            void handleSubmitUtterance(msg.utterance, msg.clientEventId);
            break;

          case "apply_command_envelope":
            handleApplyCommandEnvelope(msg.envelope, msg.label);
            break;

          case "reset_scene":
            handleResetScene();
            break;

          case "request_director_pass":
            safeSend(ws, {
              type: "status",
              message: "Director pass not yet implemented",
              level: "info",
            });
            break;

          case "toggle_textures":
            safeSend(ws, {
              type: "status",
              message: `Textures ${msg.enabled ? "enabled" : "disabled"}`,
              level: "info",
            });
            break;

          case "final_render":
            safeSend(ws, {
              type: "status",
              message: "Final render not yet implemented",
              level: "info",
            });
            break;
        }
      } catch (e) {
        console.error("Error parsing message", e);
        safeSend(ws, {
          type: "error",
          message: e instanceof Error ? e.message : "Parse error",
          code: "PARSE_ERROR",
        });
      }
    });

    ws.on("close", () => {
      console.log("[WS] Client disconnected");
      clients.delete(ws);
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      clients.delete(ws);
    });
  });

  // ---------------------------
  // Phase 8 WS: /ws-live (using noServer to avoid upgrade conflicts)
  // ---------------------------
  const wssLive = new WebSocketServer({ noServer: true });

  wssLive.on("connection", (ws) => {
    console.log("[Live] Client connected");
    let sessionId: string | null = null;

    const safeSendLive = (message: LiveServerToClientMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
        } catch (e) {
          console.error("[Live] Send error:", e);
        }
      }
    };

    ws.on("message", async (raw: RawData, isBinary: boolean) => {
      try {
        //  Binary frames = audio PCM16
        if (isBinary) {
          if (!sessionId) return;

          const sid = sessionId; // snapshot
          const buf = rawDataToBuffer(raw);

          try {
            await sendAudioChunk(sid, buf);
          } catch (e: any) {
            const msg = e?.message || String(e);
            console.error("[Live] sendAudioChunk failed:", msg);

            if (
              msg.includes("not found or inactive") ||
              msg.includes("inactive") ||
              msg.includes("not found")
            ) {
              sessionId = null;
            }
          }

          return;
        }

        // ✅ Text frames = JSON control
        const text = rawDataToBuffer(raw).toString("utf8");
        const parsedJson = JSON.parse(text);
        const parsed = LiveClientToServerMessageSchema.safeParse(parsedJson);

        if (!parsed.success) {
          safeSendLive({
            type: "live_error",
            error: "Invalid message format",
            code: "INVALID_MESSAGE",
          });
          return;
        }

        const msg = parsed.data;

        switch (msg.type) {
          case "ping_live":
            safeSendLive({ type: "pong_live" });
            break;

          case "start_live": {
            console.log(
              "[Live] Received start_live, config:",
              JSON.stringify(msg.config || {}),
            );

            if (sessionId) {
              closeLiveSession(sessionId);
              sessionId = null;
            }

            safeSendLive({
              type: "live_status",
              status: "connecting",
              message: "Starting Live session...",
            });

            const requestedModel = msg.config?.model;
            const sampleRate = msg.config?.sampleRate;
            const language = msg.config?.language;

            console.log(
              "[Live] Creating session with model:",
              requestedModel || "default",
              "sampleRate:",
              sampleRate,
            );

            try {
              sessionId = await createLiveSession(
                {
                  onStatus: (status, message) => {
                    safeSendLive({ type: "live_status", status, message });
                  },
                  onTranscriptPartial: (t) => {
                    safeSendLive({
                      type: "transcript_partial",
                      text: t,
                      timestamp: Date.now(),
                    });
                  },
                  onTranscriptFinal: async (t) => {
                    const rawTranscript = t.trim();
                    if (!rawTranscript) return;

                    const sid = sessionId;
                    if (sid) {
                      const lat = getSessionLatency(sid);
                      console.log(
                        `[Live] Final transcript="${rawTranscript}" audioAvg=${lat.audioAvgMs.toFixed(
                          0,
                        )}ms transcriptAvg=${lat.transcriptAvgMs.toFixed(0)}ms`,
                      );
                    }

                    let utteranceForPipeline = rawTranscript;
                    if (voiceCanonicalizationEnabled) {
                      const mapped = canonicalizeVoiceTranscript(
                        rawTranscript,
                        canonical.sceneGraph,
                      );

                      console.log(
                        `[Live] canonicalization decision=${mapped.decision} confidence=${mapped.confidence} match="${mapped.canonicalUtterance ?? "none"}" normalized="${mapped.normalizedUtterance}"`,
                      );

                      if (
                        mapped.decision === "accept" &&
                        mapped.canonicalUtterance
                      ) {
                        utteranceForPipeline = mapped.canonicalUtterance;
                      } else {
                        safeSendLive({
                          type: "transcript_final",
                          text: rawTranscript,
                          timestamp: Date.now(),
                        });
                        recordVoiceCanonicalizationRepeat(
                          rawTranscript,
                          mapped,
                        );
                        return;
                      }
                    }

                    safeSendLive({
                      type: "transcript_final",
                      text: utteranceForPipeline,
                      timestamp: Date.now(),
                    });

                    try {
                      await handleSubmitUtterance(utteranceForPipeline);
                    } catch (err: any) {
                      console.error(
                        "[Live] handleSubmitUtterance failed:",
                        err,
                      );
                      safeSendLive({
                        type: "live_error",
                        error: "Failed to process command",
                        code: "COMMAND_PROCESSING_ERROR",
                      });
                    }
                  },
                  onError: (err) => {
                    safeSendLive({
                      type: "live_error",
                      error: err.message,
                      code: "SESSION_ERROR",
                    });
                    // important: don’t keep a “dead” sessionId
                    sessionId = null;
                  },
                },
                { model: requestedModel, sampleRate, language } as any,
              );
            } catch (err: any) {
              console.error(
                "[Live] createLiveSession failed:",
                err?.message,
                err?.stack,
              );
              sessionId = null;
              safeSendLive({
                type: "live_error",
                error: err?.message || "Failed to start Live session",
                code: "SESSION_CREATION_ERROR",
              });
              safeSendLive({
                type: "live_status",
                status: "error",
                message: "Live session failed to start",
              });
            }

            break;
          }

          case "stop_live":
            if (sessionId) {
              closeLiveSession(sessionId);
              sessionId = null;
            }
            safeSendLive({
              type: "live_status",
              status: "disconnected",
              message: "Live session stopped",
            });
            break;

          case "audio_chunk": {
            // optional fallback base64 path
            if (!sessionId) {
              safeSendLive({
                type: "live_error",
                error: "Session not started",
                code: "NO_SESSION",
              });
              return;
            }
            const buf = Buffer.from(msg.data, "base64");
            try {
              await sendAudioChunk(sessionId, buf);
            } catch (err: any) {
              const m = String(err?.message || "");
              if (
                m.startsWith("SESSION_NOT_READY:") ||
                m.startsWith("SESSION_INACTIVE:")
              ) {
                return;
              }
              throw err;
            }
            break;
          }
        }
      } catch (e: any) {
        console.error("[Live] Message error:", e);
        safeSendLive({
          type: "live_error",
          error: e?.message || "Unknown error",
          code: "PROCESSING_ERROR",
        });
      }
    });

    ws.on("close", (code, reason) => {
      console.log(
        `[Live] Client disconnected code=${code} reason="${reason?.toString() || ""}"`,
      );
      if (sessionId) closeLiveSession(sessionId);
      sessionId = null;
    });

    ws.on("error", (err) => {
      console.error("[Live] WebSocket error:", err);
      if (sessionId) closeLiveSession(sessionId);
      sessionId = null;
    });
  });

  // Handle HTTP upgrade manually to route to correct WebSocket server
  // This avoids conflicts with Vite HMR which also listens to upgrade events
  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(
      request.url || "",
      `http://${request.headers.host}`,
    ).pathname;

    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else if (pathname === "/ws-live") {
      wssLive.handleUpgrade(request, socket, head, (ws) => {
        wssLive.emit("connection", ws, request);
      });
    }
    // Other paths (like /vite-hmr) are handled by Vite's upgrade handler
  });

  return httpServer;
}

function recordVoiceCanonicalizationRepeat(
  utterance: string,
  result: VoiceCanonicalizationResult,
): void {
  const topSuggestions = result.suggestions.slice(0, 3);
  const suggestionSuffix =
    topSuggestions.length > 0
      ? ` Suggested: ${topSuggestions.map((s) => `"${s}"`).join(", ")}.`
      : "";
  const notes = `${result.message}${suggestionSuffix}`.trim();

  broadcast({ type: "transcript_final", text: utterance });

  const event: SessionEvent = {
    id: randomUUID(),
    timestamp: Date.now(),
    utterance,
    commands: [],
    status: "rejected",
    notes,
  };

  canonical.sessionEvents = [...canonical.sessionEvents.slice(-99), event];
  canonical.revision++;

  broadcast({
    type: "status",
    message: notes,
    level: "warn",
  });
  sendSceneUpdate();
}

async function handleSubmitUtterance(
  utterance: string,
  _clientEventId?: string,
): Promise<void> {
  broadcast({ type: "transcript_final", text: utterance });

  const intentType = classifyIntent(utterance);
  const sceneSummary = JSON.stringify(canonical.sceneGraph);
  const humanSummary = buildSceneSummary();
  const basePreviewContext = buildPreviewContext();
  const previewContext = [
    basePreviewContext,
    "",
    "HUMAN_SCENE_SUMMARY (debug only):",
    humanSummary || "(empty)",
  ].join("\n");

  console.log(
    `[handleSubmitUtterance] utterance="${utterance}", intent=${intentType}`,
  );

  const result = await generateCommandEnvelope({
    utterance,
    sceneSummary,
    previewContext,
    intentType,
  });

  console.log(
    `[handleSubmitUtterance] latency=${result.latencyMs}ms, validated=${result.validated}, thinking=${result.thinkingLevel}, refused=${result.refusal?.reason ?? "none"}`,
  );

  if (result.refusal) {
    const refusalEvent: SessionEvent = {
      id: randomUUID(),
      timestamp: Date.now(),
      utterance,
      commands: [],
      status: "rejected",
      notes: result.refusal.reason,
      latencyMs: result.latencyMs,
    };
    canonical.sessionEvents = [
      ...canonical.sessionEvents.slice(-99),
      refusalEvent,
    ];
    canonical.revision++;

    broadcast({ type: "command_envelope", envelope: result.envelope });
    broadcast({
      type: "status",
      message: result.envelope.notes || "Request could not be processed.",
      level: "warn",
    });
    sendSceneUpdate();
    return;
  }

  const envelope = result.envelope;

  const prevScene = canonical.sceneGraph;
  canonical.sceneGraph = applyCommands(prevScene, envelope.commands);

  const touched = inferLastTouched(envelope.commands);
  if (touched) canonical.lastTouchedObjectId = touched;

  canonical.activePreviewIds = new Set(getActivePreviewIds());

  const event: SessionEvent = {
    id: randomUUID(),
    timestamp: Date.now(),
    utterance,
    commands: envelope.commands,
    status: "applied",
    latencyMs: result.latencyMs,
  };
  canonical.sessionEvents = [...canonical.sessionEvents.slice(-99), event];
  canonical.revision++;

  broadcast({ type: "command_envelope", envelope });
  sendSceneUpdate();
}

function handleApplyCommandEnvelope(
  envelopeInput: unknown,
  label?: string,
): void {
  const startTime = Date.now();

  const validation = CommandEnvelopeSchema.safeParse(envelopeInput);
  if (!validation.success) {
    broadcast({
      type: "error",
      message: "Invalid CommandEnvelope",
      code: "INVALID_ENVELOPE",
    });
    return;
  }

  const envelope = validation.data;

  const prevScene = canonical.sceneGraph;
  canonical.sceneGraph = applyCommands(prevScene, envelope.commands);

  const touched = inferLastTouched(envelope.commands);
  if (touched) canonical.lastTouchedObjectId = touched;

  canonical.activePreviewIds = new Set(getActivePreviewIds());

  const event: SessionEvent = {
    id: randomUUID(),
    timestamp: Date.now(),
    utterance: label ?? "[manual console]",
    commands: envelope.commands,
    status: "applied",
    latencyMs: Date.now() - startTime,
  };

  canonical.sessionEvents = [...canonical.sessionEvents.slice(-99), event];
  canonical.revision++;

  broadcast({ type: "command_envelope", envelope });
  sendSceneUpdate();
}

function inferLastTouched(commands: any[]): string | null {
  let last: string | null = null;

  for (const cmd of commands ?? []) {
    if (!cmd || typeof cmd !== "object") continue;

    switch (cmd.type) {
      case "add_preview_object":
      case "add_object":
        if (cmd.object?.id) last = cmd.object.id;
        break;

      case "update_preview_object":
      case "commit_preview_object":
      case "cancel_preview_object":
      case "update_object":
      case "delete_object": {
        const id = cmd.objectId ?? cmd.previewId ?? cmd.id ?? null;
        if (typeof id === "string") last = id;
        break;
      }

      case "batch": {
        const inner = inferLastTouched(cmd.commands);
        if (inner) last = inner;
        break;
      }
    }
  }

  return last;
}

function handleResetScene(): void {
  canonical.sceneGraph = createEmptyScene();
  canonical.sessionEvents = [];
  canonical.activePreviewIds = new Set();
  canonical.revision++;
  canonical.lastTouchedObjectId = null;

  broadcast({ type: "status", message: "Scene reset", level: "info" });
  sendSceneUpdate();
}
