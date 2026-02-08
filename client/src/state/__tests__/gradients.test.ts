import { describe, it, expect } from "vitest";
import { VectorShapeSchema } from "@shared/vectorShapes";

describe("Gradient Schema Validation", () => {
  describe("Linear Gradients", () => {
    it("accepts valid linear gradient stops", () => {
      const shape = {
        id: "sky_1",
        type: "rect",
        x: 0,
        y: 0,
        width: 100,
        height: 45,
        fillLinearGradientStartPoint: { x: 50, y: 0 },
        fillLinearGradientEndPoint: { x: 50, y: 45 },
        fillLinearGradientColorStops: [0, "#1565C0", 0.5, "#42A5F5", 1, "#E1F5FE"]
      };
      
      const result = VectorShapeSchema.safeParse(shape);
      expect(result.success).toBe(true);
    });

    it("rejects odd-length gradient stops", () => {
      const shape = {
        id: "bad_1",
        type: "rect",
        x: 0,
        y: 0,
        width: 100,
        height: 45,
        fillLinearGradientStartPoint: { x: 50, y: 0 },
        fillLinearGradientEndPoint: { x: 50, y: 45 },
        fillLinearGradientColorStops: [0, "#1565C0", 0.5]
      };
      
      const result = VectorShapeSchema.safeParse(shape);
      expect(result.success).toBe(false);
    });

    it("rejects stop values outside [0..1]", () => {
      const shape = {
        id: "bad_2",
        type: "rect",
        x: 0,
        y: 0,
        width: 100,
        height: 45,
        fillLinearGradientStartPoint: { x: 50, y: 0 },
        fillLinearGradientEndPoint: { x: 50, y: 45 },
        fillLinearGradientColorStops: [0, "#1565C0", 1.5, "#42A5F5"]
      };
      
      const result = VectorShapeSchema.safeParse(shape);
      expect(result.success).toBe(false);
    });
  });

  describe("Radial Gradients", () => {
    it("accepts valid radial gradient for sun glow", () => {
      const shape = {
        id: "sun_glow_1",
        type: "circle",
        x: 0,
        y: 0,
        radius: 10,
        fillRadialGradientStartPoint: { x: 0, y: 0 },
        fillRadialGradientEndPoint: { x: 0, y: 0 },
        fillRadialGradientStartRadius: 0,
        fillRadialGradientEndRadius: 10,
        fillRadialGradientColorStops: [0, "#FFEB3B", 0.5, "#FFF59D", 1, "rgba(255,235,59,0)"]
      };
      
      const result = VectorShapeSchema.safeParse(shape);
      expect(result.success).toBe(true);
    });
  });

  describe("Shapes without gradients", () => {
    it("still accepts regular fill colors", () => {
      const shape = {
        id: "rect_1",
        type: "rect",
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        fill: "#FF0000"
      };
      
      const result = VectorShapeSchema.safeParse(shape);
      expect(result.success).toBe(true);
    });
  });
});
