import { z } from "zod";

const GradientColorStopsSchema = z.array(z.union([z.number(), z.string()]))
  .refine(arr => arr.length % 2 === 0, "Gradient stops must have even length [stop,color,stop,color,...]")
  .refine(arr => {
    for (let i = 0; i < arr.length; i += 2) {
      const stop = arr[i];
      if (typeof stop !== 'number' || stop < 0 || stop > 1) return false;
    }
    return true;
  }, "Stops must be numbers in [0..1]");

const GradientPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const VectorShapeBase = z.object({
  id: z.string(),
  role: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().min(0).max(20).optional(),
  fillLinearGradientStartPoint: GradientPointSchema.optional(),
  fillLinearGradientEndPoint: GradientPointSchema.optional(),
  fillLinearGradientColorStops: GradientColorStopsSchema.optional(),
  fillRadialGradientStartPoint: GradientPointSchema.optional(),
  fillRadialGradientEndPoint: GradientPointSchema.optional(),
  fillRadialGradientStartRadius: z.number().min(0).optional(),
  fillRadialGradientEndRadius: z.number().min(0).optional(),
  fillRadialGradientColorStops: GradientColorStopsSchema.optional(),
});

export const RectSchema = VectorShapeBase.extend({
  type: z.literal("rect"),
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
  cornerRadius: z.number().min(0).optional(),
});

export const CircleSchema = VectorShapeBase.extend({
  type: z.literal("circle"),
  x: z.number(),
  y: z.number(),
  radius: z.number().min(0),
});

export const EllipseSchema = VectorShapeBase.extend({
  type: z.literal("ellipse"),
  x: z.number(),
  y: z.number(),
  radiusX: z.number().min(0),
  radiusY: z.number().min(0),
});

const PointsSchema = z.array(z.number()).max(200);

export const LineSchema = VectorShapeBase.extend({
  type: z.literal("line"),
  points: PointsSchema.refine(pts => pts.length % 2 === 0, "Points array must have an even number of elements"),
});

export const PolylineSchema = VectorShapeBase.extend({
  type: z.literal("polyline"),
  points: PointsSchema,
  closed: z.boolean().optional(),
});

export const PolygonSchema = VectorShapeBase.extend({
  type: z.literal("polygon"),
  points: PointsSchema,
});

export const PathSchema = VectorShapeBase.extend({
  type: z.literal("path"),
  d: z.string().max(800),
});

export const TextSchema = VectorShapeBase.extend({
  type: z.literal("text"),
  x: z.number(),
  y: z.number(),
  text: z.string().max(80),
  fontSize: z.number().min(6).max(96).optional(),
  fontFamily: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
});

export const VectorShapeSchema = z.discriminatedUnion("type", [
  RectSchema,
  CircleSchema,
  EllipseSchema,
  LineSchema,
  PolylineSchema,
  PolygonSchema,
  PathSchema,
  TextSchema,
]);

export type VectorShape = z.infer<typeof VectorShapeSchema>;
