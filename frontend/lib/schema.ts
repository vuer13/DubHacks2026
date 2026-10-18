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

export const ClipResponseSchema = z
  .object({
    event: ClipEventSchema,
    speak: z.array(SpeakEventSchema),
  })
  .strict();

// Safety events, docs/shared-context.md "Safety events".
export const FallSuspectedEventSchema = z
  .object({
    type: z.literal("fall_suspected"),
    t: z.number().nonnegative(),
    signals: z
      .object({
        motion_spike: z.boolean(),
        static_after: z.boolean(),
        vlm: z.enum(["yes", "no", "unsure"]),
      })
      .strict(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const FallCheckinStartedEventSchema = z
  .object({
    type: z.literal("fall_checkin_started"),
    t: z.number().nonnegative(),
    timeout_s: z.number().int().positive(),
  })
  .strict();

export const FallCancelledEventSchema = z
  .object({
    type: z.literal("fall_cancelled"),
    t: z.number().nonnegative(),
    // The doc example shows "voice"; the check-in overlay also cancels on a tap.
    by: z.enum(["voice", "tap"]),
  })
  .strict();

export const SosSentEventSchema = z
  .object({
    type: z.literal("sos_sent"),
    t: z.number().nonnegative(),
    to: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();

export const OffTrailEventSchema = z
  .object({
    type: z.literal("off_trail"),
    t: z.number().nonnegative(),
    distance_m: z.number().nonnegative(),
    side: z.enum(["left", "right"]),
  })
  .strict();

export const SafetyEventSchema = z.discriminatedUnion("type", [
  FallSuspectedEventSchema,
  FallCheckinStartedEventSchema,
  FallCancelledEventSchema,
  SosSentEventSchema,
  OffTrailEventSchema,
]);

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
export type ClipResponse = z.infer<typeof ClipResponseSchema>;
export type SpeakEvent = z.infer<typeof SpeakEventSchema>;
export type SafetyEvent = z.infer<typeof SafetyEventSchema>;
