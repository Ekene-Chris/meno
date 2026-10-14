// Fictional fixture for connecting practice to a direction. No listing or employer is real.
export const demoFrontendBrief = {
  id: "demo-frontend-api-v1",
  label: "DEMO — NOT A LIVE LISTING",
  title: "Fictional frontend API project brief",
  isDemo: true,
  sourceUrl: null,
  deadline: null,
  requirements: [
    { skillId: "js.functions", evidence: "practical" },
    { skillId: "js.arrays", evidence: "practical" },
    { skillId: "js.promises", evidence: "practical" },
    { skillId: "web.fetch-api", evidence: "practical" },
  ],
} as const;
