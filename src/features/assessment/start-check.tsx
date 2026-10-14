"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { attemptReceiptSchema } from "./attempt-schema";

export function StartCheck({ label = "Start the JavaScript check" }: { label?: string }) {
  const router = useRouter();
  const requestId = useRef(crypto.randomUUID());
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    let navigating = false;
    try {
      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        if (response.status >= 500) throw new Error("unverified");
        setError(
          response.status === 401
            ? "Your session expired. Sign in and return here to start your check."
            : "We couldn’t start the check. Reload your Passport before trying again.",
        );
        return;
      }
      const receipt = attemptReceiptSchema.parse(await response.json());
      navigating = true;
      router.push(`/assessment/${receipt.attemptId}`);
    } catch {
      setError(
        "We couldn’t verify the start. Retry to find the same check; your progress is safe.",
      );
    } finally {
      if (!navigating) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className="start-check">
      <button className="button primary" type="button" disabled={busy} onClick={() => void start()}>
        {busy ? "Opening your check…" : error ? "Retry start" : label}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
