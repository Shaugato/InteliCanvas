import { describe, it, expect } from "vitest";
import { computeFinalPosition } from "../../canvas/composition";
import { applyCommand, createEmptyScene } from "../../../../server/reducer";
import type { SceneObject } from "@shared/scene";
import type { DrawingCommand } from "@shared/commands";

describe("Movement Fixes", () => {
  describe("computeFinalPosition - No Layer Clamping", () => {
    const makeObject = (layer: "sky" | "ground" | "foreground" | "background", y: number): SceneObject => ({
      id: "test-obj",
      status: "committed",
      layer,
      transform: { x: 50, y, scale: 1, rotation: 0 },
      shapes: [{ id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 }],
    });

    it("allows ground layer objects above horizon", () => {
      const obj = makeObject("ground", 20);
      const pos = computeFinalPosition(obj);
      expect(pos.y).toBe(20);
    });

    it("allows sky layer objects below horizon", () => {
      const obj = makeObject("sky", 80);
      const pos = computeFinalPosition(obj);
      expect(pos.y).toBe(80);
    });

    it("allows foreground layer objects anywhere", () => {
      const obj = makeObject("foreground", 10);
      const pos = computeFinalPosition(obj);
      expect(pos.y).toBe(10);
    });

    it("still clamps to global bounds 0..100", () => {
      const objAbove = makeObject("ground", -10);
      const posAbove = computeFinalPosition(objAbove);
      expect(posAbove.y).toBe(0);

      const objBelow = makeObject("ground", 120);
      const posBelow = computeFinalPosition(objBelow);
      expect(posBelow.y).toBe(100);
    });
  });

  describe("Server Reducer - Transform Clamping", () => {
    it("clamps transform values in update_object", () => {
      const scene = createEmptyScene();
      const addCmd: DrawingCommand = {
        type: "add_object",
        object: {
          id: "house-1",
          status: "committed",
          layer: "ground",
          transform: { x: 50, y: 50, scale: 1, rotation: 0 },
          shapes: [{ id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 }],
        },
      };
      const sceneWithHouse = applyCommand(scene, addCmd);

      const updateCmd: DrawingCommand = {
        type: "update_object",
        id: "house-1",
        patch: { transform: { x: 150, y: -50, scale: 10, rotation: 500 } },
      };
      const updated = applyCommand(sceneWithHouse, updateCmd);

      expect(updated.objects["house-1"].transform.x).toBe(100);
      expect(updated.objects["house-1"].transform.y).toBe(0);
      expect(updated.objects["house-1"].transform.scale).toBe(3);
      expect(updated.objects["house-1"].transform.rotation).toBe(180);
    });

    it("partial transform updates preserve other fields", () => {
      const scene = createEmptyScene();
      const addCmd: DrawingCommand = {
        type: "add_object",
        object: {
          id: "tree-1",
          status: "committed",
          layer: "ground",
          transform: { x: 30, y: 70, scale: 1.5, rotation: 45 },
          shapes: [{ id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 }],
        },
      };
      const sceneWithTree = applyCommand(scene, addCmd);

      const updateCmd: DrawingCommand = {
        type: "update_object",
        id: "tree-1",
        patch: { transform: { y: 50 } },
      };
      const updated = applyCommand(sceneWithTree, updateCmd);

      expect(updated.objects["tree-1"].transform.x).toBe(30);
      expect(updated.objects["tree-1"].transform.y).toBe(50);
      expect(updated.objects["tree-1"].transform.scale).toBe(1.5);
      expect(updated.objects["tree-1"].transform.rotation).toBe(45);
    });
  });

  describe("Server Reducer - Preview/Committed Updates", () => {
    it("update_preview_object works on committed objects", () => {
      const scene = createEmptyScene();
      const addCmd: DrawingCommand = {
        type: "add_object",
        object: {
          id: "house-1",
          status: "committed",
          layer: "ground",
          transform: { x: 50, y: 70, scale: 1, rotation: 0 },
          shapes: [{ id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 }],
        },
      };
      const sceneWithHouse = applyCommand(scene, addCmd);

      const updateCmd: DrawingCommand = {
        type: "update_preview_object",
        id: "house-1",
        patch: { transform: { y: 30 } },
      };
      const updated = applyCommand(sceneWithHouse, updateCmd);

      expect(updated.objects["house-1"].transform.y).toBe(30);
      expect(updated.objects["house-1"].status).toBe("committed");
    });

    it("commit_preview_object is safe on already committed objects", () => {
      const scene = createEmptyScene();
      const addCmd: DrawingCommand = {
        type: "add_object",
        object: {
          id: "house-1",
          status: "committed",
          layer: "ground",
          transform: { x: 50, y: 70, scale: 1, rotation: 0 },
          shapes: [{ id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 }],
        },
      };
      const sceneWithHouse = applyCommand(scene, addCmd);

      const commitCmd: DrawingCommand = {
        type: "commit_preview_object",
        id: "house-1",
      };
      const result = applyCommand(sceneWithHouse, commitCmd);

      expect(result.objects["house-1"].status).toBe("committed");
      expect(result).toEqual(sceneWithHouse);
    });
  });
});
