import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  const known = error instanceof AppError;
  return NextResponse.json(
    {
      error: {
        code: known ? error.code : "UNAVAILABLE",
        message: known
          ? error.message
          : "We couldn't complete this request. Your saved progress is unchanged. Please try again.",
        requestId: crypto.randomUUID(),
      },
    },
    { status: known ? error.status : 503, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function readMutation(request: Request) {
  const expectedOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if (request.headers.get("origin") !== expectedOrigin) {
    throw new AppError(403, "INVALID_ORIGIN", "Please submit this form from Meno.");
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new AppError(415, "INVALID_CONTENT_TYPE", "Expected JSON content.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "INVALID_INPUT", "A request body is required.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) {
      await reader.cancel();
      throw new AppError(413, "INPUT_TOO_LARGE", "Please shorten your response and try again.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError(400, "INVALID_INPUT", "Please check your form and try again.");
  }
}
