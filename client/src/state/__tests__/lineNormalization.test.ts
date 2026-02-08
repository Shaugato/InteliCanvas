import { describe, it, expect } from "vitest";

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

function normalizeMissingPatch(cmd: any): any {
  if (!cmd || typeof cmd !== "object") return cmd;
  if (cmd.type === "batch" && Array.isArray(cmd.commands)) {
    return { ...cmd, commands: cmd.commands.map(normalizeMissingPatch) };
  }
  const isUpdate = cmd.type === "update_object" || cmd.type === "update_preview_object";
  if (!isUpdate) return cmd;

  const patch: any = { ...(cmd.patch && typeof cmd.patch === "object" ? cmd.patch : {}) };
  if (cmd.transform && !patch.transform) patch.transform = cmd.transform;
  if (cmd.shapes && !patch.shapes) patch.shapes = cmd.shapes;
  if (cmd.layer && !patch.layer) patch.layer = cmd.layer;
  if (cmd.status && !patch.status) patch.status = cmd.status;
  if (cmd.semanticTag && !patch.semanticTag) patch.semanticTag = cmd.semanticTag;

  if (Object.keys(patch).length === 0) return cmd;

  const { transform, shapes, layer, status, semanticTag, ...rest } = cmd;
  return { ...rest, patch };
}

function wantsTexture(utterance: string): boolean {
  return /\b(texture|pattern|rows|row|detailed|details|tufts|rice|plants|grass\s*blades?)\b/i.test(utterance);
}

function shapeBBox(shape: any) {
  if (!shape || typeof shape !== "object") return null;
  switch (shape.type) {
    case "rect": {
      const x = shape.x ?? 0, y = shape.y ?? 0;
      return { minX: x, minY: y, maxX: x + (shape.width ?? 0), maxY: y + (shape.height ?? 0) };
    }
    case "polygon":
    case "polyline":
    case "line": {
      const pts = Array.isArray(shape.points) ? shape.points : [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i], y = pts[i + 1];
        if (typeof x !== "number" || typeof y !== "number") continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      if (!isFinite(minX)) return null;
      return { minX, minY, maxX, maxY };
    }
    default: return null;
  }
}

function simplifyBackdrop(obj: any, utterance: string): any {
  if (!obj || !Array.isArray(obj.shapes)) return obj;
  
  const tag = String(obj.semanticTag ?? "").toLowerCase();
  const isBackdrop = [
    "sky", "field", "grass", "ground", "paddy_field", "water", "sand",
    "backdrop", "background_backdrop", "paddy", "meadow", "lawn"
  ].includes(tag);
  
  if (!isBackdrop) return obj;
  if (wantsTexture(utterance)) return obj;
  
  const hasGradient = (s: any) => 
    (typeof s.fill === "object" && s.fill?.type === "linearGradient") ||
    (typeof s.fillLinearGradientColorStops === "object");
  
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
    const first = obj.shapes.find((s: any) => 
      s?.type === "rect" || s?.type === "path"
    );
    if (first) return { ...obj, shapes: [first] };
    return obj;
  }
  
  return { ...obj, shapes: kept };
}

describe("Line Shape Normalization", () => {
  it("converts x1/y1/x2/y2 to points array", () => {
    const input = {
      id: "ray_1",
      type: "line",
      x1: 50,
      y1: 20,
      x2: 60,
      y2: 10,
      stroke: "#FFD700",
      strokeWidth: 2,
    };
    
    const output = normalizeLineShape(input);
    
    expect(output.points).toEqual([50, 20, 60, 10]);
    expect(output.x1).toBeUndefined();
    expect(output.y1).toBeUndefined();
    expect(output.x2).toBeUndefined();
    expect(output.y2).toBeUndefined();
    expect(output.stroke).toBe("#FFD700");
    expect(output.strokeWidth).toBe(2);
  });

  it("leaves valid line shapes with points unchanged", () => {
    const input = {
      id: "ray_1",
      type: "line",
      points: [10, 20, 30, 40],
      stroke: "#000",
    };
    
    const output = normalizeLineShape(input);
    
    expect(output).toEqual(input);
  });

  it("does not modify non-line shapes", () => {
    const rect = {
      id: "rect_1",
      type: "rect",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    };
    
    expect(normalizeLineShape(rect)).toEqual(rect);
  });
});

describe("normalizeMissingPatch", () => {
  it("moves top-level transform into patch wrapper", () => {
    const input = {
      type: "update_object",
      id: "obj_house_123",
      transform: { x: 10, y: 46, scale: 1.2, rotation: 0 },
    };
    
    const output = normalizeMissingPatch(input);
    
    expect(output.patch).toBeDefined();
    expect(output.patch.transform).toEqual({ x: 10, y: 46, scale: 1.2, rotation: 0 });
    expect(output.transform).toBeUndefined();
  });

  it("moves multiple top-level fields into patch", () => {
    const input = {
      type: "update_preview_object",
      id: "field-1",
      transform: { x: 0, y: 0 },
      layer: "ground",
      semanticTag: "field",
    };
    
    const output = normalizeMissingPatch(input);
    
    expect(output.patch.transform).toEqual({ x: 0, y: 0 });
    expect(output.patch.layer).toBe("ground");
    expect(output.patch.semanticTag).toBe("field");
    expect(output.transform).toBeUndefined();
    expect(output.layer).toBeUndefined();
    expect(output.semanticTag).toBeUndefined();
  });

  it("leaves properly structured commands unchanged", () => {
    const input = {
      type: "update_object",
      id: "house-1",
      patch: { transform: { x: 20, y: 50 } },
    };
    
    const output = normalizeMissingPatch(input);
    
    expect(output).toEqual(input);
  });

  it("handles nested batch commands", () => {
    const input = {
      type: "batch",
      commands: [
        { type: "update_object", id: "a", transform: { x: 5 } },
        { type: "add_object", object: { id: "b" } },
      ],
    };
    
    const output = normalizeMissingPatch(input);
    
    expect(output.commands[0].patch?.transform).toEqual({ x: 5 });
    expect(output.commands[0].transform).toBeUndefined();
    expect(output.commands[1]).toEqual({ type: "add_object", object: { id: "b" } });
  });

  it("does not touch non-update commands", () => {
    const input = {
      type: "add_object",
      object: { id: "tree-1", transform: { x: 50, y: 70 } },
    };
    
    const output = normalizeMissingPatch(input);
    
    expect(output).toEqual(input);
  });
});

describe("simplifyBackdrop", () => {
  it("removes tuft/detail shapes from field backdrops", () => {
    const field = {
      id: "field-1",
      semanticTag: "field",
      shapes: [
        { id: "base_rect", type: "rect", x: 0, y: 45, width: 100, height: 55 },
        { id: "grass_tuft_1", type: "polygon", points: [10, 80, 12, 75, 14, 80] },
        { id: "grass_tuft_2", type: "polygon", points: [30, 85, 32, 80, 34, 85] },
      ],
    };
    
    const simplified = simplifyBackdrop(field, "add a field");
    
    expect(simplified.shapes.length).toBe(1);
    expect(simplified.shapes[0].id).toBe("base_rect");
  });

  it("keeps detail shapes when texture is requested", () => {
    const field = {
      id: "field-1",
      semanticTag: "field",
      shapes: [
        { id: "base_rect", type: "rect", x: 0, y: 45, width: 100, height: 55 },
        { id: "grass_tuft_1", type: "polygon", points: [10, 80, 12, 75, 14, 80] },
      ],
    };
    
    const simplified = simplifyBackdrop(field, "add a field with texture");
    
    expect(simplified.shapes.length).toBe(2);
  });

  it("removes paddy row details unless rows requested", () => {
    const paddy = {
      id: "paddy-1",
      semanticTag: "paddy_field",
      shapes: [
        { id: "base", type: "rect", x: 0, y: 50, width: 100, height: 50 },
        { id: "paddy_row_1", type: "line", points: [0, 60, 100, 60] },
        { id: "paddy_row_2", type: "line", points: [0, 70, 100, 70] },
        { id: "detail_plant_1", type: "polygon", points: [5, 55, 7, 50, 9, 55] },
      ],
    };
    
    const simplified = simplifyBackdrop(paddy, "add a paddy field");
    
    expect(simplified.shapes.length).toBe(1);
    expect(simplified.shapes[0].id).toBe("base");
  });

  it("keeps rows when explicitly requested", () => {
    const paddy = {
      id: "paddy-1",
      semanticTag: "paddy_field",
      shapes: [
        { id: "base", type: "rect", x: 0, y: 50, width: 100, height: 50 },
        { id: "paddy_row_1", type: "line", points: [0, 60, 100, 60] },
      ],
    };
    
    const simplified = simplifyBackdrop(paddy, "add a paddy field with rows");
    
    expect(simplified.shapes.length).toBe(2);
  });

  it("does not simplify non-backdrop objects", () => {
    const tree = {
      id: "tree-1",
      semanticTag: "tree",
      shapes: [
        { id: "trunk", type: "rect", x: 0, y: 0, width: 5, height: 15 },
        { id: "leaf_detail_1", type: "circle", x: 0, y: -5, radius: 3 },
      ],
    };
    
    const simplified = simplifyBackdrop(tree, "add a tree");
    
    expect(simplified.shapes.length).toBe(2);
  });

  it("keeps mid-width hillside polygons (representative Gemini output)", () => {
    const ground = {
      id: "ground-1",
      semanticTag: "ground",
      shapes: [
        { id: "base_rect", type: "rect", x: 0, y: 60, width: 100, height: 40 },
        { id: "hill_band_1", type: "polygon", points: [0, 55, 28, 50, 50, 55, 100, 55, 100, 65, 0, 65] },
        { id: "tiny_tuft", type: "polygon", points: [10, 58, 11, 56, 12, 58] },
      ],
    };
    
    const simplified = simplifyBackdrop(ground, "add ground");
    
    expect(simplified.shapes.length).toBe(2);
    expect(simplified.shapes.find((s: any) => s.id === "base_rect")).toBeDefined();
    expect(simplified.shapes.find((s: any) => s.id === "hill_band_1")).toBeDefined();
    expect(simplified.shapes.find((s: any) => s.id === "tiny_tuft")).toBeUndefined();
  });

  it("keeps gradient-filled shapes regardless of size", () => {
    const sky = {
      id: "sky-1",
      semanticTag: "sky",
      shapes: [
        { 
          id: "sky_gradient", 
          type: "polygon", 
          points: [0, 0, 100, 0, 100, 45, 0, 45],
          fill: { type: "linearGradient", stops: [{ offset: 0, color: "#87CEEB" }] }
        },
        { id: "small_cloud_detail", type: "ellipse", x: 20, y: 15, radiusX: 3, radiusY: 2 },
      ],
    };
    
    const simplified = simplifyBackdrop(sky, "add sky");
    
    expect(simplified.shapes.find((s: any) => s.id === "sky_gradient")).toBeDefined();
  });
});

describe("Indicator Shape Filtering", () => {
  function userExplicitlyWantsIndicator(utterance: string) {
    return /\b(path|arrow|direction\s*line|indicator|show\s*direction|point\s*(to|at|towards))\b/i.test(
      utterance,
    );
  }

  function filterIndicatorShapes(obj: any, utterance: string): any {
    if (!obj || !Array.isArray(obj.shapes)) return obj;
    if (userExplicitlyWantsIndicator(utterance)) return obj;
    
    const tag = typeof obj.semanticTag === "string" ? obj.semanticTag.toLowerCase() : "";
    if (tag !== "person" && tag !== "people") return obj;
    
    const filtered = obj.shapes.filter((s: any) => {
      if (!s || typeof s !== "object") return true;
      const id = typeof s.id === "string" ? s.id.toLowerCase() : "";
      if (id.includes("indicator") || id.includes("arrow") || id.includes("direction")) {
        return false;
      }
      return true;
    });
    
    if (filtered.length === 0) return obj;
    if (filtered.length === obj.shapes.length) return obj;
    
    return { ...obj, shapes: filtered };
  }

  it("removes indicator shapes from person objects", () => {
    const person = {
      id: "person-1",
      semanticTag: "person",
      shapes: [
        { id: "body_1", type: "rect", x: 0, y: 0, width: 5, height: 10 },
        { id: "head_1", type: "circle", x: 2.5, y: -3, radius: 3 },
        { id: "direction_indicator", type: "line", points: [5, 5, 20, 5] },
      ],
    };
    
    const filtered = filterIndicatorShapes(person, "draw a person walking");
    
    expect(filtered.shapes.length).toBe(2);
    expect(filtered.shapes.find((s: any) => s.id === "direction_indicator")).toBeUndefined();
  });

  it("keeps indicator shapes when user explicitly asks", () => {
    const person = {
      id: "person-1",
      semanticTag: "person",
      shapes: [
        { id: "body_1", type: "rect", x: 0, y: 0, width: 5, height: 10 },
        { id: "direction_arrow", type: "line", points: [5, 5, 20, 5] },
      ],
    };
    
    const filtered = filterIndicatorShapes(person, "draw a person with an arrow showing direction");
    
    expect(filtered.shapes.length).toBe(2);
  });

  it("does not filter non-person objects", () => {
    const tree = {
      id: "tree-1",
      semanticTag: "tree",
      shapes: [
        { id: "trunk", type: "rect", x: 0, y: 0, width: 5, height: 10 },
        { id: "indicator_line", type: "line", points: [0, 0, 10, 10] },
      ],
    };
    
    const filtered = filterIndicatorShapes(tree, "draw a tree");
    
    expect(filtered.shapes.length).toBe(2);
  });
});
