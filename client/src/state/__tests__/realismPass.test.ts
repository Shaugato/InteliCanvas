import { describe, it, expect } from "vitest";
import { applyRealismPass } from "../../../../server/gemini/realismPass";
import type { CommandEnvelope } from "@shared/schema";

describe("Realism Pass", () => {
  describe("Tree enrichment", () => {
    it("enriches a tree with only 1 circle to have trunk + canopy", () => {
      const envelope: CommandEnvelope = {
        commands: [{
          type: "add_object",
          object: {
            id: "obj_tree_123",
            status: "committed",
            layer: "ground",
            transform: { x: 30, y: 80, scale: 1, rotation: 0 },
            semanticTag: "tree",
            shapes: [
              { id: "circle_1", type: "circle", x: 0, y: 0, radius: 5, fill: "#228B22" }
            ]
          }
        }]
      };

      const result = applyRealismPass(envelope, "add a tree");
      
      const obj = (result.commands[0] as any).object;
      expect(obj.shapes.length).toBeGreaterThan(1);
      
      const hasRect = obj.shapes.some((s: any) => s.type === "rect");
      const hasEllipse = obj.shapes.some((s: any) => s.type === "ellipse");
      expect(hasRect || hasEllipse).toBe(true);
    });
  });

  describe("Car enrichment", () => {
    it("enriches a car with only 1 rect to have body + wheels", () => {
      const envelope: CommandEnvelope = {
        commands: [{
          type: "add_object",
          object: {
            id: "obj_car_123",
            status: "committed",
            layer: "ground",
            transform: { x: 50, y: 85, scale: 1, rotation: 0 },
            semanticTag: "car",
            shapes: [
              { id: "rect_1", type: "rect", x: 0, y: 0, width: 20, height: 10, fill: "#FF0000" }
            ]
          }
        }]
      };

      const result = applyRealismPass(envelope, "draw a car");
      
      const obj = (result.commands[0] as any).object;
      expect(obj.shapes.length).toBeGreaterThan(2);
      
      const hasCircle = obj.shapes.some((s: any) => s.type === "circle");
      expect(hasCircle).toBe(true);
    });
  });

  describe("Sky backdrop placement", () => {
    it("sky defaults to top band", () => {
      const envelope: CommandEnvelope = {
        commands: [{
          type: "add_object",
          object: {
            id: "obj_sky_123",
            status: "committed",
            layer: "sky",
            transform: { x: 50, y: 50, scale: 1, rotation: 0 },
            semanticTag: "sky",
            shapes: [
              { id: "rect_1", type: "rect", x: 0, y: 0, width: 100, height: 100, fill: "#87CEEB" }
            ]
          }
        }]
      };

      const result = applyRealismPass(envelope, "add a sky");
      
      const obj = (result.commands[0] as any).object;
      expect(obj.transform.x).toBe(0);
      expect(obj.transform.y).toBe(0);
      
      const rect = obj.shapes.find((s: any) => s.type === "rect");
      expect(rect.y).toBe(0);
      expect(rect.height).toBe(45);
    });

    it("sky with full canvas intent spans entire height", () => {
      const envelope: CommandEnvelope = {
        commands: [{
          type: "add_object",
          object: {
            id: "obj_sky_123",
            status: "committed",
            layer: "sky",
            transform: { x: 50, y: 50, scale: 1, rotation: 0 },
            semanticTag: "sky",
            shapes: [
              { id: "rect_1", type: "rect", x: 0, y: 0, width: 100, height: 45, fill: "#87CEEB" }
            ]
          }
        }]
      };

      const result = applyRealismPass(envelope, "make the sky cover the whole canvas");
      
      const obj = (result.commands[0] as any).object;
      const rect = obj.shapes.find((s: any) => s.type === "rect");
      expect(rect.height).toBe(100);
    });
  });

  describe("Simple/minimal requests", () => {
    it("does not enrich when user asks for simple", () => {
      const envelope: CommandEnvelope = {
        commands: [{
          type: "add_object",
          object: {
            id: "obj_tree_123",
            status: "committed",
            layer: "ground",
            transform: { x: 30, y: 80, scale: 1, rotation: 0 },
            semanticTag: "tree",
            shapes: [
              { id: "circle_1", type: "circle", x: 0, y: 0, radius: 5, fill: "#228B22" }
            ]
          }
        }]
      };

      const result = applyRealismPass(envelope, "add a simple tree");
      
      const obj = (result.commands[0] as any).object;
      expect(obj.shapes.length).toBe(1);
    });
  });

  describe("Shape count limits", () => {
    it("enriched objects stay within 60 shape limit", () => {
      const envelope: CommandEnvelope = {
        commands: [{
          type: "add_object",
          object: {
            id: "obj_house_123",
            status: "committed",
            layer: "ground",
            transform: { x: 50, y: 85, scale: 1, rotation: 0 },
            semanticTag: "house",
            shapes: [
              { id: "rect_1", type: "rect", x: 0, y: 0, width: 20, height: 15, fill: "#8B4513" }
            ]
          }
        }]
      };

      const result = applyRealismPass(envelope, "add a proper house");
      
      const obj = (result.commands[0] as any).object;
      expect(obj.shapes.length).toBeLessThanOrEqual(60);
    });
  });
});
