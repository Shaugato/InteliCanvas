import { describe, it, expect, beforeEach } from "vitest";
import {
  createEmptyScene,
  applyCommand,
  applyCommands,
  replay,
} from "../reducer";
import type { SceneGraph } from "@shared/scene";
import type { DrawingCommand } from "@shared/commands";

describe("Reducer - Pure Functions", () => {
  let baseScene: SceneGraph;

  beforeEach(() => {
    baseScene = createEmptyScene();
  });

  it("should create empty scene with correct structure", () => {
    expect(baseScene.intent).toBeNull();
    expect(baseScene.objects).toEqual({});
    expect(baseScene.order).toEqual([]);
  });

  it("should add object immutably", () => {
    const cmd: DrawingCommand = {
      type: "add_object",
      object: {
        id: "test-1",
        layer: "ground",
        status: "committed",
        transform: { x: 50, y: 50, scale: 1, rotation: 0 },
        shapes: [{ id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 }],
      },
    };

    const nextScene = applyCommand(baseScene, cmd);

    expect(nextScene).not.toBe(baseScene);
    expect(nextScene.objects).not.toBe(baseScene.objects);
    expect(nextScene.order).not.toBe(baseScene.order);
    expect(baseScene.objects).toEqual({});
    expect(baseScene.order).toEqual([]);
    expect(nextScene.objects["test-1"]).toBeDefined();
    expect(nextScene.order).toEqual(["test-1"]);
  });

  it("should delete object immutably", () => {
    const addCmd: DrawingCommand = {
      type: "add_object",
      object: {
        id: "test-1",
        layer: "ground",
        status: "committed",
        transform: { x: 50, y: 50, scale: 1, rotation: 0 },
        shapes: [{ id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 }],
      },
    };
    const sceneWithObj = applyCommand(baseScene, addCmd);

    const deleteCmd: DrawingCommand = { type: "delete_object", id: "test-1" };
    const nextScene = applyCommand(sceneWithObj, deleteCmd);

    expect(nextScene).not.toBe(sceneWithObj);
    expect(nextScene.objects["test-1"]).toBeUndefined();
    expect(nextScene.order).toEqual([]);
    expect(sceneWithObj.objects["test-1"]).toBeDefined();
  });

  it("should preserve scene.order when updating an existing object", () => {
    const base = createEmptyScene();

    const scene1 = applyCommands(base, [
      {
        type: "add_object",
        object: {
          id: "a-1",
          layer: "sky",
          status: "committed",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          shapes: [
            { id: "a-s1", type: "rect", x: 0, y: 0, width: 10, height: 10 },
          ],
        },
      },
      {
        type: "add_object",
        object: {
          id: "b-1",
          layer: "ground",
          status: "committed",
          transform: { x: 10, y: 10, scale: 1, rotation: 0 },
          shapes: [{ id: "b-s1", type: "circle", x: 0, y: 0, radius: 5 }],
        },
      },
    ]);

    // take a snapshot copy of the order contents
    const orderSnapshot = [...scene1.order];

    const scene2 = applyCommand(scene1, {
      type: "update_object",
      id: "a-1",
      patch: { transform: { x: 5, y: 5 } },
    });

    // order must be unchanged in content
    expect(scene2.order).toEqual(orderSnapshot);

    // and the original must still be unchanged
    expect(scene1.order).toEqual(orderSnapshot);

    // sanity: object updated
    expect(scene2.objects["a-1"].transform.x).toBe(5);
  });

  it("should update object immutably preserving shape order", () => {
    const addCmd: DrawingCommand = {
      type: "add_object",
      object: {
        id: "test-1",
        layer: "ground",
        status: "committed",
        transform: { x: 50, y: 50, scale: 1, rotation: 0 },
        shapes: [
          { id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 },
          { id: "s2", type: "circle", x: 5, y: 5, radius: 3 },
        ],
      },
    };
    const sceneWithObj = applyCommand(baseScene, addCmd);

    const updateCmd: DrawingCommand = {
      type: "update_object",
      id: "test-1",
      patch: { transform: { x: 60, y: 60 } },
    };
    const nextScene = applyCommand(sceneWithObj, updateCmd);

    expect(nextScene).not.toBe(sceneWithObj);
    expect(nextScene.objects["test-1"].transform.x).toBe(60);
    expect(nextScene.objects["test-1"].shapes).toHaveLength(2);
    expect(nextScene.objects["test-1"].shapes[0].id).toBe("s1");
    expect(nextScene.objects["test-1"].shapes[1].id).toBe("s2");
  });
});

describe("Reducer - Deterministic Replay", () => {
  it("should produce same scene from same command sequence", () => {
    const base = createEmptyScene();
    const commands: DrawingCommand[] = [
      {
        type: "add_object",
        object: {
          id: "obj-1",
          layer: "sky",
          status: "committed",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          shapes: [
            { id: "s1", type: "rect", x: 0, y: 0, width: 100, height: 45 },
          ],
        },
      },
      {
        type: "add_object",
        object: {
          id: "obj-2",
          layer: "ground",
          status: "committed",
          transform: { x: 10, y: 20, scale: 1, rotation: 0 },
          shapes: [{ id: "s2", type: "circle", x: 5, y: 5, radius: 10 }],
        },
      },
      { type: "update_object", id: "obj-1", patch: { layer: "background" } },
    ];

    const scene1 = applyCommands(base, commands);
    const scene2 = applyCommands(base, commands);

    expect(scene1).toEqual(scene2);
    expect(scene1.order).toEqual(["obj-1", "obj-2"]);
    expect(scene2.order).toEqual(["obj-1", "obj-2"]);
  });

  it("should replay multiple command lists deterministically", () => {
    const base = createEmptyScene();
    const list1: DrawingCommand[] = [
      {
        type: "add_object",
        object: {
          id: "sky-1",
          layer: "sky",
          status: "committed",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          shapes: [
            { id: "s1", type: "rect", x: 0, y: 0, width: 100, height: 45 },
          ],
        },
      },
    ];
    const list2: DrawingCommand[] = [
      {
        type: "add_object",
        object: {
          id: "sun-1",
          layer: "background",
          status: "committed",
          transform: { x: 80, y: 20, scale: 1, rotation: 0 },
          shapes: [{ id: "s2", type: "circle", x: 0, y: 0, radius: 10 }],
        },
      },
    ];

    let scene1 = base;
    for (const list of [list1, list2]) {
      scene1 = applyCommands(scene1, list);
    }
    
    let scene2 = base;
    for (const list of [list1, list2]) {
      scene2 = applyCommands(scene2, list);
    }

    expect(scene1).toEqual(scene2);
    expect(scene1.order).toEqual(["sky-1", "sun-1"]);
  });
});

describe("Reducer - Preview Workflow", () => {
  it("should handle add preview -> update -> commit flow", () => {
    const base = createEmptyScene();

    const addPreview: DrawingCommand = {
      type: "add_preview_object",
      object: {
        id: "tree-1",
        layer: "foreground",
        status: "preview",
        transform: { x: 20, y: 10, scale: 1, rotation: 0 },
        shapes: [{ id: "t1", type: "rect", x: 0, y: 0, width: 5, height: 15 }],
      },
    };

    const updatePreview: DrawingCommand = {
      type: "update_preview_object",
      id: "tree-1",
      patch: { transform: { x: 25, y: 15 } },
    };

    const commitPreview: DrawingCommand = {
      type: "commit_preview_object",
      id: "tree-1",
    };

    let scene = applyCommand(base, addPreview);
    expect(scene.objects["tree-1"].status).toBe("preview");

    scene = applyCommand(scene, updatePreview);
    expect(scene.objects["tree-1"].transform.x).toBe(25);
    expect(scene.objects["tree-1"].status).toBe("preview");

    scene = applyCommand(scene, commitPreview);
    expect(scene.objects["tree-1"].status).toBe("committed");
  });

  it("should handle cancel preview", () => {
    const base = createEmptyScene();

    const addPreview: DrawingCommand = {
      type: "add_preview_object",
      object: {
        id: "house-1",
        layer: "foreground",
        status: "preview",
        transform: { x: 60, y: 10, scale: 1, rotation: 0 },
        shapes: [{ id: "h1", type: "rect", x: 0, y: 0, width: 20, height: 15 }],
      },
    };

    const cancelPreview: DrawingCommand = {
      type: "cancel_preview_object",
      id: "house-1",
    };

    let scene = applyCommand(base, addPreview);
    expect(scene.objects["house-1"]).toBeDefined();
    expect(scene.order).toEqual(["house-1"]);

    scene = applyCommand(scene, cancelPreview);
    expect(scene.objects["house-1"]).toBeUndefined();
    expect(scene.order).toEqual([]);
  });
});

describe("Reducer - No In-Place Mutation", () => {
  it("should not mutate previous scene references on add", () => {
    const base = createEmptyScene();
    const prevObjects = base.objects;
    const prevOrder = base.order;

    const cmd: DrawingCommand = {
      type: "add_object",
      object: {
        id: "test-1",
        layer: "ground",
        status: "committed",
        transform: { x: 50, y: 50, scale: 1, rotation: 0 },
        shapes: [{ id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 }],
      },
    };

    const next = applyCommand(base, cmd);

    expect(base.objects).toBe(prevObjects);
    expect(base.order).toBe(prevOrder);
    expect(base.objects).toEqual({});
    expect(base.order).toEqual([]);
    expect(next.objects).not.toBe(prevObjects);
    expect(next.order).not.toBe(prevOrder);
  });

  it("should not mutate shapes array on update", () => {
    const base = createEmptyScene();
    const addCmd: DrawingCommand = {
      type: "add_object",
      object: {
        id: "test-1",
        layer: "ground",
        status: "committed",
        transform: { x: 50, y: 50, scale: 1, rotation: 0 },
        shapes: [
          { id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 },
          { id: "s2", type: "circle", x: 5, y: 5, radius: 5 },
        ],
      },
    };
    const withObj = applyCommand(base, addCmd);
    const prevShapes = withObj.objects["test-1"].shapes;

    const updateCmd: DrawingCommand = {
      type: "update_object",
      id: "test-1",
      patch: {
        shapes: [
          { id: "s1", type: "rect", x: 0, y: 0, width: 20, height: 20 },
          { id: "s2", type: "circle", x: 10, y: 10, radius: 8 },
        ],
      },
    };
    const updated = applyCommand(withObj, updateCmd);

    expect(withObj.objects["test-1"].shapes).toBe(prevShapes);
    expect(updated.objects["test-1"].shapes).not.toBe(prevShapes);
  });
});
