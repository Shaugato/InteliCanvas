import type { VectorShape } from "../../shared/vectorShapes";
import type { SceneObject } from "../../shared/scene";
import type { CommandEnvelope } from "../../shared/schema";
import { isBackdrop, getDefaultBounds, hasFullCanvasIntent, HORIZON_Y } from "../../shared/layering";

const MIN_SHAPES_BY_TAG: Record<string, number> = {
  tree: 2,
  house: 3,
  person: 4,
  car: 3,
  flower: 2,
  bush: 2,
  mountain: 1,
  sun: 1,
  cloud: 1,
  bird: 2,
  default: 1,
};

function getMinShapes(tag: string): number {
  return MIN_SHAPES_BY_TAG[tag.toLowerCase()] ?? MIN_SHAPES_BY_TAG.default;
}

function needsEnrichment(obj: SceneObject, utterance: string): boolean {
  const lower = utterance.toLowerCase();
  if (lower.includes("simple") || lower.includes("minimal") || lower.includes("basic")) {
    return false;
  }
  
  const tag = obj.semanticTag?.toLowerCase() || "";
  const minShapes = getMinShapes(tag);
  
  if (obj.shapes.length < minShapes) return true;
  
  if (lower.includes("proper") || lower.includes("realistic") || lower.includes("actual shape")) {
    return true;
  }
  
  return false;
}

function uid(prefix: string, idx: number): string {
  return `${prefix}_${idx}`;
}

function generateTreeShapes(): VectorShape[] {
  return [
    { id: uid("trunk", 1), type: "rect", x: -3, y: 0, width: 6, height: 20, fill: "#5D4037" },
    { id: uid("canopy", 1), type: "ellipse", x: 0, y: -8, radiusX: 12, radiusY: 10, fill: "#2E7D32" },
    { id: uid("canopy", 2), type: "ellipse", x: -6, y: -4, radiusX: 8, radiusY: 7, fill: "#388E3C" },
    { id: uid("canopy", 3), type: "ellipse", x: 6, y: -4, radiusX: 8, radiusY: 7, fill: "#388E3C" },
    { id: uid("highlight", 1), type: "ellipse", x: -3, y: -10, radiusX: 4, radiusY: 3, fill: "#43A047", opacity: 0.6 },
  ];
}

function generateHouseShapes(): VectorShape[] {
  return [
    { id: uid("base", 1), type: "rect", x: -15, y: 0, width: 30, height: 25, fill: "#8D6E63" },
    { id: uid("roof", 1), type: "polygon", points: [-18, 0, 18, 0, 0, -15], fill: "#5D4037" },
    { id: uid("door", 1), type: "rect", x: -4, y: 10, width: 8, height: 15, fill: "#3E2723" },
    { id: uid("window", 1), type: "rect", x: -12, y: 5, width: 6, height: 6, fill: "#90CAF9", stroke: "#5D4037", strokeWidth: 1 },
    { id: uid("window", 2), type: "rect", x: 6, y: 5, width: 6, height: 6, fill: "#90CAF9", stroke: "#5D4037", strokeWidth: 1 },
    { id: uid("chimney", 1), type: "rect", x: 8, y: -12, width: 5, height: 10, fill: "#795548" },
  ];
}

function generatePersonShapes(): VectorShape[] {
  return [
    { id: uid("head", 1), type: "circle", x: 0, y: -18, radius: 4, fill: "#FFCCBC" },
    { id: uid("body", 1), type: "rect", x: -4, y: -14, width: 8, height: 14, fill: "#1976D2" },
    { id: uid("arm_l", 1), type: "rect", x: -7, y: -12, width: 3, height: 10, fill: "#1976D2" },
    { id: uid("arm_r", 1), type: "rect", x: 4, y: -12, width: 3, height: 10, fill: "#1976D2" },
    { id: uid("leg_l", 1), type: "rect", x: -3, y: 0, width: 3, height: 12, fill: "#424242" },
    { id: uid("leg_r", 1), type: "rect", x: 0, y: 0, width: 3, height: 12, fill: "#424242" },
  ];
}

function generateCarShapes(): VectorShape[] {
  return [
    { id: uid("body", 1), type: "rect", x: -18, y: -6, width: 36, height: 10, fill: "#D32F2F", cornerRadius: 2 },
    { id: uid("cabin", 1), type: "polygon", points: [-10, -6, 10, -6, 6, -14, -6, -14], fill: "#90CAF9" },
    { id: uid("wheel_f", 1), type: "circle", x: -10, y: 4, radius: 4, fill: "#212121" },
    { id: uid("wheel_b", 1), type: "circle", x: 10, y: 4, radius: 4, fill: "#212121" },
    { id: uid("hubcap_f", 1), type: "circle", x: -10, y: 4, radius: 2, fill: "#9E9E9E" },
    { id: uid("hubcap_b", 1), type: "circle", x: 10, y: 4, radius: 2, fill: "#9E9E9E" },
  ];
}

function generateBushShapes(): VectorShape[] {
  return [
    { id: uid("base", 1), type: "ellipse", x: 0, y: 0, radiusX: 10, radiusY: 6, fill: "#2E7D32" },
    { id: uid("top", 1), type: "ellipse", x: 0, y: -4, radiusX: 8, radiusY: 5, fill: "#388E3C" },
    { id: uid("highlight", 1), type: "ellipse", x: -3, y: -5, radiusX: 3, radiusY: 2, fill: "#43A047", opacity: 0.5 },
  ];
}

function generateFlowerShapes(): VectorShape[] {
  return [
    { id: uid("stem", 1), type: "rect", x: -1, y: 0, width: 2, height: 10, fill: "#4CAF50" },
    { id: uid("center", 1), type: "circle", x: 0, y: -2, radius: 3, fill: "#FFC107" },
    { id: uid("petal", 1), type: "ellipse", x: 0, y: -6, radiusX: 2, radiusY: 3, fill: "#E91E63" },
    { id: uid("petal", 2), type: "ellipse", x: 4, y: -2, radiusX: 3, radiusY: 2, fill: "#E91E63" },
    { id: uid("petal", 3), type: "ellipse", x: -4, y: -2, radiusX: 3, radiusY: 2, fill: "#E91E63" },
    { id: uid("petal", 4), type: "ellipse", x: 3, y: 1, radiusX: 2, radiusY: 3, fill: "#E91E63" },
    { id: uid("petal", 5), type: "ellipse", x: -3, y: 1, radiusX: 2, radiusY: 3, fill: "#E91E63" },
  ];
}

function generateMountainShapes(): VectorShape[] {
  return [
    { id: uid("main", 1), type: "polygon", points: [-25, 20, 25, 20, 0, -20], fill: "#5D4037" },
    { id: uid("snow", 1), type: "polygon", points: [-8, -8, 8, -8, 0, -20], fill: "#FAFAFA" },
    { id: uid("shadow", 1), type: "polygon", points: [0, -20, 15, 5, 25, 20, 0, 20], fill: "#4E342E", opacity: 0.4 },
  ];
}

function generateCloudShapes(): VectorShape[] {
  return [
    { id: uid("puff", 1), type: "ellipse", x: 0, y: 0, radiusX: 12, radiusY: 6, fill: "#FAFAFA" },
    { id: uid("puff", 2), type: "ellipse", x: -8, y: 2, radiusX: 8, radiusY: 5, fill: "#ECEFF1" },
    { id: uid("puff", 3), type: "ellipse", x: 8, y: 2, radiusX: 8, radiusY: 5, fill: "#ECEFF1" },
    { id: uid("puff", 4), type: "ellipse", x: 0, y: -3, radiusX: 8, radiusY: 4, fill: "#FFFFFF" },
  ];
}

function generateSunShapes(): VectorShape[] {
  return [
    { 
      id: uid("glow", 1), 
      type: "circle", 
      x: 0, y: 0, radius: 10, 
      fill: "#FFF59D", 
      opacity: 0.3,
      fillRadialGradientStartPoint: { x: 0, y: 0 },
      fillRadialGradientEndPoint: { x: 0, y: 0 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: 10,
      fillRadialGradientColorStops: [0, "#FFEB3B", 0.5, "#FFF59D", 1, "rgba(255,235,59,0)"]
    },
    { id: uid("core", 1), type: "circle", x: 0, y: 0, radius: 6, fill: "#FFEB3B" },
  ];
}

function generateBirdShapes(): VectorShape[] {
  return [
    { id: uid("body", 1), type: "ellipse", x: 0, y: 0, radiusX: 3, radiusY: 2, fill: "#37474F" },
    { id: uid("wing_l", 1), type: "path", d: "M-2,-1 Q-6,-4 -8,0", stroke: "#37474F", strokeWidth: 1.5 },
    { id: uid("wing_r", 1), type: "path", d: "M2,-1 Q6,-4 8,0", stroke: "#37474F", strokeWidth: 1.5 },
  ];
}

function generateSkyBackdropShapes(fullCanvas: boolean): VectorShape[] {
  const bounds = getDefaultBounds("sky", fullCanvas);
  return [{
    id: uid("sky_bg", 1),
    type: "rect",
    x: bounds.x1,
    y: bounds.y1,
    width: bounds.x2 - bounds.x1,
    height: bounds.y2 - bounds.y1,
    fillLinearGradientStartPoint: { x: 50, y: bounds.y1 },
    fillLinearGradientEndPoint: { x: 50, y: bounds.y2 },
    fillLinearGradientColorStops: [0, "#1565C0", 0.4, "#42A5F5", 0.7, "#90CAF9", 0.9, "#E1F5FE", 1, "#FFE8B0"]
  }];
}

function generateGrassBackdropShapes(fullCanvas: boolean): VectorShape[] {
  const bounds = getDefaultBounds("grass", fullCanvas);
  return [{
    id: uid("grass_bg", 1),
    type: "rect",
    x: bounds.x1,
    y: bounds.y1,
    width: bounds.x2 - bounds.x1,
    height: bounds.y2 - bounds.y1,
    fillLinearGradientStartPoint: { x: 50, y: bounds.y1 },
    fillLinearGradientEndPoint: { x: 50, y: bounds.y2 },
    fillLinearGradientColorStops: [0, "#7CB342", 0.3, "#8BC34A", 0.7, "#689F38", 1, "#558B2F"]
  }];
}

function generateGenericSilhouette(tag: string): VectorShape[] {
  return [
    { id: uid("body", 1), type: "polygon", points: [-8, 10, 8, 10, 10, -5, 0, -15, -10, -5], fill: "#546E7A", stroke: "#37474F", strokeWidth: 1 },
    { id: uid("detail", 1), type: "circle", x: 0, y: -8, radius: 3, fill: "#78909C" },
    { id: uid("base", 1), type: "rect", x: -6, y: 8, width: 12, height: 4, fill: "#455A64" },
  ];
}

function getMacroShapes(tag: string, utterance: string): VectorShape[] {
  const lower = tag.toLowerCase();
  const fullCanvas = hasFullCanvasIntent(utterance);
  
  switch (lower) {
    case "tree": return generateTreeShapes();
    case "house": return generateHouseShapes();
    case "person": return generatePersonShapes();
    case "car": return generateCarShapes();
    case "bush": return generateBushShapes();
    case "flower": return generateFlowerShapes();
    case "mountain": return generateMountainShapes();
    case "cloud": return generateCloudShapes();
    case "sun": return generateSunShapes();
    case "bird": return generateBirdShapes();
    case "sky": return generateSkyBackdropShapes(fullCanvas);
    case "grass":
    case "field":
    case "ground":
      return generateGrassBackdropShapes(fullCanvas);
    default:
      return generateGenericSilhouette(tag);
  }
}

function enrichObject(obj: SceneObject, utterance: string): SceneObject {
  const tag = obj.semanticTag || "object";
  const enrichedShapes = getMacroShapes(tag, utterance);
  
  return {
    ...obj,
    shapes: enrichedShapes,
  };
}

function processBackdrop(obj: SceneObject, utterance: string): SceneObject {
  if (!isBackdrop(obj.semanticTag)) return obj;
  
  const tag = obj.semanticTag?.toLowerCase() || "";
  const fullCanvas = hasFullCanvasIntent(utterance);
  const bounds = getDefaultBounds(tag, fullCanvas);
  
  const updatedShapes = obj.shapes.map(shape => {
    if (shape.type === "rect") {
      return {
        ...shape,
        x: bounds.x1,
        y: bounds.y1,
        width: bounds.x2 - bounds.x1,
        height: bounds.y2 - bounds.y1,
      };
    }
    return shape;
  });
  
  return {
    ...obj,
    shapes: updatedShapes,
    transform: {
      ...obj.transform,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
    },
  };
}

export function applyRealismPass(envelope: CommandEnvelope, utterance: string): CommandEnvelope {
  const processedCommands = envelope.commands.map(cmd => {
    if (cmd.type === "add_preview_object" || cmd.type === "add_object") {
      let obj = cmd.object;
      
      if (isBackdrop(obj.semanticTag)) {
        obj = processBackdrop(obj, utterance);
        if (needsEnrichment(obj, utterance)) {
          obj = enrichObject(obj, utterance);
        }
      } else if (needsEnrichment(obj, utterance)) {
        obj = enrichObject(obj, utterance);
      }
      
      return { ...cmd, object: obj };
    }
    
    return cmd;
  });
  
  return {
    ...envelope,
    commands: processedCommands,
  };
}
