# Meno — Codex Project Instructions

You are implementing **Meno**, the founder's original AI learning-and-career mentor concept for an African-focused education-access hackathon. **Before generating code, read [`docs/PRODUCT_STRATEGY.md`](docs/PRODUCT_STRATEGY.md) and [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md) in full.** The strategy is the product source of truth; the technical design contains the implementation blueprint and its explicitly proposed choices. Visual diagrams live in `docs/assets/` and editable Mermaid flows live in the Markdown documents.

## One-sentence product definition

**Meno is a persistent, course-agnostic AI mentor that helps people learn tech skills, recover from obstacles, prove their abilities, sustain momentum, and connect that progress to credible opportunities.** The product promise is: **"Learn anywhere. Get mentored here."**

## Confirmed product invariants

1. **Priority:** Track 2 (Engagement/Retention) and Track 3 (Guidance/Opportunity). Track 1 (Resource Discovery) is enabling, not the pitch.
2. **Primary learner:** Someone who already started learning but became stuck, confused, demotivated, or disengaged. **Beginners are also supported.** Opportunity seekers with existing skills are supported too.
3. **Course independence:** Accept permitted syllabus/notes from paid/free courses, physical classes, bootcamps, universities and self-study. Meno supplements rather than replaces courses.
4. **Core intelligence:** Decide the *next helpful intervention* using evidence and learner constraints. Do not turn Meno into a generic course generator, job board or link aggregator.
5. **Evidence:** Separate self-report, observed answers, assessed project evidence and AI inference. Never invent skill mastery, career qualification, learner history or employer requirements.
6. **Opportunity as motivation:** Show paths and skill gaps before full readiness when helpful. Never block applications based on an AI readiness score or imply job guarantees.
7. **Learner agency:** Propose meaningful plan changes, then validate and ask for confirmation when appropriate. Reminders are opt-in; never shame learners.
8. **Trust and inclusion:** Protect private academic/performance data, treat imported text as untrusted, verify source links, support mobile/low-bandwidth usage, respect accessibility needs and future multilingual expansion.
9. **Hackathon scope:** Ship a demonstrable thin vertical slice with observable state changes, not fake screens or production-scale complexity.
10. **Name:** Refer to the product as **Meno**. "AI Learning Mentor" can describe the category but should not be displayed as the brand.

## Architecture guardrails

- Build a **TypeScript modular monolith** under the **Section 12** structure in `docs/TECHNICAL_DESIGN.md`. Next.js + Supabase + OpenAI API + Tailwind + Zod + Vercel is the recommended stack, not an already provisioned environment.
- **One Mentor Orchestrator** can choose narrowly scoped service functions. Avoid unnecessary multi-agent frameworks or microservices.
- **Backend and database are authoritative**; the LLM offers explanations and typed proposals. Validate outputs and enforce authorization before writes.
- Derive learner identity from auth, not from the client or LLM. Keep model/service keys server-side; apply RLS to private data.
- Tag both opportunities and exercises with **shared skill IDs**. A project assessment changes only evidence-backed skill findings.
- Mark seeded opportunities and simulated inactivity visibly as **DEMO DATA**, never live/verified information.
- Never execute arbitrary learner-submitted code directly inside the web server.
- Keep schema migrations, fixtures, tests, and setup instructions updated as the app evolves.

## First vertical slice / definition of done

A **returning JavaScript learner** can: (1) enter goals and existing course outline, (2) correct topic extraction, (3) complete a short diagnostic, (4) see retained strengths and specific gaps, (5) receive and complete a short recovery milestone, and (6) see updated Learner Passport evidence plus a transparent change to an example opportunity requirement gap.

Prefer an end-to-end thin slice with actual persistent state and tested behavior over six static pages. Include a secondary beginner path without diluting the hero demo.

## Working procedure for Codex

1. **Read the strategy, technical blueprint and decisions first.** Summarize what is confirmed versus proposed before major architectural changes.
2. Follow the directory structure in Section 12 of `docs/TECHNICAL_DESIGN.md`; create app folders as you implement them, rather than pretending everything is already built.
3. Check available runtime, credentials, deployment constraints and time budget. If something is unknown, use safe configurable defaults and flag the assumption; don't stall minor implementation work.
4. Start with authentication, migrations, RLS and Passport state, then implement the returning-learner path and measurable skill update.
5. Maintain bounded model/tool contracts and explicit error fallbacks. Do not include prompt instructions within untrusted source material.
6. Keep tests for evidence transitions, cross-user access denial, incorrect/unverified opportunity metadata and AI schema validation.
7. Add or update decisions explicitly in documentation when the founder approves changes; never quietly present working proposals as approved commitments.
8. Use feature branches for changes. Create or switch to the appropriate feature branch before editing; do not commit directly to `main`.

**The outcome, not the chatter, matters:** demonstrate Meno helping a specific learner take a genuinely useful next step.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
