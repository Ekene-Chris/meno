import { z } from "zod";

export const entryStates = [
  {
    value: "starting",
    title: "I'm just starting",
    description: "Find a direction and take a manageable first step.",
  },
  {
    value: "active",
    title: "I'm already learning",
    description: "Get support alongside my course or personal study.",
  },
  {
    value: "returning",
    title: "I'm stuck or returning",
    description: "Pick up where I left off, with room to find my rhythm.",
  },
  {
    value: "opportunity_seeking",
    title: "I'm exploring opportunities",
    description: "Connect what I can do to where I want to go.",
  },
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();

export const passportSchema = z.strictObject({
  display_name: optionalText(60),
  entry_state: z.enum(["starting", "active", "returning", "opportunity_seeking"]),
  desired_skill: z.string().trim().min(2, "Tell us which skill you want to develop.").max(120),
  target_role: optionalText(120),
  motivation: optionalText(500),
  study_minutes_per_week: z.number().int().min(15).max(2400).nullable(),
  device: z.enum(["phone", "computer", "shared"]).nullable(),
  bandwidth: z.enum(["limited", "reliable"]).nullable(),
  locale: z.enum(["en", "fr", "pt", "ar"]),
});

export const savePassportSchema = z.strictObject({ requestId: z.uuid(), passport: passportSchema });
export type PassportInput = z.infer<typeof passportSchema>;
