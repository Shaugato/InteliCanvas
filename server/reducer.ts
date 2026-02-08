import type { SceneGraph, SceneObject, Transform } from "../shared/scene";
import type { DrawingCommand } from "../shared/commands";
import { computeOrderKey } from "../shared/layering";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function clampTransform(t: Partial<Transform>): Transform {
  return {
    x: clamp(typeof t.x === "number" ? t.x : 50, 0, 100),
    y: clamp(typeof t.y === "number" ? t.y : 50, 0, 100),
    scale: clamp(typeof t.scale === "number" ? t.scale : 1, 0.1, 3),
    rotation: clamp(typeof t.rotation === "number" ? t.rotation : 0, -180, 180),
  };
}

function orderKey(obj: SceneObject): number {
  return computeOrderKey(obj.layer, obj.semanticTag);
}

function insertIntoOrder(scene: SceneGraph, id: string): string[] {
  const obj = scene.objects[id];
  if (!obj) return scene.order;

  const k = orderKey(obj);
  const without = scene.order.filter((x) => x !== id);

  let idx = 0;
  for (; idx < without.length; idx++) {
    const otherId = without[idx];
    const other = scene.objects[otherId];
    if (!other) continue;
    if (orderKey(other) > k) break;
  }

  without.splice(idx, 0, id);
  return without;
}

export function createEmptyScene(): SceneGraph {
  return {
    intent: null,
    objects: {},
    order: [],
  };
}

export function applyCommand(
  scene: SceneGraph,
  command: DrawingCommand,
): SceneGraph {
  switch (command.type) {
    case "set_scene_intent":
      return {
        ...scene,
        intent: command.intent,
      };

    case "add_preview_object":
    case "add_object": {
      const obj = command.object;
      if (scene.objects[obj.id]) return scene;

      const nextObjects = {
        ...scene.objects,
        [obj.id]: obj,
      };

      const nextScene: SceneGraph = {
        ...scene,
        objects: nextObjects,
        order: scene.order,
      };

      const nextOrder = insertIntoOrder(nextScene, obj.id);

      return {
        ...scene,
        objects: nextObjects,
        order: nextOrder,
      };
    }

    case "update_preview_object":
    case "update_object": {
      const existing = scene.objects[command.id];
      if (!existing) return scene;

      const patch = command.patch as Partial<SceneObject>;

      const mergedTransform = patch.transform !== undefined
        ? clampTransform({ ...existing.transform, ...(patch.transform as any) })
        : existing.transform;

      const updated: SceneObject = {
        ...existing,
        ...(patch.layer !== undefined && { layer: patch.layer }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.semanticTag !== undefined && {
          semanticTag: patch.semanticTag,
        }),
        transform: mergedTransform,
        ...(patch.shapes !== undefined && {
          shapes: [...(patch.shapes as any)],
        }),
      };

      const nextObjects = {
        ...scene.objects,
        [command.id]: updated,
      };
      const beforeK = orderKey(existing);
      const afterK = orderKey(updated);

      if (beforeK === afterK) {
        return {
          ...scene,
          objects: nextObjects,
        };
      }

      const nextScene: SceneGraph = {
        ...scene,
        objects: nextObjects,
        order: scene.order,
      };
      const nextOrder = insertIntoOrder(nextScene, command.id);

      return {
        ...scene,
        objects: nextObjects,
        order: nextOrder,
      };
    }

    case "commit_preview_object": {
      const existing = scene.objects[command.id];
      if (!existing) return scene;
      if (existing.status === "committed") return scene;

      const committed: SceneObject = {
        ...existing,
        status: "committed",
      };

      const nextObjects = {
        ...scene.objects,
        [command.id]: committed,
      };

      return {
        ...scene,
        objects: nextObjects,
      };
    }

    case "cancel_preview_object":
    case "delete_object": {
      const existing = scene.objects[command.id];
      if (!existing) return scene;

      const newObjects = { ...scene.objects };
      delete newObjects[command.id];

      return {
        ...scene,
        objects: newObjects,
        order: scene.order.filter((id) => id !== command.id),
      };
    }

    case "set_background_gradient":
    case "set_ground_fill":
    case "set_path":
      return scene;

    case "batch": {
      let result = scene;
      for (const cmd of command.commands) {
        result = applyCommand(result, cmd);
      }
      return result;
    }

    default:
      return scene;
  }
}

export function applyCommands(
  scene: SceneGraph,
  commands: DrawingCommand[],
): SceneGraph {
  let result = scene;
  for (const cmd of commands) {
    result = applyCommand(result, cmd);
  }
  return result;
}
