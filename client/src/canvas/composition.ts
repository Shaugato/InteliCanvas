import type { SceneObject, SceneLayer } from "@shared/index";
import { HORIZON_Y } from "@shared/layering";
export { HORIZON_Y };

export const layerScale: Record<SceneLayer, number> = {
  sky: 1.0,
  background: 0.9,
  ground: 1.0,
  foreground: 1.1,
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function computeFinalPosition(obj: SceneObject): {
  x: number;
  y: number;
} {
  const { transform } = obj;

  // Global clamp only - no layer-based restrictions
  // This allows users to freely move objects anywhere on canvas
  const x = clamp(transform.x);
  const y = clamp(transform.y);

  return { x, y };
}

export function getLayerScale(layer: SceneLayer): number {
  return layerScale[layer] || 1.0;
}
