import type { CourseInput } from "./course-schema";

export type CourseSnapshot = { revision: number; savedAt: string; content: CourseInput };
export type CourseRecord = {
  id: string;
  revision: number;
  confirmedRevision: number | null;
  status: "draft" | "confirmed" | "draft_changes";
  updatedAt: string;
  draft: CourseSnapshot;
  confirmed: CourseSnapshot | null;
};
export type CourseSkill = { id: string; name: string };
export const sourceLabels: Record<CourseInput["source_type"], string> = {
  online_course: "Online course",
  class: "Physical class",
  bootcamp: "Bootcamp",
  university: "University",
  self_study: "Self-study",
  other: "Other",
};
export function statusLabel(revision: number | null, confirmed: number | null) {
  return confirmed === null ? "Draft" : revision === confirmed ? "Confirmed" : "Changes to review";
}
export const emptyCourse: CourseInput = {
  title: "",
  source_type: "online_course",
  source_url: null,
  outline: "",
  modules: [],
  checkpoint_module_id: null,
  checkpoint_note: null,
};
