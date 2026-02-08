export const HORIZON_Y = 45;

export const BACKDROP_TAGS = new Set([
  "sky", "field", "grass", "ground", "water", "sand", "background_backdrop", "backdrop"
]);

export const LAYER_RANK: Record<string, number> = {
  sky: 0,
  background: 1,
  ground: 2,
  foreground: 3,
};

export function isBackdrop(semanticTag?: string): boolean {
  if (!semanticTag) return false;
  return BACKDROP_TAGS.has(semanticTag.toLowerCase());
}

export function getLayerRank(layer: string): number {
  return LAYER_RANK[layer] ?? 9;
}

export function getBackdropRank(semanticTag?: string): number {
  return isBackdrop(semanticTag) ? 0 : 1;
}

export function computeOrderKey(layer: string, semanticTag?: string): number {
  const lr = getLayerRank(layer);
  const br = getBackdropRank(semanticTag);
  return lr * 100 + br * 10;
}

export function hasFullCanvasIntent(utterance: string): boolean {
  const lower = utterance.toLowerCase();
  const patterns = [
    "whole canvas", "full canvas", "entire canvas", "fill canvas",
    "top to bottom", "cover screen", "full screen", "cover everything",
    "entire screen", "whole screen"
  ];
  return patterns.some(p => lower.includes(p));
}

export function getDefaultBounds(semanticTag: string, fullCanvas: boolean): { y1: number; y2: number; x1: number; x2: number } {
  const tag = semanticTag.toLowerCase();
  
  if (fullCanvas) {
    return { x1: 0, x2: 100, y1: 0, y2: 100 };
  }
  
  if (tag === "sky") {
    return { x1: 0, x2: 100, y1: 0, y2: HORIZON_Y };
  }
  
  if (tag === "grass" || tag === "field" || tag === "ground") {
    return { x1: 0, x2: 100, y1: HORIZON_Y, y2: 100 };
  }
  
  return { x1: 0, x2: 100, y1: 0, y2: 100 };
}
