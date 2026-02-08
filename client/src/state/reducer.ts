import type { SceneGraph, SceneObject, Transform } from "@shared/scene";
import type { DrawingCommand } from "@shared/commands";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const clampScale = (n: number) => clamp(n, 0.1, 3);
const clampRot = (n: number) => clamp(n, -180, 180);

const num = (v: any): v is number => typeof v === "number" && isFinite(v);

function applyTransformPatch(existing: Transform, patch: any): Transform {
  if (!patch || typeof patch !== "object") return existing;

  const out: Transform = { ...existing };
  const hasAbsX = num(patch.x);
  const hasAbsY = num(patch.y);
  const hasAbsScale = num(patch.scale);
  const hasAbsRot = num(patch.rotation);

  if (hasAbsX) out.x = patch.x;
  if (hasAbsY) out.y = patch.y;
  if (hasAbsScale) out.scale = patch.scale;
  if (hasAbsRot) out.rotation = patch.rotation;

  const dx = num(patch.dx)
    ? patch.dx
    : num(patch.xDelta)
      ? patch.xDelta
      : num(patch.deltaX)
        ? patch.deltaX
        : undefined;

  const dy = num(patch.dy)
    ? patch.dy
    : num(patch.yDelta)
      ? patch.yDelta
      : num(patch.deltaY)
        ? patch.deltaY
        : undefined;

  const dScale = num(patch.dScale)
    ? patch.dScale
    : num(patch.scaleDelta)
      ? patch.scaleDelta
      : undefined;

  const dRotation = num(patch.dRotation)
    ? patch.dRotation
    : num(patch.rotationDelta)
      ? patch.rotationDelta
      : undefined;

  if (!hasAbsX && dx !== undefined) out.x = existing.x + dx;
  if (!hasAbsY && dy !== undefined) out.y = existing.y + dy;

  if (!hasAbsScale && dScale !== undefined) out.scale = existing.scale + dScale;

  if (!hasAbsRot && dRotation !== undefined)
    out.rotation = existing.rotation + dRotation;

  out.x = clamp(out.x);
  out.y = clamp(out.y);
  out.scale = clampScale(out.scale);
  out.rotation = clampRot(out.rotation);

  return out;
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
      return { ...scene, intent: command.intent };

    case "add_preview_object":
    case "add_object": {
      const obj = command.object;
      if (scene.objects[obj.id]) return scene;

      return {
        ...scene,
        objects: { ...scene.objects, [obj.id]: obj },
        order: [...scene.order, obj.id],
      };
    }

    case "update_preview_object":
    case "update_object": {
      const existing = scene.objects[command.id];
      if (!existing) return scene;

      const patch = command.patch as Partial<SceneObject> & { transform?: any };

      const nextTransform =
        patch.transform !== undefined
          ? applyTransformPatch(existing.transform, patch.transform)
          : existing.transform;

      const nextShapes =
        patch.shapes !== undefined && Array.isArray(patch.shapes)
          ? [...patch.shapes]
          : undefined;

      const updated: SceneObject = {
        ...existing,
        ...(patch.layer !== undefined && { layer: patch.layer as any }),
        ...(patch.status !== undefined && { status: patch.status as any }),
        ...(patch.semanticTag !== undefined && {
          semanticTag: patch.semanticTag as any,
        }),
        transform: nextTransform,
        ...(nextShapes !== undefined && { shapes: nextShapes }),
      };

      return {
        ...scene,
        objects: { ...scene.objects, [command.id]: updated },
      };
    }

    case "commit_preview_object": {
      const existing = scene.objects[command.id];
      if (!existing || existing.status !== "preview") return scene;

      const committed: SceneObject = { ...existing, status: "committed" };

      return {
        ...scene,
        objects: { ...scene.objects, [command.id]: committed },
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
      for (const cmd of command.commands) result = applyCommand(result, cmd);
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
  for (const cmd of commands) result = applyCommand(result, cmd);
  return result;
}
