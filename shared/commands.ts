import { z } from "zod";
import { SceneObjectSchema, SceneIntentSchema, GradientSchema, PointSchema } from "./scene";

const PatchSchema = z.object({
  layer: z.any().optional(),
  status: z.any().optional(),
  transform: z.any().optional(),
  semanticTag: z.any().optional(),
  shapes: z.any().optional(),
}).strict().refine(data => !('id' in data || 'type' in data), {
  message: "MUST NOT allow patching id or type"
});

type DrawingCommandType = 
  | { type: "set_scene_intent"; intent: z.infer<typeof SceneIntentSchema> | null }
  | { type: "add_preview_object"; object: z.infer<typeof SceneObjectSchema> }
  | { type: "update_preview_object"; id: string; patch: z.infer<typeof PatchSchema> }
  | { type: "commit_preview_object"; id: string }
  | { type: "cancel_preview_object"; id: string }
  | { type: "add_object"; object: z.infer<typeof SceneObjectSchema> }
  | { type: "update_object"; id: string; patch: z.infer<typeof PatchSchema> }
  | { type: "delete_object"; id: string }
  | { type: "set_background_gradient"; gradient: z.infer<typeof GradientSchema> }
  | { type: "set_ground_fill"; fill: string }
  | { type: "set_path"; id: string; bezierPoints: z.infer<typeof PointSchema>[]; widthNear: number; widthFar: number }
  | { type: "batch"; commands: DrawingCommandType[] };

export const DrawingCommandSchema: z.ZodType<DrawingCommandType> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_scene_intent"), intent: SceneIntentSchema.nullable() }),
  z.object({ type: z.literal("add_preview_object"), object: SceneObjectSchema.refine(o => o.status === "preview", "object.status must be preview") }),
  z.object({ type: z.literal("update_preview_object"), id: z.string(), patch: PatchSchema }),
  z.object({ type: z.literal("commit_preview_object"), id: z.string() }),
  z.object({ type: z.literal("cancel_preview_object"), id: z.string() }),
  z.object({ type: z.literal("add_object"), object: SceneObjectSchema.refine(o => o.status === "committed", "object.status must be committed") }),
  z.object({ type: z.literal("update_object"), id: z.string(), patch: PatchSchema }),
  z.object({ type: z.literal("delete_object"), id: z.string() }),
  z.object({ type: z.literal("set_background_gradient"), gradient: GradientSchema }),
  z.object({ type: z.literal("set_ground_fill"), fill: z.string() }),
  z.object({ 
    type: z.literal("set_path"), 
    id: z.string(), 
    bezierPoints: z.array(PointSchema), 
    widthNear: z.number().min(0).max(50), 
    widthFar: z.number().min(0).max(50) 
  }),
  z.object({ type: z.literal("batch"), commands: z.array(z.lazy(() => DrawingCommandSchema)) }),
]);

export type DrawingCommand = DrawingCommandType;
