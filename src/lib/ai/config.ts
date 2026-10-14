import "server-only";
import { z } from "zod";

const configSchema = z.object({
  key: z.string().min(20).max(1024),
  model: z.string().regex(/^[a-zA-Z0-9._:-]{1,100}$/),
  dailyLimit: z.coerce.number().int().min(1).max(100).default(50),
  reasoningEffort: z.enum(["none", "low"]).optional(),
});

export function getServerModelConfig(
  model: string | undefined,
  reasoningEffort: string | undefined,
) {
  const result = configSchema.safeParse({
    key: process.env.OPENAI_API_KEY,
    model: model?.trim() || undefined,
    dailyLimit: process.env.OPENAI_EXTRACTION_DAILY_LIMIT || undefined,
    reasoningEffort: reasoningEffort?.trim() || undefined,
  });
  return result.success ? result.data : null;
}

export function getExtractionConfig() {
  return getServerModelConfig(
    process.env.OPENAI_EXTRACTION_MODEL,
    process.env.OPENAI_EXTRACTION_REASONING_EFFORT,
  );
}

export const EXTRACTION_TIMEOUT_MS = 25_000;
export const EXTRACTION_OUTPUT_TOKENS = 4000;
