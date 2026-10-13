import { z } from "zod";

export const COURSE_REQUEST_BYTES = 64 * 1024;
export const COURSE_CONTENT_BYTES = 48 * 1024;
export const courseIdSchema = z.uuid().transform((id) => id.toLowerCase());
export const courseSourceTypes = [
  "online_course",
  "class",
  "bootcamp",
  "university",
  "self_study",
  "other",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();
const referenceUrl = optionalText(2048).refine((value) => {
  if (value === null) return true;
  try {
    const url = new URL(value);
    return (
      /^https?:\/\//.test(value) &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !/[\s\\]/u.test(value)
    );
  } catch {
    return false;
  }
}, "Use an HTTP or HTTPS reference without embedded credentials.");

export const courseTopicSchema = z.strictObject({
  label: z.string().trim().min(1).max(120),
  // null explicitly means unmapped, not a finding about the learner's ability.
  skill_id: z.string().min(1).max(100).nullable(),
});
export const courseModuleSchema = z.strictObject({
  id: courseIdSchema,
  title: z.string().trim().min(1).max(160),
  topics: z.array(courseTopicSchema).max(10),
});
export const courseInputSchema = z
  .strictObject({
    title: z.string().trim().min(2).max(160),
    source_type: z.enum(courseSourceTypes),
    source_url: referenceUrl,
    outline: z.string().trim().max(12000),
    modules: z.array(courseModuleSchema).max(30),
    checkpoint_module_id: courseIdSchema.nullable(),
    checkpoint_note: optionalText(500),
  })
  .superRefine((course, ctx) => {
    const ids = new Set(course.modules.map((module) => module.id));
    if (ids.size !== course.modules.length) {
      ctx.addIssue({
        code: "custom",
        path: ["modules"],
        message: "Each module needs a distinct ID.",
      });
    }
    if (course.checkpoint_module_id && !ids.has(course.checkpoint_module_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["checkpoint_module_id"],
        message: "Choose a checkpoint from this course's modules.",
      });
    }
    if (new TextEncoder().encode(JSON.stringify(course)).byteLength > COURSE_CONTENT_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: "Please shorten the course outline or topic descriptions.",
      });
    }
  });

export const createCourseSchema = z.strictObject({
  requestId: courseIdSchema,
  course: courseInputSchema,
});
export const confirmCourseSchema = z.strictObject({
  requestId: courseIdSchema,
  expectedRevision: z.number().int().min(1).max(2147483646),
});
export const saveCourseSchema = confirmCourseSchema.extend({ course: courseInputSchema });
export const listCoursesSchema = z.strictObject({
  page: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number)
    .pipe(z.number().max(1000))
    .optional()
    .default(0),
});
export const courseMutationResultSchema = z.strictObject({
  courseId: courseIdSchema,
  revision: z.number().int().positive(),
  confirmedRevision: z.number().int().positive().nullable(),
});
export type CourseInput = z.infer<typeof courseInputSchema>;
