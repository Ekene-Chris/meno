import { AppShell } from "@/components/app-shell";
export default function Loading() {
  return (
    <AppShell active="mentor">
      <p role="status">Loading your learning context and private conversation…</p>
    </AppShell>
  );
}
