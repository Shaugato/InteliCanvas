import {
  GoogleGenAI,
  ThinkingLevel as GenaiThinkingLevel,
} from "@google/genai";
import {
  CommandEnvelopeSchema,
  type CommandEnvelope,
} from "../../shared/schema";
import { getGeminiCache, initGeminiCache } from "./cache";
import { thinkingFor, type IntentType, type ThinkingLevel } from "./router";
import { applyRealismPass } from "./realismPass";
import { HORIZON_Y } from "../../shared/layering";

export type DirectorInput = {
  utterance: string;
  sceneSummary: string;
  previewContext: string;
  intentType: IntentType;
};

export type DirectorResult = {
  envelope: CommandEnvelope;
  latencyMs: number;
  validated: boolean;
  thinkingLevel: ThinkingLevel;
  refusal?: { reason: string };
  rawText?: string;
};

let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      throw new Error("GEMINI_API_KEY environment variable is not set");
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

function toGenaiThinkingLevel(level: ThinkingLevel): GenaiThinkingLevel {
  // Map your app's ThinkingLevel -> SDK enum
  // (Safe defaults if your union ever expands)
  if (level === "high") return GenaiThinkingLevel.HIGH;
  if (level === ("medium" as any)) return (GenaiThinkingLevel as any).MEDIUM;
  return GenaiThinkingLevel.LOW;
}

function createRefusedEnvelope(reason: string, notes: string): CommandEnvelope {
  return { refused: true, refusalReason: reason, notes, commands: [] };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;

      const status = typeof e?.status === "number" ? e.status : undefined;
      if (status !== 429 && status !== 500 && status !== 502 && status !== 503)
        break;

      const msg = String(e?.message ?? "");
      const m = msg.match(/retryDelay":"(\d+)s"/i);
      const suggestedMs = m ? Number(m[1]) * 1000 : undefined;

      const backoff = suggestedMs ?? Math.min(1200 * (attempt + 1), 6000);
      await sleep(backoff);
    }
  }

  throw lastErr;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const s = (fenceMatch ? fenceMatch[1] : trimmed).trim();

  const start = s.search(/[{[]/);
  if (start === -1) return s;

  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") stack.push(ch);

    if (ch === "}" || ch === "]") {
      const last = stack[stack.length - 1];
      const ok = (ch === "}" && last === "{") || (ch === "]" && last === "[");
      if (ok) stack.pop();
      if (stack.length === 0) return s.slice(start, i + 1);
    }
  }

  return s.slice(start);
}

function normalizeToEnvelope(candidate: any): any {
  if (!candidate || typeof candidate !== "object") return candidate;

  if (candidate.envelope && typeof candidate.envelope === "object")
    candidate = candidate.envelope;

  if (
    "refused" in candidate ||
    "refusalReason" in candidate ||
    "notes" in candidate
  ) {
    if (!("commands" in candidate)) return { ...candidate, commands: [] };
  }

  if ("commands" in candidate) return candidate;

  if (typeof candidate.type === "string") return { commands: [candidate] };

  return candidate;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n * 100) / 100;

function clamp01to100(n: number) {
  return Math.max(0, Math.min(100, n));
}

function normalizeLegacyCommand(cmd: any): any {
  if (!cmd || typeof cmd !== "object") return cmd;

  if (!cmd.type && typeof cmd.command_type === "string") {
    cmd = { ...cmd, type: cmd.command_type };
    delete (cmd as any).command_type;
  }

  if (typeof cmd.object_id === "string" && !cmd.objectId) {
    cmd = { ...cmd, objectId: cmd.object_id };
    delete (cmd as any).object_id;
  }

  if (
    (cmd.type === "add_preview_object" || cmd.type === "add_object") &&
    !cmd.object
  ) {
    const id =
      cmd.object_id ??
      cmd.objectId ??
      `obj_${cmd.object_type ?? "obj"}_${Date.now()}`;

    const layer = cmd.layer ?? "ground";
    const status = cmd.type === "add_preview_object" ? "preview" : "committed";

    const shapes = Array.isArray(cmd.shapes)
      ? cmd.shapes.map((s: any) => {
          const out = { ...s };
          if (typeof out.x === "number") out.x = clamp01to100(out.x);
          if (typeof out.y === "number") out.y = clamp01to100(out.y);
          if (Array.isArray(out.points)) {
            out.points = out.points.map((p: any) =>
              typeof p === "number" ? clamp01to100(p) : p,
            );
          }
          return out;
        })
      : [];

    cmd = {
      type: cmd.type,
      object: {
        id,
        status,
        layer,
        transform: cmd.transform ?? { x: 50, y: 70, scale: 1, rotation: 0 },
        semanticTag: cmd.object_type ?? undefined,
        shapes,
      },
    };
  }

  return cmd;
}

const COMMANDS_THAT_REQUIRE_TARGET_ID = new Set([
  "update_preview_object",
  "commit_preview_object",
  "cancel_preview_object",
  "update_object",
  "delete_object",
  "set_path",
]);

function normalizeTargetId(cmd: any): any {
  if (!cmd || typeof cmd !== "object") return cmd;

  const type = cmd.type;

  if (typeof type === "string" && COMMANDS_THAT_REQUIRE_TARGET_ID.has(type)) {
    const target =
      (typeof cmd.id === "string" && cmd.id) ||
      (typeof cmd.objectId === "string" && cmd.objectId) ||
      (typeof cmd.object_id === "string" && cmd.object_id);

    if (typeof target === "string" && target.length > 0)
      cmd = { ...cmd, id: target };

    if ("objectId" in cmd) {
      const { objectId, ...rest } = cmd;
      cmd = rest;
    }
    if ("object_id" in cmd) {
      const { object_id, ...rest } = cmd;
      cmd = rest;
    }
  }

  if (cmd.type === "batch" && Array.isArray(cmd.commands)) {
    cmd = { ...cmd, commands: cmd.commands.map(normalizeTargetId) };
  }

  return cmd;
}

function normalizeMissingPatch(cmd: any): any {
  if (!cmd || typeof cmd !== "object") return cmd;
  if (cmd.type === "batch" && Array.isArray(cmd.commands)) {
    return { ...cmd, commands: cmd.commands.map(normalizeMissingPatch) };
  }

  const isUpdate =
    cmd.type === "update_object" || cmd.type === "update_preview_object";
  if (!isUpdate) return cmd;
  const patch: any =
    cmd.patch && typeof cmd.patch === "object" ? { ...cmd.patch } : {};
  if (cmd.transform && !patch.transform) patch.transform = cmd.transform;
  if (cmd.shapes && !patch.shapes) patch.shapes = cmd.shapes;
  if (cmd.object && typeof cmd.object === "object") {
    const o = cmd.object;

    if (o.transform && !patch.transform) patch.transform = o.transform;
    if (Array.isArray(o.shapes) && !patch.shapes) patch.shapes = o.shapes;
    if (o.semanticTag && !patch.semanticTag) patch.semanticTag = o.semanticTag;
    if (o.layer && !patch.layer) patch.layer = o.layer;
    if (o.status && !patch.status) patch.status = o.status;
  }

  if (Object.keys(patch).length === 0) return cmd;
  const { transform, shapes, object, ...rest } = cmd;

  return { ...rest, patch };
}

function normalizeLineShape(shape: any): any {
  if (!shape || typeof shape !== "object") return shape;
  if (shape.type !== "line") return shape;

  if (
    typeof shape.x1 === "number" &&
    typeof shape.y1 === "number" &&
    typeof shape.x2 === "number" &&
    typeof shape.y2 === "number" &&
    !Array.isArray(shape.points)
  ) {
    const { x1, y1, x2, y2, ...rest } = shape;
    return { ...rest, points: [x1, y1, x2, y2] };
  }
  return shape;
}

function normalizeShapesInObject(obj: any): any {
  if (!obj || !Array.isArray(obj.shapes)) return obj;
  return {
    ...obj,
    shapes: obj.shapes.map(normalizeLineShape),
  };
}

function normalizeCommandArray(commands: any): any {
  if (!Array.isArray(commands)) return commands;
  return commands.map((c) => {
    let normalized = normalizeTargetId(normalizeLegacyCommand(c));
    normalized = normalizeMissingPatch(normalized);
    if (
      (normalized.type === "add_preview_object" ||
        normalized.type === "add_object") &&
      normalized.object
    ) {
      return {
        ...normalized,
        object: normalizeShapesInObject(normalized.object),
      };
    }
    if (
      (normalized.type === "update_preview_object" ||
        normalized.type === "update_object") &&
      normalized.patch?.shapes
    ) {
      return {
        ...normalized,
        patch: {
          ...normalized.patch,
          shapes: normalized.patch.shapes.map(normalizeLineShape),
        },
      };
    }
    return normalized;
  });
}

function shapeBBox(shape: any) {
  if (!shape || typeof shape !== "object") return null;

  switch (shape.type) {
    case "rect": {
      const x = shape.x ?? 0,
        y = shape.y ?? 0;
      return {
        minX: x,
        minY: y,
        maxX: x + (shape.width ?? 0),
        maxY: y + (shape.height ?? 0),
      };
    }
    case "circle": {
      const x = shape.x ?? 0,
        y = shape.y ?? 0,
        r = shape.radius ?? 0;
      return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
    }
    case "ellipse": {
      const x = shape.x ?? 0,
        y = shape.y ?? 0,
        rx = shape.radiusX ?? 0,
        ry = shape.radiusY ?? 0;
      return { minX: x - rx, minY: y - ry, maxX: x + rx, maxY: y + ry };
    }
    case "polygon":
    case "polyline":
    case "line": {
      const pts = Array.isArray(shape.points) ? shape.points : [];
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i],
          y = pts[i + 1];
        if (typeof x !== "number" || typeof y !== "number") continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      if (!isFinite(minX)) return null;
      return { minX, minY, maxX, maxY };
    }
    case "path": {
      const d = String(shape.d ?? "");
      const re = /-?\d+(?:\.\d+)?/g;
      const nums = d.match(re)?.map(Number) ?? [];
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = nums[i],
          y = nums[i + 1];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      if (!isFinite(minX)) return null;
      return { minX, minY, maxX, maxY };
    }
    case "text": {
      const x = shape.x ?? 0,
        y = shape.y ?? 0;
      return { minX: x, minY: y, maxX: x, maxY: y };
    }
    default:
      return null;
  }
}

function objectLocalBBox(obj: any) {
  if (!obj || !Array.isArray(obj.shapes) || obj.shapes.length === 0)
    return null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const s of obj.shapes) {
    const bb = shapeBBox(s);
    if (!bb) continue;
    minX = Math.min(minX, bb.minX);
    minY = Math.min(minY, bb.minY);
    maxX = Math.max(maxX, bb.maxX);
    maxY = Math.max(maxY, bb.maxY);
  }

  if (!isFinite(minX) || !isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}

function rebasePathD(d: string, dx: number, dy: number): string {
  const re = /-?\d+(?:\.\d+)?/g;
  const nums = d.match(re)?.map(Number) ?? [];
  let idx = 0;

  return d.replace(re, (m) => {
    const v = nums[idx];
    const isX = idx % 2 === 0;
    const nv =
      typeof v === "number" && isFinite(v) ? v - (isX ? dx : dy) : Number(m);
    idx++;
    return String(round(clamp(nv)));
  });
}

function rebaseObjectToLocal(obj: any): any {
  const bb = objectLocalBBox(obj);
  if (!bb) return obj;

  const needsRebase =
    bb.minX > 12 || bb.minY > 12 || bb.maxX > 110 || bb.maxY > 110;
  if (!needsRebase) return obj;

  const tx = typeof obj.transform?.x === "number" ? obj.transform.x : 0;
  const ty = typeof obj.transform?.y === "number" ? obj.transform.y : 0;

  const newTransform = {
    ...(obj.transform ?? {}),
    x: clamp(tx + bb.minX),
    y: clamp(ty + bb.minY),
  };

  const newShapes = obj.shapes.map((s: any) => {
    const out = { ...s };
    if (typeof out.x === "number") out.x = clamp(out.x - bb.minX);
    if (typeof out.y === "number") out.y = clamp(out.y - bb.minY);

    if (Array.isArray(out.points)) {
      out.points = out.points.map((p: any, i: number) => {
        if (typeof p !== "number") return p;
        return clamp(p - (i % 2 === 0 ? bb.minX : bb.minY));
      });
    }

    if (out.type === "path" && typeof out.d === "string") {
      out.d = rebasePathD(out.d, bb.minX, bb.minY);
    }

    return out;
  });

  return { ...obj, transform: newTransform, shapes: newShapes };
}

function shiftLocalBBoxToZero(obj: any): any {
  const bb = objectLocalBBox(obj);
  if (!bb) return obj;

  const shiftX = bb.minX;
  const shiftY = bb.minY;
  if (shiftX === 0 && shiftY === 0) return obj;

  const tx = typeof obj.transform?.x === "number" ? obj.transform.x : 0;
  const ty = typeof obj.transform?.y === "number" ? obj.transform.y : 0;

  const newShapes = obj.shapes.map((s: any) => {
    const out = { ...s };
    if (typeof out.x === "number") out.x = round(out.x - shiftX);
    if (typeof out.y === "number") out.y = round(out.y - shiftY);

    if (Array.isArray(out.points)) {
      out.points = out.points.map((p: any, i: number) => {
        if (typeof p !== "number") return p;
        return round(p - (i % 2 === 0 ? shiftX : shiftY));
      });
    }

    if (out.type === "path" && typeof out.d === "string") {
      out.d = rebasePathD(out.d, shiftX, shiftY);
    }

    return out;
  });

  const newTransform = {
    ...(obj.transform ?? {}),
    x: round(tx + shiftX),
    y: round(ty + shiftY),
  };

  return { ...obj, transform: newTransform, shapes: newShapes };
}

function tryParseSceneGraph(sceneSummary: string): any | null {
  const s = (sceneSummary || "").trim();
  if (!s) return null;

  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === "object" && obj.objects && obj.order) return obj;
    return null;
  } catch {
    return null;
  }
}

function objectWorldBBox(obj: any) {
  const bb = objectLocalBBox(obj);
  if (!bb) return null;

  const tx = typeof obj.transform?.x === "number" ? obj.transform.x : 0;
  const ty = typeof obj.transform?.y === "number" ? obj.transform.y : 0;
  const sc = typeof obj.transform?.scale === "number" ? obj.transform.scale : 1;

  const minX = tx + bb.minX * sc;
  const maxX = tx + bb.maxX * sc;
  const minY = ty + bb.minY * sc;
  const maxY = ty + bb.maxY * sc;

  return {
    minX: round(minX),
    minY: round(minY),
    maxX: round(maxX),
    maxY: round(maxY),
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

function anchorsFromBBox(b: any) {
  const midX = round((b.minX + b.maxX) / 2);
  const midY = round((b.minY + b.maxY) / 2);

  return {
    topLeft: { x: b.minX, y: b.minY },
    topCenter: { x: midX, y: b.minY },
    topRight: { x: b.maxX, y: b.minY },
    center: { x: midX, y: midY },
    bottomLeft: { x: b.minX, y: b.maxY },
    bottomCenter: { x: midX, y: b.maxY },
    bottomRight: { x: b.maxX, y: b.maxY },
  };
}

function buildSceneFacts(scene: any) {
  const order: string[] = Array.isArray(scene?.order) ? scene.order : [];
  const objects: Record<string, any> =
    scene?.objects && typeof scene.objects === "object" ? scene.objects : {};

  const facts = {
    horizonY: HORIZON_Y,
    worldBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    layers: {
      skyBand: { minY: 0, maxY: HORIZON_Y },
      groundBand: { minY: HORIZON_Y, maxY: 100 },
      background: { minY: 0, maxY: 100 },
    },
    objects: [] as any[],
    byTag: {} as Record<string, string[]>,
  };

  for (const id of order) {
    const obj = objects[id];
    if (!obj) continue;

    const bbox = objectWorldBBox(obj);
    const anchors = bbox ? anchorsFromBBox(bbox) : null;

    const tag = typeof obj.semanticTag === "string" ? obj.semanticTag : "";
    const shapesArr = Array.isArray(obj.shapes) ? obj.shapes : [];

    facts.objects.push({
      id: obj.id,
      status: obj.status,
      layer: obj.layer,
      semanticTag: tag || null,
      transform: obj.transform,
      bboxWorld: bbox,
      anchors,
      shapesCount: shapesArr.length,
      shapeIds: shapesArr
        .map((s: any) => s?.id)
        .filter(Boolean)
        .slice(0, 60),
    });

    if (tag) {
      if (!facts.byTag[tag]) facts.byTag[tag] = [];
      facts.byTag[tag].push(obj.id);
    }
  }

  return facts;
}

function userExplicitlyWantsDelete(utterance: string) {
  return /\b(delete|remove|erase|clear|get rid|discard|wipe)\b/i.test(
    utterance,
  );
}

function userExplicitlyWantsCancel(utterance: string) {
  return /\b(cancel|discard|undo)\b/i.test(utterance);
}

function userExplicitlyWantsConvert(utterance: string) {
  return /\b(turn into|convert|transform|change into|make it into)\b/i.test(
    utterance,
  );
}

function userExplicitlyWantsIndicator(utterance: string) {
  return /\b(path|arrow|direction\s*line|indicator|show\s*direction|point\s*(to|at|towards))\b/i.test(
    utterance,
  );
}

function filterIndicatorShapes(obj: any, utterance: string): any {
  if (!obj || !Array.isArray(obj.shapes)) return obj;
  if (userExplicitlyWantsIndicator(utterance)) return obj;

  const tag =
    typeof obj.semanticTag === "string" ? obj.semanticTag.toLowerCase() : "";
  if (tag !== "person" && tag !== "people") return obj;

  const filtered = obj.shapes.filter((s: any) => {
    if (!s || typeof s !== "object") return true;
    const id = typeof s.id === "string" ? s.id.toLowerCase() : "";
    if (
      id.includes("indicator") ||
      id.includes("arrow") ||
      id.includes("direction")
    ) {
      return false;
    }
    if (s.type === "line" || s.type === "polyline" || s.type === "path") {
      const stroke = typeof s.stroke === "string" ? s.stroke.toLowerCase() : "";
      if (id.includes("point") || stroke.includes("dashed")) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) return obj;
  if (filtered.length === obj.shapes.length) return obj;

  return { ...obj, shapes: filtered };
}

function wantsTexture(utterance: string): boolean {
  return /\b(texture|pattern|rows|row|detailed|details|tufts|rice|plants|grass\s*blades?)\b/i.test(
    utterance,
  );
}

function simplifyBackdrop(obj: any, utterance: string): any {
  if (!obj || !Array.isArray(obj.shapes)) return obj;

  const tag = String(obj.semanticTag ?? "").toLowerCase();
  const isBackdrop = [
    "sky",
    "field",
    "grass",
    "ground",
    "paddy_field",
    "water",
    "sand",
    "backdrop",
    "background_backdrop",
    "paddy",
    "meadow",
    "lawn",
  ].includes(tag);

  if (!isBackdrop) return obj;
  if (wantsTexture(utterance)) return obj;

  const hasGradient = (s: any) =>
    (typeof s.fill === "object" && s.fill?.type === "linearGradient") ||
    typeof s.fillLinearGradientColorStops === "object";

  const isSignificantShape = (s: any) => {
    if (s.type === "line" || s.type === "polyline") return false;
    if (s.type === "rect" || s.type === "path") return true;
    const bb = shapeBBox(s);
    if (!bb) return false;
    const w = bb.maxX - bb.minX;
    const h = bb.maxY - bb.minY;
    const area = w * h;
    return w >= 25 || h >= 15 || area >= 600;
  };

  const kept = obj.shapes.filter((s: any) => {
    if (!s || typeof s !== "object") return true;
    if (hasGradient(s)) return true;
    if (isSignificantShape(s)) return true;
    return false;
  });

  if (kept.length === 0) {
    const first = obj.shapes.find(
      (s: any) => s?.type === "rect" || s?.type === "path",
    );
    if (first) return { ...obj, shapes: [first] };
    return obj;
  }

  return { ...obj, shapes: kept };
}

function stripDestructiveCommands(
  cmds: any[],
  utterance: string,
): { cmds: any[]; removed: number; strippedSemantic: number } {
  let removed = 0;
  let strippedSemantic = 0;

  const out = (cmds ?? []).flatMap((cmd: any) => {
    if (!cmd || typeof cmd !== "object") return [cmd];

    if (cmd.type === "batch" && Array.isArray(cmd.commands)) {
      const inner = stripDestructiveCommands(cmd.commands, utterance);
      removed += inner.removed;
      strippedSemantic += inner.strippedSemantic;
      return [{ ...cmd, commands: inner.cmds }];
    }

    if (cmd.type === "delete_object" && !userExplicitlyWantsDelete(utterance)) {
      removed++;
      return [];
    }

    if (
      cmd.type === "cancel_preview_object" &&
      !userExplicitlyWantsCancel(utterance)
    ) {
      removed++;
      return [];
    }

    if (
      (cmd.type === "update_object" || cmd.type === "update_preview_object") &&
      cmd.patch &&
      typeof cmd.patch === "object" &&
      "semanticTag" in cmd.patch &&
      !userExplicitlyWantsConvert(utterance)
    ) {
      const { semanticTag, ...restPatch } = cmd.patch as any;
      strippedSemantic++;
      return [{ ...cmd, patch: restPatch }];
    }

    return [cmd];
  });

  return { cmds: out, removed, strippedSemantic };
}

function boostVisibility(obj: any): any {
  if (!Array.isArray(obj.shapes)) return obj;

  let changed = false;
  const newShapes = obj.shapes.map((s: any) => {
    if (s?.type === "path") {
      const strokeWidth = typeof s.strokeWidth === "number" ? s.strokeWidth : 0;
      if (strokeWidth < 3) {
        changed = true;
        return { ...s, strokeWidth: 5 };
      }
    }
    return s;
  });

  return changed ? { ...obj, shapes: newShapes } : obj;
}

type CoverageMode = "default" | "full_canvas";

function coverageModeFromUtterance(u: string): CoverageMode {
  const s = u || "";
  if (
    /\b(full|whole|entire)\s+(canvas|screen)\b/i.test(s) ||
    /\bcover\s+(the\s+)?(canvas|screen)\b/i.test(s) ||
    /\bfill\s+(the\s+)?(canvas|screen)\b/i.test(s) ||
    /\bbackground\b/i.test(s)
  ) {
    return "full_canvas";
  }
  return "default";
}

function looksLikeFullWidthBandRect(shape: any) {
  if (!shape || shape.type !== "rect") return false;
  const x = typeof shape.x === "number" ? shape.x : 0;
  const w = typeof shape.width === "number" ? shape.width : 0;
  const h = typeof shape.height === "number" ? shape.height : 0;
  return x <= 1 && w >= 95 && h > 0;
}

function getBandRects(shapes: any[]) {
  const rects = (shapes ?? []).filter(looksLikeFullWidthBandRect);
  rects.sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0));
  return rects;
}

function isBandStack(shapes: any[]) {
  const rects = getBandRects(shapes);
  return rects.length >= 3;
}

function bandBoundsForLayer(layer: string) {
  if (layer === "sky") return { minY: 0, maxY: HORIZON_Y };
  if (layer === "ground" || layer === "foreground")
    return { minY: HORIZON_Y, maxY: 100 };
  return { minY: 0, maxY: 100 };
}

function normalizeBandStack(shapes: any[], targetHeight: number) {
  const rects = getBandRects(shapes);
  if (rects.length < 3) return null;

  const n = rects.length;
  const base = Math.floor(targetHeight / n);
  let rem = targetHeight - base * n;

  let y = 0;
  const outRects = rects.map((r: any) => {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem--;

    const h = base + extra;
    const nr = {
      ...r,
      x: 0,
      y,
      width: 100,
      height: h,
    };
    y += h;
    return nr;
  });

  const others = (shapes ?? []).filter(
    (s: any) => !looksLikeFullWidthBandRect(s),
  );
  return [...outRects, ...others];
}

function applyCoverageToObject(
  obj: any,
  mode: CoverageMode,
  utterance: string,
) {
  const tag =
    typeof obj.semanticTag === "string" ? obj.semanticTag.toLowerCase() : "";
  const layer = String(obj.layer ?? "ground");

  const fullCanvas = mode === "full_canvas";
  const forceFull =
    fullCanvas &&
    (layer === "sky" ||
      tag === "sky" ||
      /\bsky\b/i.test(utterance) ||
      /\bbackground\b/i.test(utterance) ||
      isBandStack(obj.shapes));

  if (forceFull) {
    const newShapes = isBandStack(obj.shapes)
      ? (normalizeBandStack(obj.shapes, 100) ?? obj.shapes)
      : obj.shapes;

    return {
      ...obj,
      layer: "background",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      shapes: newShapes,
    };
  }

  const b = bandBoundsForLayer(layer);
  const targetHeight = b.maxY - b.minY;

  if (
    layer === "sky" &&
    (tag === "sky" || /\bsky\b/i.test(utterance) || isBandStack(obj.shapes))
  ) {
    const newShapes = isBandStack(obj.shapes)
      ? (normalizeBandStack(obj.shapes, targetHeight) ?? obj.shapes)
      : obj.shapes;

    return {
      ...obj,
      transform: {
        ...(obj.transform ?? {}),
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      },
      shapes: newShapes,
    };
  }

  if (
    (layer === "ground" || layer === "foreground") &&
    /\bground|field|grass|floor\b/i.test(tag)
  ) {
    const newShapes = isBandStack(obj.shapes)
      ? (normalizeBandStack(obj.shapes, targetHeight) ?? obj.shapes)
      : obj.shapes;

    return {
      ...obj,
      transform: {
        ...(obj.transform ?? {}),
        x: 0,
        y: b.minY,
        scale: 1,
        rotation: 0,
      },
      shapes: newShapes,
    };
  }

  return obj;
}

function fitObjectToBands(
  obj: any,
  margin = 1,
  mode: CoverageMode = "default",
): any {
  const bb = objectLocalBBox(obj);
  if (!bb) return obj;

  const tx = typeof obj.transform?.x === "number" ? obj.transform.x : 50;
  const ty = typeof obj.transform?.y === "number" ? obj.transform.y : 70;
  const scale =
    typeof obj.transform?.scale === "number" ? obj.transform.scale : 1;

  const layer = String(obj.layer ?? "ground");

  let bandMinY = 0;
  let bandMaxY = 100;

  if (mode !== "full_canvas") {
    if (layer === "sky") {
      bandMinY = 0;
      bandMaxY = HORIZON_Y;
    } else if (layer === "ground" || layer === "foreground") {
      bandMinY = HORIZON_Y;
      bandMaxY = 100;
    } else {
      bandMinY = 0;
      bandMaxY = 100;
    }
  }

  const minX = tx + bb.minX * scale;
  const maxX = tx + bb.maxX * scale;
  const minY = ty + bb.minY * scale;
  const maxY = ty + bb.maxY * scale;

  let dx = 0;
  let dy = 0;

  if (minX < margin) dx = margin - minX;
  else if (maxX > 100 - margin) dx = 100 - margin - maxX;

  if (minY < bandMinY + margin) dy = bandMinY + margin - minY;
  else if (maxY > bandMaxY - margin) dy = bandMaxY - margin - maxY;

  if (dx === 0 && dy === 0) return obj;

  const newTransform = {
    ...(obj.transform ?? {}),
    x: clamp(tx + dx),
    y: clamp(ty + dy),
  };

  return { ...obj, transform: newTransform };
}

function stabilizeNewObject(
  obj: any,
  mode: CoverageMode,
  utterance: string,
): any {
  if (!obj || typeof obj !== "object") return obj;

  const tx = typeof obj.transform?.x === "number" ? obj.transform.x : 50;
  const ty = typeof obj.transform?.y === "number" ? obj.transform.y : 70;
  const scale =
    typeof obj.transform?.scale === "number" ? obj.transform.scale : 1;
  const rotation =
    typeof obj.transform?.rotation === "number" ? obj.transform.rotation : 0;

  let out = {
    ...obj,
    transform: {
      ...(obj.transform ?? {}),
      x: clamp(tx),
      y: clamp(ty),
      scale: clamp(scale, 0.1, 3),
      rotation: clamp(rotation, -180, 180),
    },
  };

  out = rebaseObjectToLocal(out);
  out = shiftLocalBBoxToZero(out);

  out = applyCoverageToObject(out, mode, utterance);
  out = fitObjectToBands(out, 1, mode);

  return out;
}

function mergeTransform(base: any, patch: any) {
  const b = base && typeof base === "object" ? base : {};
  const p = patch && typeof patch === "object" ? patch : {};
  return { ...b, ...p };
}

function maybeNormalizeBandPatch(
  cmd: any,
  scene: any | null,
  mode: CoverageMode,
  utterance: string,
) {
  if (!scene || !cmd?.id || !cmd?.patch || typeof cmd.patch !== "object")
    return cmd;

  const current = scene?.objects?.[cmd.id];
  if (!current || typeof current !== "object") return cmd;

  const patch = cmd.patch as any;
  const layer = String(current.layer ?? "ground");
  const bounds =
    mode === "full_canvas" ? { minY: 0, maxY: 100 } : bandBoundsForLayer(layer);
  const targetHeight = bounds.maxY - bounds.minY;

  const hasBandNow = isBandStack(current.shapes);
  const hasBandPatch = Array.isArray(patch.shapes) && isBandStack(patch.shapes);

  const scaleIntent =
    /\b(scale|bigger|smaller|expand|stretch|fill|cover)\b/i.test(utterance) ||
    (patch.transform &&
      typeof patch.transform === "object" &&
      "scale" in patch.transform);

  const wantsSkyOrBg =
    /\bsky|background\b/i.test(utterance) ||
    String(current.semanticTag ?? "").toLowerCase() === "sky" ||
    layer === "sky";

  if (!hasBandNow && !hasBandPatch) return cmd;

  if (!scaleIntent && !wantsSkyOrBg && mode !== "full_canvas") {
    if (hasBandPatch) {
      const normalized = normalizeBandStack(patch.shapes, targetHeight);
      if (normalized)
        return { ...cmd, patch: { ...patch, shapes: normalized } };
    }
    return cmd;
  }

  const candidateShapes = hasBandPatch ? patch.shapes : current.shapes;
  const normalizedShapes = normalizeBandStack(
    candidateShapes,
    mode === "full_canvas" ? 100 : targetHeight,
  );

  if (!normalizedShapes) return cmd;

  const baseT = current.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
  const mergedT = mergeTransform(baseT, patch.transform);

  const forceFull =
    mode === "full_canvas" &&
    (layer === "sky" ||
      String(current.semanticTag ?? "").toLowerCase() === "sky" ||
      /\bbackground\b/i.test(utterance));

  const nextTransform = forceFull
    ? { x: 0, y: 0, scale: 1, rotation: 0 }
    : layer === "sky"
      ? { x: 0, y: 0, scale: 1, rotation: 0 }
      : {
          ...mergedT,
          x: typeof mergedT.x === "number" ? clamp(mergedT.x) : mergedT.x,
          y: typeof mergedT.y === "number" ? clamp(mergedT.y) : mergedT.y,
        };

  return {
    ...cmd,
    patch: {
      ...patch,
      transform: nextTransform,
      shapes: normalizedShapes,
    },
  };
}

function postProcessEnvelope(
  envelope: any,
  ctx: { utterance: string; scene: any | null; mode: CoverageMode },
): any {
  if (!envelope || !Array.isArray(envelope.commands)) return envelope;

  const processed = envelope.commands.map((cmd: any) => {
    if (!cmd || typeof cmd !== "object") return cmd;

    if (cmd.type === "add_preview_object" || cmd.type === "add_object") {
      if (!cmd.object) return cmd;
      let obj = cmd.object;
      obj = boostVisibility(obj);
      obj = filterIndicatorShapes(obj, ctx.utterance);
      obj = simplifyBackdrop(obj, ctx.utterance);
      obj = stabilizeNewObject(obj, ctx.mode, ctx.utterance);
      return { ...cmd, object: obj };
    }

    if (
      (cmd.type === "update_preview_object" || cmd.type === "update_object") &&
      cmd.patch &&
      typeof cmd.patch === "object"
    ) {
      let out = cmd;

      out = maybeNormalizeBandPatch(out, ctx.scene, ctx.mode, ctx.utterance);

      if (out.patch?.transform && typeof out.patch.transform === "object") {
        const t = out.patch.transform;
        const patched = {
          ...t,
          x: typeof t.x === "number" ? clamp(t.x) : t.x,
          y: typeof t.y === "number" ? clamp(t.y) : t.y,
          scale: typeof t.scale === "number" ? clamp(t.scale, 0.1, 3) : t.scale,
          rotation:
            typeof t.rotation === "number"
              ? clamp(t.rotation, -180, 180)
              : t.rotation,
        };
        out = { ...out, patch: { ...out.patch, transform: patched } };
      }

      return out;
    }

    if (cmd.type === "batch" && Array.isArray(cmd.commands)) {
      const inner = postProcessEnvelope({ commands: cmd.commands }, ctx);
      return { ...cmd, commands: inner.commands };
    }

    return cmd;
  });

  return { ...envelope, commands: processed };
}

function pickModel(thinkingLevel: ThinkingLevel) {
  const fast = process.env.GEMINI_TEXT_MODEL_FAST ?? "gemini-3-flash-preview";
  const smart = process.env.GEMINI_TEXT_MODEL_SMART ?? "gemini-3-pro-preview";
  const forced = process.env.GEMINI_TEXT_MODEL;
  if (forced) return forced;
  return thinkingLevel === "high" ? smart : fast;
}

export async function generateCommandEnvelope(
  input: DirectorInput,
): Promise<DirectorResult> {
  const startTime = Date.now();
  const thinkingLevel = thinkingFor(input.intentType, input.utterance);
  const mode = coverageModeFromUtterance(input.utterance);
  const sceneObj = tryParseSceneGraph(input.sceneSummary);

  try {
    await initGeminiCache();
    const cache = getGeminiCache();

    const ai = getGenAI();
    const modelName = pickModel(thinkingLevel);

    const userPrompt = buildUserPrompt(input, mode);

    console.log(
      `[Director] Intent=${input.intentType}, Thinking=${thinkingLevel}, Model=${modelName}`,
    );

    const result = await withRetries(
      () =>
        ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction: cache.systemInstruction,

            responseMimeType: "application/json",
            temperature: 0.2,
            thinkingConfig: {
              thinkingLevel: toGenaiThinkingLevel(thinkingLevel),
            },
          },
        }),
      2,
    );

    const rawText = String((result as any)?.text ?? "");

    let parsed: unknown;
    try {
      const jsonText = extractJson(rawText);
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error("[Director] JSON parse failed:", parseErr);
      console.error("[Director] Raw (first 800 chars):", rawText.slice(0, 800));
      return {
        envelope: createRefusedEnvelope(
          "json_parse_failed",
          "I couldn't understand the response. Please try again.",
        ),
        latencyMs: Date.now() - startTime,
        validated: false,
        thinkingLevel,
        refusal: { reason: "json_parse_failed" },
        rawText,
      };
    }

    const envelopeCandidate = normalizeToEnvelope(parsed);

    let normalizedCandidate: any = envelopeCandidate;
    if (
      normalizedCandidate &&
      typeof normalizedCandidate === "object" &&
      Array.isArray(normalizedCandidate.commands)
    ) {
      normalizedCandidate = {
        ...normalizedCandidate,
        commands: normalizeCommandArray(normalizedCandidate.commands),
      };
    }

    const validation = CommandEnvelopeSchema.safeParse(normalizedCandidate);
    if (!validation.success) {
      console.error(
        "[Director] Schema validation failed:",
        validation.error.errors,
      );
      console.error("[Director] Raw (first 800 chars):", rawText.slice(0, 800));
      console.error(
        "[Director] Normalized (first 800 chars):",
        JSON.stringify(normalizedCandidate).slice(0, 800),
      );
      return {
        envelope: createRefusedEnvelope(
          "schema_validation_failed",
          "I couldn't produce a valid command envelope. Please rephrase.",
        ),
        latencyMs: Date.now() - startTime,
        validated: false,
        thinkingLevel,
        refusal: { reason: "schema_validation_failed" },
        rawText,
      };
    }

    let safeEnvelope: any = validation.data;

    const guard = stripDestructiveCommands(
      safeEnvelope.commands,
      input.utterance,
    );
    safeEnvelope = { ...safeEnvelope, commands: guard.cmds };

    if (guard.removed > 0 || guard.strippedSemantic > 0) {
      const extra = [
        guard.removed > 0
          ? `ignored ${guard.removed} destructive command(s)`
          : null,
        guard.strippedSemantic > 0
          ? `ignored ${guard.strippedSemantic} semanticTag change(s)`
          : null,
      ]
        .filter(Boolean)
        .join("; ");

      safeEnvelope.notes =
        (safeEnvelope.notes ? safeEnvelope.notes + " " : "") +
        `(Safety: ${extra})`;
    }

    const post = postProcessEnvelope(safeEnvelope, {
      utterance: input.utterance,
      scene: sceneObj,
      mode,
    });

    const enhanced = applyRealismPass(post, input.utterance);

    const recheck = CommandEnvelopeSchema.safeParse(enhanced);
    if (!recheck.success) {
      console.error(
        "[Director] Post-processed envelope failed validation:",
        recheck.error.errors,
      );
      return {
        envelope: createRefusedEnvelope(
          "schema_validation_failed",
          "Normalization failed. Please try again.",
        ),
        latencyMs: Date.now() - startTime,
        validated: false,
        thinkingLevel,
        refusal: { reason: "schema_validation_failed" },
        rawText,
      };
    }

    const finalEnvelope = recheck.data;
    const latencyMs = Date.now() - startTime;

    console.log(
      `[Director] Success: ${finalEnvelope.commands.length} commands, ${latencyMs}ms, refused=${finalEnvelope.refused ?? false}`,
    );

    if (finalEnvelope.refused) {
      return {
        envelope: finalEnvelope,
        latencyMs,
        validated: true,
        thinkingLevel,
        refusal: { reason: finalEnvelope.refusalReason || "unspecified" },
      };
    }

    return {
      envelope: finalEnvelope,
      latencyMs,
      validated: true,
      thinkingLevel,
    };
  } catch (err: any) {
    console.error("[Director] API error:", err);

    const status = typeof err?.status === "number" ? err.status : undefined;
    if (status === 429) {
      return {
        envelope: createRefusedEnvelope(
          "rate_limited",
          "Rate limit hit. Try again shortly (or upgrade your quota tier).",
        ),
        latencyMs: Date.now() - startTime,
        validated: false,
        thinkingLevel,
        refusal: { reason: "rate_limited" },
      };
    }

    return {
      envelope: createRefusedEnvelope(
        "api_error",
        "There was an error processing your request. Please try again.",
      ),
      latencyMs: Date.now() - startTime,
      validated: false,
      thinkingLevel,
      refusal: { reason: err instanceof Error ? err.message : "unknown_error" },
    };
  }
}

function buildUserPrompt(input: DirectorInput, mode: CoverageMode): string {
  const parts: string[] = [];

  parts.push(`USER REQUEST: "${input.utterance}"`);
  parts.push("");
  parts.push(`INTENT TYPE: ${input.intentType}`);
  parts.push(
    `COVERAGE_MODE: ${mode === "full_canvas" ? "FULL_CANVAS" : "DEFAULT_BANDS"}`,
  );
  parts.push("");

  if (input.sceneSummary.trim()) {
    parts.push("CURRENT SCENE STATE (JSON):");
    parts.push(input.sceneSummary);
    parts.push("");
  } else {
    parts.push("CURRENT SCENE STATE: Empty canvas");
    parts.push("");
  }

  const sceneObj = tryParseSceneGraph(input.sceneSummary);
  if (sceneObj) {
    const facts = buildSceneFacts(sceneObj);
    parts.push(
      "SCENE_FACTS (machine-readable; use for anchors + relative placement):",
    );
    parts.push(JSON.stringify(facts));
    parts.push("");
  } else {
    parts.push(
      "SCENE_FACTS: (unavailable — pass sceneSummary as JSON.stringify(sceneGraph) to enable)",
    );
    parts.push("");
  }

  if (input.previewContext.trim()) {
    parts.push("PREVIEW CONTEXT:");
    parts.push(input.previewContext);
    parts.push("");
  }

  switch (input.intentType) {
    case "LIVE_DRAW":
      parts.push(
        "TASK: Generate commands to fulfill the user's drawing request. Prefer preview workflow for new objects.",
      );
      break;
    case "COMPOSITION_PASS":
      parts.push(
        "TASK: Improve composition (balance/contrast/harmony) with small, safe adjustments.",
      );
      break;
    case "FINAL_RENDER_PLAN":
      parts.push(
        "TASK: Plan cleanup/enhancement steps for a final render. Use minimal commands when possible.",
      );
      break;
  }

  parts.push("");
  parts.push(
    [
      "COORDINATE RULES:",
      "- World is 0..100 for both x and y (y increases downward).",
      `- Horizon is around y=${HORIZON_Y}.`,
      `- Sky band is y=0..${HORIZON_Y} (DEFAULT).`,
      `- Ground/Foreground band is y=${HORIZON_Y}..100 (DEFAULT).`,
      "- Background can be anywhere.",
      "- Use LOCAL shape coordinates inside each object, place the object using transform.x/transform.y.",
      "- DO NOT place objects so any part is off-screen.",
      "",
      "COVERAGE INTENT:",
      "- If user asks FULL/WWHOLE/ENTIRE canvas OR says cover/fill background: create/adjust the object to cover y=0..100 and x=0..100.",
      "- Otherwise, use sensible bands: sky -> sky band, ground/field -> ground band, normal objects -> their layer band.",
      "",
      "GRADIENT / SHADE SUPPORT:",
      "- If you need a gradient but only solid fills exist, approximate using stacked full-width rect bands.",
      "- Bands must be contiguous and cover the target height exactly (no gaps, no fractional heights).",
      "",
      "RELATIVE / REFERENTIAL INSTRUCTIONS:",
      "- If user says 'top/bottom/left/right/center of <object>': use SCENE_FACTS.objects[*].anchors.*.",
      "- If user says 'next to / above / below': compute new transform using referenced bboxWorld and anchors.",
      "",
      "EDIT EXISTING OBJECTS INSTEAD OF CREATING NEW ONES (when asked):",
      "- If user asks 'add a door/window to the house', prefer updating the existing house object.",
      "- Use CURRENT SCENE STATE to copy existing shapes and append new shapes.",
      "",
      "SAFETY RULES:",
      "- DO NOT delete or cancel any object unless user explicitly says delete/remove/erase/cancel/undo/reset.",
      "- If user says 'add', create a NEW object (do not replace or silently delete existing objects).",
      "- Do not change semanticTag of an existing object unless user explicitly says turn into/convert/transform.",
      "",
      "IMPORTANT FIELD NAMES:",
      '- Commands that target an object MUST use: "id" (NOT objectId/object_id).',
      "",
      "SEMANTIC TAGS:",
      "- semanticTag is a short free string (examples: house, tree, door, window, cloud, river, person, weight).",
      "",
      "RESIZE SUPPORT:",
      "- If user says bigger/smaller: adjust transform.scale via update_preview_object/update_object.",
      "- If the object is a background/gradient made from stacked bands and user says cover/fill/scale to canvas: resize by adjusting the bands to match the new coverage.",
      "",
      "RESPONSE RULES:",
      "- Output MUST be a single JSON object and NOTHING ELSE.",
      '- Top-level shape MUST be: { "refused"?: boolean, "refusalReason"?: string, "notes"?: string, "commands": [ ... ] }',
      '- It MUST include "commands": [] even when refused=true.',
      "- Do not return a single command object by itself. Always wrap in commands[].",
    ].join("\n"),
  );

  return parts.join("\n");
}
