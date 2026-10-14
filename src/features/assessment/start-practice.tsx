"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { practicalReceiptSchema } from "./practical-schema";
export function StartPractice() {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    let navigating = false;
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok)
        throw new Error(
          res.status === 401
            ? "Sign in again, then retry to find the same practice."
            : "We couldn’t verify the start. Retry to find the same practice.",
        );
      const result = practicalReceiptSchema.parse(await res.json());
      navigating = true;
      router.push(`/practice/${result.attemptId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please retry.");
    } finally {
      if (!navigating) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div>
      <button className="button primary" type="button" disabled={busy} onClick={() => void start()}>
        {busy ? "Opening practice…" : error ? "Retry start" : "Start API-app practice"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <a href="/sign-in?next=%2Fpractice" target="_blank" rel="noopener noreferrer">
            Sign in in a new tab
          </a>
        </p>
      )}
    </div>
  );
}
