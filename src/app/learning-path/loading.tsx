import { AppShell } from "@/components/app-shell";
export default function Loading() {
  return (
    <AppShell active="learning-path">
      <p role="status">Loading your saved steps and learning context…</p>
    </AppShell>
  );
}
