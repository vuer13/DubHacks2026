import { z } from "zod";

export const HazardTypeSchema = z.enum([
  "drop_off",
  "steep_descent",
  "water",
  "loose_rock",
  "roots_steps",
  "low_branch",
  "fork",
  "mud_ice",
  "wildlife",
  "people",
]);

export const ClockDirectionSchema = z.enum(["10", "11", "12", "1", "2"]);
export const DistanceSchema = z.enum(["near", "mid", "far"]);
export const TrailStateSchema = z.enum(["clear", "narrowing", "fork", "unclear"]);
export const ArrowDirectionSchema = z.enum(["left", "right", "ahead", "back"]);
export const SignKindSchema = z.enum(["directional", "warning", "info", "none"]);
export const EarconSchema = z.enum(["note", "caution", "stop", "fork", "sos"]);
export const HapticSchema = z.enum(["none", "short", "double", "long"]);

const GridCoordinateSchema = z.number().int().min(0).max(1000);
export const GroundingPointSchema = z.tuple([
  GridCoordinateSchema,
  GridCoordinateSchema,
]);

export const HazardSchema = z
  .object({
    type: HazardTypeSchema,
    severity: z.number().int().min(1).max(3),
    direction: ClockDirectionSchema,
    distance: DistanceSchema,
    say: z
      .string()
      .min(1)
      .refine((say) => say.trim().split(/\s+/).filter(Boolean).length <= 6, {
        message: "hazard say must contain at most 6 words",
      }),
    point: GroundingPointSchema.nullable().optional(),
  })
  .strict();

export const SignArrowSchema = z
  .object({
    label: z.string(),
    direction: ArrowDirectionSchema,
  })
  .strict();

export const SignReadingSchema = z
  .object({
    kind: SignKindSchema,
    lines: z.array(z.string()),
    arrows: z.array(SignArrowSchema),
    say: z
      .string()
      .min(1)
      .refine((say) => say.trim().split(/\s+/).filter(Boolean).length <= 12, {
        message: "sign say must contain at most 12 words",
      }),
  })
  .strict();

export const ClipEventSchema = z
  .object({
    clip_id: z.string().min(1),
    t_start: z.number().nonnegative(),
    t_end: z.number().nonnegative(),
    hazards: z.array(HazardSchema),
    trail_state: TrailStateSchema,
    surface: z.string(),
    scene: z.string(),
    sign: SignReadingSchema.nullable().optional(),
    model: z.string(),
    latency_ms: z.number().int().nonnegative(),
  })
  .strict()
  .refine((event) => event.t_end >= event.t_start, {
    message: "t_end must be greater than or equal to t_start",
    path: ["t_end"],
  });

export const SpeakEventSchema = z
  .object({
    t: z.number().nonnegative(),
    priority: z.number().int().min(1).max(3),
    say: z.string().min(1),
    earcon: EarconSchema,
    haptic: HapticSchema,
  })
  .strict();

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
  })
  .strict();

export const JobResponseSchema = z
  .object({
    status: z.enum(["running", "done", "error"]),
    events: z.array(ClipEventSchema),
    speak: z.array(SpeakEventSchema),
  })
  .strict();

export type Hazard = z.infer<typeof HazardSchema>;
export type SignReading = z.infer<typeof SignReadingSchema>;
export type ClipEvent = z.infer<typeof ClipEventSchema>;
export type SpeakEvent = z.infer<typeof SpeakEventSchema>;
