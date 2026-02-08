<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { wsStore } from "../state/wsStore";
import { liveStore } from "../state/liveStore";
import { speechStore } from "../state/speechStore";
import { cheetahStore } from "../state/cheetahStore";
import { computeFinalPosition, getLayerScale } from "./composition";
import { computeBBox } from "./renderer/bbox";
import type { SceneObject, SceneLayer } from "@shared/scene";
import type { VectorShape } from "@shared/vectorShapes";

const props = defineProps<{
  selectedObjectId?: string | null;
}>();

const containerRef = ref<HTMLDivElement>();
const stageW = ref(1200);
const stageH = ref(660);

const sx = computed(() => stageW.value / 100);
const sy = computed(() => stageH.value / 100);

const wx = (v: number) => v * sx.value;
const wy = (v: number) => v * sy.value;

let resizeObserver: ResizeObserver | null = null;
let gradientIdCounter = 0;

onMounted(() => {
  if (!containerRef.value) return;

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = Math.max(280, entry.contentRect.width);
      stageW.value = width;
      stageH.value = width * 0.55;
    }
  });

  resizeObserver.observe(containerRef.value);
  stageW.value = Math.max(280, containerRef.value.clientWidth);
  stageH.value = stageW.value * 0.55;
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

const objectsByLayer = computed(() => {
  const layers: Record<SceneLayer, SceneObject[]> = {
    sky: [],
    background: [],
    ground: [],
    foreground: [],
  };

  for (const id of wsStore.scene.order) {
    const obj = wsStore.scene.objects[id];
    if (obj && obj.status === "committed") {
      layers[obj.layer].push(obj);
    }
  }

  return layers;
});

const previewObjects = computed(() =>
  wsStore.scene.order
    .map((id) => wsStore.scene.objects[id])
    .filter((obj): obj is SceneObject => Boolean(obj) && obj.status === "preview"),
);

const objectCount = computed(() => Object.keys(wsStore.scene.objects).length);
const previewCount = computed(() => previewObjects.value.length);
const isSceneEmpty = computed(() => objectCount.value === 0);

const listeningActive = computed(
  () =>
    liveStore.status === "connected" ||
    liveStore.status === "connecting" ||
    speechStore.isListening ||
    cheetahStore.status === "connected" ||
    cheetahStore.status === "connecting",
);

const listeningLabel = computed(() => {
  if (liveStore.status === "connecting") return "Connecting voice...";
  if (liveStore.status === "connected") return "Listening...";
  if (cheetahStore.status === "connecting") return "Starting Cheetah...";
  if (cheetahStore.status === "connected") return "Listening...";
  if (speechStore.isListening) return "Listening...";
  return "Voice idle";
});

const listeningText = computed(() => {
  if (cheetahStore.partialTranscript && cheetahStore.partialTranscript.trim().length > 0) {
    return cheetahStore.partialTranscript;
  }

  if (liveStore.partialTranscript && liveStore.partialTranscript.trim().length > 0) {
    return liveStore.partialTranscript;
  }

  if (speechStore.interimTranscript && speechStore.interimTranscript.trim().length > 0) {
    return speechStore.interimTranscript;
  }

  return "Speak naturally to direct the scene.";
});

type GradientStop = {
  offset: number;
  color: string;
};

type GradientDef = {
  id: string;
  type: "linear" | "radial";
  stops: GradientStop[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
};

function parseStops(stops: Array<number | string> | undefined): GradientStop[] {
  if (!Array.isArray(stops)) return [];

  const parsed: GradientStop[] = [];
  for (let i = 0; i + 1 < stops.length; i += 2) {
    const offset = stops[i];
    const color = stops[i + 1];

    if (typeof offset === "number" && typeof color === "string") {
      parsed.push({ offset, color });
    }
  }

  return parsed;
}

function buildGradientDef(shape: VectorShape): { gradientId: string | null; defs: GradientDef[] } {
  const defs: GradientDef[] = [];
  let gradientId: string | null = null;

  if (
    shape.fillLinearGradientColorStops &&
    shape.fillLinearGradientStartPoint &&
    shape.fillLinearGradientEndPoint
  ) {
    const id = `lg_${shape.id}_${++gradientIdCounter}`;

    defs.push({
      id,
      type: "linear",
      stops: parseStops(shape.fillLinearGradientColorStops),
      x1: shape.fillLinearGradientStartPoint.x,
      y1: shape.fillLinearGradientStartPoint.y,
      x2: shape.fillLinearGradientEndPoint.x,
      y2: shape.fillLinearGradientEndPoint.y,
    });

    gradientId = id;
  }

  if (
    shape.fillRadialGradientColorStops &&
    shape.fillRadialGradientStartPoint &&
    shape.fillRadialGradientEndPoint
  ) {
    const id = `rg_${shape.id}_${++gradientIdCounter}`;

    defs.push({
      id,
      type: "radial",
      stops: parseStops(shape.fillRadialGradientColorStops),
      cx: shape.fillRadialGradientEndPoint.x,
      cy: shape.fillRadialGradientEndPoint.y,
      r: shape.fillRadialGradientEndRadius ?? 50,
      fx: shape.fillRadialGradientStartPoint.x,
      fy: shape.fillRadialGradientStartPoint.y,
    });

    gradientId = id;
  }

  return { gradientId, defs };
}

function renderShape(shape: VectorShape): { svg: string; defs: GradientDef[] } {
  const { gradientId, defs } = buildGradientDef(shape);

  const fill = gradientId ? `url(#${gradientId})` : shape.fill || "none";
  const stroke = shape.stroke || "none";
  const strokeWidth = shape.strokeWidth || 0;
  const opacity = shape.opacity ?? 1;

  const style = `fill: ${fill}; stroke: ${stroke}; stroke-width: ${strokeWidth}; opacity: ${opacity};`;

  let svg = "";
  switch (shape.type) {
    case "rect": {
      const cornerRadius = (shape as any).cornerRadius || 0;
      svg = `<rect x="${wx(shape.x)}" y="${wy(shape.y)}" width="${wx(shape.width)}" height="${wy(shape.height)}" rx="${cornerRadius}" style="${style}" />`;
      break;
    }
    case "circle":
      svg = `<circle cx="${wx(shape.x)}" cy="${wy(shape.y)}" r="${wx(shape.radius)}" style="${style}" />`;
      break;
    case "ellipse":
      svg = `<ellipse cx="${wx(shape.x)}" cy="${wy(shape.y)}" rx="${wx(shape.radiusX)}" ry="${wy(shape.radiusY)}" style="${style}" />`;
      break;
    case "line":
    case "polyline": {
      const points = shape.points
        .map((value, index) => (index % 2 === 0 ? wx(value) : wy(value)))
        .join(",");
      svg = `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" vector-effect="non-scaling-stroke" />`;
      break;
    }
    case "polygon": {
      const points = shape.points
        .map((value, index) => (index % 2 === 0 ? wx(value) : wy(value)))
        .join(",");
      svg = `<polygon points="${points}" style="${style}" vector-effect="non-scaling-stroke" />`;
      break;
    }
    case "path":
      svg = `<g transform="scale(${sx.value}, ${sy.value})"><path d="${shape.d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" vector-effect="non-scaling-stroke" /></g>`;
      break;
    case "text": {
      const fontSize = (shape.fontSize || 14) * sx.value;
      const anchor =
        shape.align === "center" ? "middle" : shape.align === "right" ? "end" : "start";
      svg = `<text x="${wx(shape.x)}" y="${wy(shape.y)}" font-size="${fontSize}" fill="${shape.fill || "#EAF0FF"}" text-anchor="${anchor}">${shape.text}</text>`;
      break;
    }
    default:
      svg = "";
  }

  return { svg, defs };
}

function renderObject(
  obj: SceneObject,
  isPreview = false,
  isSelected = false,
): { svg: string; defs: GradientDef[] } {
  const position = computeFinalPosition(obj);
  const scale = obj.transform.scale * getLayerScale(obj.layer);
  const opacity = isPreview ? 0.42 : 1;

  const allDefs: GradientDef[] = [];
  const shapes = obj.shapes
    .map((shape) => {
      const rendered = renderShape(shape);
      allDefs.push(...rendered.defs);
      return rendered.svg;
    })
    .join("");

  let overlay = "";

  if (isPreview) {
    const bbox = computeBBox(obj.shapes);
    const pad = 3;
    const bx = wx(bbox.minX) - pad;
    const by = wy(bbox.minY) - pad;
    const bw = wx(bbox.maxX - bbox.minX) + pad * 2;
    const bh = wy(bbox.maxY - bbox.minY) + pad * 2;

    overlay += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#FBBF24" stroke-width="2" stroke-dasharray="6,4" vector-effect="non-scaling-stroke" />`;
  }

  if (isSelected) {
    const bbox = computeBBox(obj.shapes);
    const pad = 4;
    const bx = wx(bbox.minX) - pad;
    const by = wy(bbox.minY) - pad;
    const bw = wx(bbox.maxX - bbox.minX) + pad * 2;
    const bh = wy(bbox.maxY - bbox.minY) + pad * 2;

    overlay += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#0F766E" stroke-width="2.4" vector-effect="non-scaling-stroke" />`;
    overlay += `<rect x="${bx - 1.4}" y="${by - 1.4}" width="${bw + 2.8}" height="${bh + 2.8}" fill="none" stroke="rgba(217,119,6,0.55)" stroke-width="1.4" vector-effect="non-scaling-stroke" />`;
  }

  const svg = `<g transform="translate(${wx(position.x)}, ${wy(position.y)}) scale(${scale}) rotate(${obj.transform.rotation})" opacity="${opacity}">${shapes}${overlay}</g>`;

  return { svg, defs: allDefs };
}

const renderedLayers = computed(() => {
  gradientIdCounter = 0;
  const allDefs: GradientDef[] = [];

  const renderLayer = (objects: SceneObject[], isPreview = false): string =>
    objects
      .map((object) => {
        const rendered = renderObject(
          object,
          isPreview,
          props.selectedObjectId === object.id,
        );
        allDefs.push(...rendered.defs);
        return rendered.svg;
      })
      .join("");

  return {
    sky: renderLayer(objectsByLayer.value.sky),
    background: renderLayer(objectsByLayer.value.background),
    ground: renderLayer(objectsByLayer.value.ground),
    foreground: renderLayer(objectsByLayer.value.foreground),
    preview: renderLayer(previewObjects.value, true),
    defs: allDefs,
  };
});
</script>

<template>
  <div ref="containerRef" class="canvas-shell" data-testid="canvas-stage">
    <svg :width="stageW" :height="stageH" class="stage-surface">
      <defs>
        <template v-for="def in renderedLayers.defs" :key="def.id">
          <linearGradient
            v-if="def.type === 'linear'"
            :id="def.id"
            :x1="`${def.x1 ?? 0}%`"
            :y1="`${def.y1 ?? 0}%`"
            :x2="`${def.x2 ?? 100}%`"
            :y2="`${def.y2 ?? 100}%`"
          >
            <stop
              v-for="(stop, index) in def.stops"
              :key="`${def.id}-l-${index}`"
              :offset="`${stop.offset * 100}%`"
              :stop-color="stop.color"
            />
          </linearGradient>

          <radialGradient
            v-else
            :id="def.id"
            :cx="`${def.cx ?? 50}%`"
            :cy="`${def.cy ?? 50}%`"
            :r="`${def.r ?? 50}%`"
            :fx="`${def.fx ?? 50}%`"
            :fy="`${def.fy ?? 50}%`"
          >
            <stop
              v-for="(stop, index) in def.stops"
              :key="`${def.id}-r-${index}`"
              :offset="`${stop.offset * 100}%`"
              :stop-color="stop.color"
            />
          </radialGradient>
        </template>
      </defs>

      <g class="layer-sky" v-html="renderedLayers.sky"></g>
      <g class="layer-background" v-html="renderedLayers.background"></g>
      <g class="layer-ground" v-html="renderedLayers.ground"></g>
      <g class="layer-foreground" v-html="renderedLayers.foreground"></g>
      <g class="layer-preview" v-html="renderedLayers.preview"></g>
    </svg>

    <div v-if="isSceneEmpty" class="sketch-grid" aria-hidden="true"></div>

    <div v-if="listeningActive" class="hud hud-listening">
      <span class="dot"></span>
      <div>
        <p class="hud-title">{{ listeningLabel }}</p>
        <p class="hud-text">{{ listeningText }}</p>
      </div>
    </div>

    <div v-if="previewCount > 0" class="hud hud-preview">
      Previewing {{ previewCount }} item{{ previewCount === 1 ? "" : "s" }}
    </div>

    <div v-if="isSceneEmpty" class="empty-overlay">
      <h3>Start with a prompt</h3>
      <p>Try voice or text prompts like:</p>
      <ul>
        <li>"Create a sunrise sky with warm gradients"</li>
        <li>"Add two pine trees on the left"</li>
        <li>"Place a small cabin near the center"</li>
      </ul>
    </div>

    <div class="scene-meta">
      <span>{{ objectCount }} objects</span>
      <span>{{ previewCount }} previews</span>
      <span>Rev {{ wsStore.revision }}</span>
    </div>
  </div>
</template>

<style scoped>
.canvas-shell {
  position: relative;
  width: 100%;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--canvas-edge);
  background: var(--canvas-surface);
  box-shadow:
    0 18px 40px rgba(17, 24, 39, 0.22),
    0 2px 0 rgba(255, 255, 255, 0.72) inset,
    0 -1px 0 rgba(231, 221, 207, 0.7) inset;
}

.canvas-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background:
    repeating-linear-gradient(
      0deg,
      rgba(17, 24, 39, 0.018) 0px,
      rgba(17, 24, 39, 0.018) 1px,
      transparent 1px,
      transparent 4px
    ),
    repeating-linear-gradient(
      90deg,
      rgba(17, 24, 39, 0.014) 0px,
      rgba(17, 24, 39, 0.014) 1px,
      transparent 1px,
      transparent 3px
    ),
    radial-gradient(circle at 24% 16%, rgba(217, 119, 6, 0.03), transparent 50%);
  opacity: 0.24;
}

.canvas-shell::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(231, 221, 207, 0.6), inset 0 24px 32px rgba(255, 255, 255, 0.2);
  z-index: 1;
}

.stage-surface {
  position: relative;
  z-index: 0;
  display: block;
  width: 100%;
  height: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 25%),
    var(--canvas-surface);
}

.sketch-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  opacity: 0.06;
  background-image: radial-gradient(circle, rgba(17, 24, 39, 0.75) 0.7px, transparent 0.7px);
  background-size: 16px 16px;
}

.hud {
  position: absolute;
  z-index: 3;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: var(--text-primary);
  box-shadow: 0 8px 18px rgba(17, 24, 39, 0.12);
}

.hud-listening {
  top: 14px;
  left: 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  max-width: min(440px, calc(100% - 28px));
}

.dot {
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--accent-teal);
  box-shadow: 0 0 10px rgba(15, 118, 110, 0.42);
  animation: pulse 1.8s ease-in-out infinite;
}

.hud-title {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-teal);
}

.hud-text {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hud-preview {
  top: 14px;
  right: 14px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--accent-amber);
  border-color: rgba(217, 119, 6, 0.32);
  background: rgba(255, 244, 214, 0.9);
}

.empty-overlay {
  position: absolute;
  z-index: 4;
  inset: auto 50% 26px auto;
  transform: translateX(50%);
  width: min(520px, calc(100% - 48px));
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid #f2d29c;
  background: #fff4d6;
  box-shadow: 0 12px 24px rgba(141, 99, 29, 0.18);
}

.empty-overlay h3 {
  margin: 0 0 8px;
  font-size: 21px;
  color: var(--text-primary);
}

.empty-overlay p {
  margin: 0 0 8px;
  font-size: 13px;
  color: #785318;
}

.empty-overlay ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.empty-overlay li {
  color: #6b4d1f;
  font-size: 13px;
  line-height: 1.4;
}

.scene-meta {
  position: absolute;
  z-index: 3;
  left: 14px;
  bottom: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.85);
  color: var(--text-muted);
  font-size: 11px;
  box-shadow: 0 6px 16px rgba(17, 24, 39, 0.1);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}

@media (max-width: 900px) {
  .hud-listening {
    max-width: calc(100% - 28px);
  }

  .empty-overlay {
    inset: auto 10px 10px 10px;
    transform: none;
    width: auto;
  }

  .empty-overlay h3 {
    font-size: 18px;
  }
}
</style>
