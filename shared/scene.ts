import { z } from "zod";
import { VectorShapeSchema } from "./vectorShapes";

export const SceneObjectType = z.enum([
  "tree", "house", "mountain", "sun", "birds", "flowers", "bush", "path", "sky", "field",
]);
export type SceneObjectType = z.infer<typeof SceneObjectType>;

export const SemanticTagSchema = z.string().min(1).max(32);
export type SemanticTag = z.infer<typeof SemanticTagSchema>;

export const SceneLayer = z.enum(["sky", "ground", "background", "foreground"]);
export type SceneLayer = z.infer<typeof SceneLayer>;

export const SceneObjectStatus = z.enum(["preview", "committed"]);
export type SceneObjectStatus = z.infer<typeof SceneObjectStatus>;

export const PointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});
export type Point = z.infer<typeof PointSchema>;

export const TransformSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  scale: z.number().min(0.1).max(3),
  rotation: z.number().min(-180).max(180),
});
export type Transform = z.infer<typeof TransformSchema>;

export const SceneIntentSchema = z.object({
  description: z.string(),
  mood: z.enum(["calm", "bright", "dramatic", "sunset"]).optional(),
  paletteHint: z.string().optional(),
});
export type SceneIntent = z.infer<typeof SceneIntentSchema>;

export const GradientSchema = z.object({
  kind: z.literal("linear"),
  from: PointSchema,
  to: PointSchema,
  stops: z.array(z.object({
    offset: z.number().min(0).max(1),
    color: z.string(),
  })),
});
export type Gradient = z.infer<typeof GradientSchema>;

export const StyleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().min(0).max(20).optional(),
  opacity: z.number().min(0).max(1).optional(),
  gradient: GradientSchema.optional(),
  textureRef: z.string().optional(),
});
export type Style = z.infer<typeof StyleSchema>;

export const SceneObjectSchema = z.object({
  id: z.string(),
  status: SceneObjectStatus,
  layer: SceneLayer,
  transform: TransformSchema,
  semanticTag: SemanticTagSchema.optional(),

  shapes: z.array(VectorShapeSchema).min(1).max(60),
});
export type SceneObject = z.infer<typeof SceneObjectSchema>;

export const SceneGraphSchema = z.object({
  intent: SceneIntentSchema.nullable(),
  objects: z.record(z.string(), SceneObjectSchema),
  order: z.array(z.string()),
});
export type SceneGraph = z.infer<typeof SceneGraphSchema>;
