import { AppShell } from "@/components/app-shell";
export default function Loading() {
  return (
    <AppShell active="journey">
      <p role="status">Loading your saved journey…</p>
    </AppShell>
  );
}
