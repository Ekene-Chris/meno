import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/http";
import { createAiAdmin } from "@/lib/db/ai-admin";
import { getExtractionConfig } from "@/lib/ai/config";
import { extractOutline, providerError } from "@/lib/ai/outline-provider";
import { validateExtraction } from "@/lib/ai/extraction-schema";
import type { OutlineRequest } from "./outline-schema";
import { getCourse } from "./course-service";

type Db = SupabaseClient<Database>;
const receiptSchema = z.object({
  fresh: z.boolean().optional(),
  status: z.enum(["pending", "ready", "failed"]),
  result: z.unknown().optional(),
  errorCode: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
function requestError(code: string): never {
  if (code === "PT404" || code === "COURSE_NOT_FOUND")
    throw new AppError(404, "COURSE_NOT_FOUND", "That course wasn't found.");
  if (code === "PT409" || code === "COURSE_CONFLICT")
    throw new AppError(
      409,
      "COURSE_CONFLICT",
      "Your course changed. Load the latest saved version before requesting suggestions.",
    );
  if (code === "PT429")
    throw new AppError(
      429,
      "AI_REQUEST_LIMIT",
      "The AI suggestion limit has been reached. You can keep arranging topics manually.",
    );
  if (code.startsWith("AI_")) throw providerError(code);
  throw new AppError(
    503,
    "AI_RESULT_UNVERIFIED",
    "We couldn’t verify this suggestion request. Retry the same request to check its result; your course is unchanged.",
  );
}

export async function suggestCourseOutline(
  db: Db,
  userId: string,
  input: OutlineRequest,
  dependencies = {
    createAdmin: createAiAdmin,
    config: getExtractionConfig,
    extract: extractOutline,
  },
) {
  // Validate session-scoped ownership before ever using the privileged accounting client.
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw providerError();
  if (!profile)
    throw new AppError(
      409,
      "PASSPORT_REQUIRED",
      "Complete your Passport before requesting suggestions.",
    );
  if (input.courseId) {
    const course = await getCourse(db, input.courseId);
    if (
      course.revision !== input.expectedRevision ||
      course.confirmedRevision !== input.expectedConfirmedRevision
    )
      requestError("PT409");
  }
  const { data: skills, error } = await db
    .from("skills")
    .select("id, name, description")
    .order("position")
    .limit(100);
  if (error || !skills?.length) throw providerError();
  const config = dependencies.config();
  if (!config) throw providerError("AI_NOT_CONFIGURED");
  const admin = dependencies.createAdmin();
  const { requestId, ...payload } = input;
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const reservation = await admin.rpc("reserve_outline_extraction", {
    p_user_id: userId,
    p_request_id: requestId,
    p_input_hash: inputHash,
    ...(input.courseId ? { p_course_id: input.courseId } : {}),
    p_expected_revision: input.expectedRevision,
    ...(input.expectedConfirmedRevision !== null
      ? { p_expected_confirmed_revision: input.expectedConfirmedRevision }
      : {}),
    p_model: config.model,
    p_daily_limit: config.dailyLimit,
  });
  if (reservation.error) requestError(reservation.error.code);
  const receipt = receiptSchema.parse(reservation.data);
  if (!receipt.fresh) {
    if (receipt.status === "ready")
      return {
        requestId,
        result: validateExtraction(
          receipt.result,
          skills.map((skill) => skill.id),
        ),
      };
    if (receipt.status === "failed") requestError(receipt.errorCode ?? "AI_UNAVAILABLE");
    throw new AppError(
      409,
      "AI_IN_PROGRESS",
      "Your suggestion request is still being checked. Retry it shortly; keep using the manual editor.",
    );
  }
  let result: ReturnType<typeof validateExtraction>;
  try {
    result = validateExtraction(
      await dependencies.extract({ title: input.title, outline: input.outline }, skills, config),
      skills.map((skill) => skill.id),
    );
  } catch (error) {
    const failure = error instanceof AppError ? error : providerError("AI_INVALID_OUTPUT");
    // Failure also consumes a reservation. No automatic provider retries or raw error logging.
    await admin.rpc("finish_outline_extraction", {
      p_user_id: userId,
      p_request_id: requestId,
      p_result: null,
      p_error_code: failure.code,
    });
    throw failure;
  }
  const finalized = await admin.rpc("finish_outline_extraction", {
    p_user_id: userId,
    p_request_id: requestId,
    p_result: result,
  });
  if (finalized.error) requestError(finalized.error.code);
  const complete = receiptSchema.parse(finalized.data);
  if (complete.status !== "ready") requestError(complete.errorCode ?? "AI_UNAVAILABLE");
  return {
    requestId,
    result: validateExtraction(
      complete.result,
      skills.map((skill) => skill.id),
    ),
  };
}
