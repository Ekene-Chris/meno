# Meno implementation plan

Prepared on 13 October 2026 after reviewing the complete handoff and Word strategy. Repository organization, application bootstrap, and Slice 1 are implemented. Slice 2 is next; the full mentor demonstration is not yet complete. See the [root README](../README.md) for the current setup.

Build a persistent mentor that helps a returning learner take a useful next step and see why it matters. The first complete demonstration runs from existing course context to diagnostic evidence, accepted recovery work, evaluated submission, and a changed opportunity requirement gap.

There is no fixed deadline. Work in dependency order, finish each acceptance gate, and keep the returning-learner journey as the priority when choosing scope.

## Scope and decision status

The [product strategy](PRODUCT_STRATEGY.md) defines the product, and the [technical design](TECHNICAL_DESIGN.md) supplies the proposed implementation. The [project review](PROJECT_REVIEW.md) distinguishes confirmed requirements from assumptions and records source inconsistencies.

Bootstrap adopted the recommended TypeScript modular monolith with Next.js, React, local Supabase, Tailwind, and Zod. Exact versions and the npm lockfile are now in the repository. Email/password authentication uses cookie sessions. These are implementation choices recorded in the technical design, not new founder-confirmed product decisions. OpenAI and Vercel remain proposed future integrations; no hosted account or model configuration is implied.

Initial defaults proposed for implementation are a frontend JavaScript curriculum, pasted course outlines, a small vetted resource set, labeled fictional opportunities, English text with stored locale preference, and in-app check-ins. Upload processing, arbitrary web fetching, automated reminders, broad job feeds, and full offline operation are deferred.

## Delivery sequence

| Stage | Dependency | Deliverable | Exit gate |
|---|---|---|---|
| 0. Repository organization | None | Canonical handoff paths, preserved sources, review and plan | Complete; initial source checksums passed. Temporary guides are now consolidated in the root README. |
| 1. Application bootstrap | Stage 0 | Runnable application and reproducible development setup | Complete; clean install, lint, typecheck, unit tests, setup helper, and production build pass. |
| 2. Slice 1: Passport foundation | Stage 1 | Authentication, goals, constraints, private persisted learner context | Implemented; session reentry, atomic saves, cross-user denial, and evidence restrictions pass database/browser tests. |
| 3. Slice 2: Course, diagnostic, recovery | Stage 2 | Editable syllabus mapping, real assessment evidence, proposed/accepted milestone | Two learners with different results receive different justified next steps. |
| 4. Slice 3: Mentor and Momentum | Stage 3 | Contextual help, practical task, approved recovery revision | Evaluated work changes relevant evidence and the next action. |
| 5. Slice 4: Opportunity Radar | Stage 4; requirements fixture can start in Stage 3 | Transparent skill gaps connected to learning | New evidence changes only the opportunity requirements it supports. |
| 6. Slice 5: Demo and resilience | Stages 2–5 | Reproducible full journey, alternative entries, mobile/error validation | David's story completes without manual database changes between steps. |

### Stage 0 — Repository organization

Completed: restored root instructions, strategy/design documents, diagrams, original Word reference, navigation, and editor/ignore settings. Bootstrap populated the agreed application, database, and test folders and consolidated their temporary guides into the root README. The Word strategy, product strategy, and eight diagrams remain unchanged; implementation decisions are appended explicitly to the technical design. Next.js added its generated framework-guidance block to `AGENTS.md`.

### Stage 1 — Application bootstrap

**Status:** Implemented. The following checklist documents the scope delivered; it is not a request to scaffold the app again.

1. Verify supported runtime and framework versions using official documentation. Select one package manager, pin the chosen toolchain, and commit its lockfile when changes are ready for version control.
2. Record stack adoption, local/hosted development database choice, and authentication entry flow in the technical decision log. A local Supabase workflow depends on a working Docker service; check this before assuming it is available. Prefer a simple tester-friendly auth flow without adding social providers.
3. Scaffold Next.js App Router with TypeScript and Tailwind under `src/app/`, with shared UI under `src/components/`. Establish layout, navigation, loading, empty, and error states only for implemented routes.
4. Add validated environment configuration and `.env.example` with placeholders. Separate browser-safe configuration from server-only keys. Keep model selection configurable and report missing integration configuration honestly.
5. Establish `lib/auth/` and `lib/db/` boundaries, shared error responses, and small request/response schemas. Add the AI adapter only when its first feature needs it.
6. Configure lint, typecheck, Vitest, and Playwright commands. Add a lightweight CI workflow using the same commands and a reproducible database test setup when migrations arrive.
7. Replace the README's pre-implementation setup note with commands actually verified on this repository, including clean install, local environment, database setup, development, and test execution.

**Verification:** Start from the lockfile, run the application locally, and pass the initial checks/build. No screen should claim that onboarding, mentorship, or assessment works before it has a working implementation.

### Stage 2 — Slice 1: Secure Learner Passport

**Status:** Implemented and verified locally. Subsequent work should extend these boundaries rather than replace the persistent foundation.

**Directories:** `src/features/learner-passport/`, `src/lib/auth/`, `src/lib/db/`, `src/app/onboarding/`, `src/app/dashboard/`, needed auth/API routes, `supabase/migrations/`, and the three test layers as needed.

1. Implement sign-in, sign-out, session handling, and protected reads/writes. Resolve identity on the server from authenticated context.
2. Create the minimum schema: profiles with entry state and optional learning constraints; learning goals with one active goal per learner; shared skills and prerequisite edges; learner skill state and evidence foundations; bounded learning events.
3. Define evidence provenance and status rules before any route can change assessed skill state. Derive `demonstrated` only from a scoped rubric or checkable assessment result. Keep self-report and AI inference distinguishable.
4. Add grants and RLS with the migrations. Permit appropriate profile/goal edits while restricting assessed evidence and derived status to trusted services. Shared taxonomy is readable but not learner-writable.
5. Seed 10–20 provisional frontend skill IDs and an acyclic prerequisite graph. Leave unassessed learner skills unknown; do not create achievements from onboarding confidence.
6. Build four entry choices, saved goal/preferences, and a dashboard showing the current context and honest next action. Keep optional constraints optional.
7. Document stored data and a scoped way to erase local demo learner data. Keep real personal data out of fixtures and logs.

**Acceptance:** A learner signs in, saves a goal, refreshes, signs out/in, and sees the same Passport. A second user and an anonymous client cannot read or modify it. Client-supplied user IDs cannot change ownership. A learner cannot directly promote their own skill to `demonstrated`.

**Tests:** Actual database authorization for select/insert/update/delete; protected route behavior; onboarding validation; active-goal constraint and retry behavior; session persistence. Auth/RLS failures must block progression to the next slice.

### Stage 3 — Slice 2: Course context, assessment, and first recovery plan

**Directories:** `features/resources/`, `features/assessment/`, `features/learning-paths/`, `app/assessment/`, `app/learning-path/`, the necessary API routes, and the first `lib/ai/` schemas/provider adapter.

1. Add courses/modules, assessments/attempts, learning paths/milestones, and their ownership constraints. Persist a learner's current course checkpoint. Version question sets and rubrics; retain the version used by each attempt.
2. Accept a course title, source type, optional reference URL, and bounded pasted outline. Treat text as untrusted data. A URL is a reference in this slice, not an instruction to fetch restricted content.
3. Extract candidate topics into a validated draft mapped only to existing skill IDs. Show uncertainty, permit corrections, and require confirmation before committing the course mapping. Provide manual topic entry when the provider is unavailable.
4. Implement a short diagnostic for functions, arrays, promises, and relevant prerequisites. Include skip/retake behavior; skipped skills remain `not_assessed`.
5. Score bounded objective items deterministically. Persist answers, scoped findings, evidence references, rubric version, and limitations. An incomplete answer must not silently become a failed skill or a passed task.
6. Use evidence and available study time to propose a short recovery milestone. Validate model suggestions against known skills/resources; select a conservative deterministic next step if generation fails. Save a consequential plan change only after learner confirmation.
7. Align David's fixture explicitly: API integration remains unassessed until observed; promises needs review only when a recorded result supports it. Follow the reconciliation noted in the project review before finalizing fixture data.
8. Define one fictional frontend opportunity's required skill IDs now as a test fixture, so the practical task will later affect a specific requirement.

**Acceptance:** A returning learner corrects syllabus extraction, completes a diagnostic, sees retained strengths and specific gaps, and accepts a short recovery plan. A learner with different answers receives a different next step. Reloading preserves the confirmed course, evidence, and plan.

**Tests:** Ownership of nested modules/attempts/milestones; known/unknown skill IDs; injection-shaped outline text; correct, incorrect, skipped, and partial answers; repeat submissions; no writes from rejected model output; draft-versus-confirmed state; evidence-linked recommendation differences.

### Stage 4 — Slice 3: Contextual mentor and practical progress

**Directories:** `features/momentum/`, `app/mentor/`, `lib/ai/orchestrator.ts`, `lib/ai/prompts/`, `lib/ai/tools/`, plus existing assessment and path modules.

1. Implement one orchestrator that retrieves the active goal, relevant course topics, current milestone, relevant evidence, and a bounded set of recent events. Use narrow typed service calls; the model does not choose the authenticated user or write to the database.
2. Add structured actions for explanation, practice recommendation, and recovery proposals. Validate enums, sizes, IDs, ownership, references, and consent rules before applying any action.
3. Curate a small set of reachable, credible resources with source and checked date, skill tags, format, and bandwidth considerations. Explain each recommendation. Do not invent reading times or resource quality scores.
4. Implement the three-session API-app milestone: promises, fetching data, and completing/reviewing the app. Use fixed structured exercises and a versioned practical rubric. Store submitted code as inert text or a reference; do not execute arbitrary learner code in the web server.
5. Persist assessed findings and change only the supported skill claims. Keep task completion separate from skill demonstration, and show limits of AI-assisted feedback.
6. Record a visibly simulated missed-session event for the demo, offer a respectful check-in, and let the learner accept, edit, or decline a shorter plan. Preserve prior evidence and revision history.
7. Add per-user request limits, input/token bounds, timeouts, redacted request IDs, and a usable provider-failure fallback. Scope retries so an assessment cannot double-create evidence or events.

**Acceptance:** The learner can get course-aware help, complete a practical activity, inspect the new evidence, and see why their next action changed. Declining a recovery proposal leaves the saved plan intact. Provider failure preserves saved work and offers a clear retry/current-task path.

**Tests:** Bounded and authorized tool arguments; unknown evidence/resource rejection; assessment atomicity; duplicate retries; unrelated skills unchanged; plan revision acceptance/decline; provider timeout/refusal/malformed output; simulated-event labeling.

### Stage 5 — Slice 4: Opportunity Radar

**Directories:** `features/opportunities/`, `app/opportunities/`, needed API routes, catalog migrations/seeds, and matching tests.

1. Add opportunities, requirements, and learner-saved records only as needed. Separate required/preferred skills, portfolio evidence, and non-skill eligibility. Represent missing metadata as unknown.
2. Start with a small, visibly labeled fictional catalog aligned to the practical rubric. Display `DEMO — NOT A LIVE LISTING`; do not supply fictional application actions. Introduce live entries only after checking their real source, criteria, location restrictions, and dates.
3. Compare each requirement with recorded evidence through shared skill IDs. Explain demonstrated, needs-review, and unassessed requirements separately. Keep eligibility uncertainty separate from skill gaps.
4. Connect one meaningful gap to a feasible learning task. Show the evidence supporting a changed match after assessment; never derive an authoritative hiring probability from a readiness score.
5. Preserve the learner's freedom to explore and follow genuine application links regardless of Meno's guidance labels.

**Acceptance:** Completing the scoped API task changes the matching API requirement and leaves unrelated requirements unchanged. The learner can identify what is supported, what remains unknown, and what to do next. Fictional and unverified data cannot appear as verified live opportunities.

**Tests:** Required versus preferred skills; non-skill eligibility; unknown/expired/unverified metadata; visible demo labels; same-skill evidence changes; unrelated requirements unchanged; saved-record ownership; no AI readiness gate on genuine application links.

### Stage 6 — Slice 5: Demonstration, resilience, and learning

1. Add repeatable setup for three clearly fictional personas: returning learner, beginner, and opportunity seeker. The active-learning entry should preserve an existing course rather than restart it.
2. Run David's complete flow from sign-in through changed opportunity gaps using actual application actions. Provide reset instructions for local demo data; require no manual database edits during the journey.
3. Verify phone-sized layouts, keyboard navigation, labels/focus, readable feedback, low-bandwidth text paths, loading states, and network retries. If drafts exist locally, distinguish unsynced from saved state.
4. Exercise cross-user attacks, malicious imported text, broken resources, model unavailability, and failed/partial saves. Verify no tokens or private coursework leak into browser bundles or logs.
5. Complete setup, data-handling, fixture, and limitation documentation. Test a clean local installation. If a deployment is requested, choose and configure the target, inspect migrations and environment boundaries, and run smoke checks after deployment.
6. Prepare a concise demo script showing context, evidence before/after, recovery, and opportunity reasoning. Make simulation and assessment limits visible.
7. Run learner usability sessions when participants are available. Resolve the survey contact-wording issue before sharing it. Record findings about the next action, constraints, and motivation without presenting a small sample as proof of long-term retention or employment outcomes.

**Acceptance:** The primary journey succeeds without hidden operator interventions, remains truthful when a dependency fails, and has passed the relevant automated and manual checks. Beginner and opportunity-seeking flows reuse the same evidence model.

## First implementation work package — delivered

The first code change contains the app shell, pinned dependencies and scripts, environment example and local setup helper, auth/session integration, profile/goal/skills/evidence migrations with grants and RLS, onboarding, persistent dashboard, and authorization tests. Shared skills have no fabricated assessment results. No model provider, course importer, diagnostic, recovery path, opportunity feature, or deployment is implemented yet.

Local verification on 13 October 2026: clean `npm ci` completed with no reported dependency vulnerabilities; Biome lint, TypeScript, 28 unit tests, 13 database integration tests, 3 browser journeys, and the production build passed. An additional browser smoke check against the production server verified account creation, Passport saving, sign-out, and sign-in persistence; its temporary learner was removed. Desktop, mobile, and production Passport screenshots were inspected. The setup helper produced complete private local configuration and refused to overwrite it. Browser build assets contained no privileged test configuration. The CI workflow is configured but has not run remotely.

**Next work package:** Stage 3 / Slice 2. Begin with owned course/module records, bounded pasted outlines, editable skill mapping, and a versioned deterministic diagnostic. Add the provider adapter only when extraction first needs it, with manual mapping as a fallback. Carry evidence through to a learner-accepted recovery milestone. Persistence and isolation are now established prerequisites.

## Data and AI boundaries

The normal write path is: authenticate → validate input → authorize related records → run the domain operation → persist a consistent result → return safe application state. Client fields and model output are inputs, never proof of permission.

Model output is a typed proposal. Validate known IDs and learner ownership after schema validation, and reject the entire operation when it is invalid. Use atomic database operations for evidence/state/event updates and for accepted revisions. Model failures should preserve the last valid application state.

Human-editable goals, preferences, and course corrections are distinct from evaluated evidence. Opportunity matching reads evidence; it cannot manufacture it. The full schema can grow with each slice, but these boundaries must hold from the first migration.

## Release evidence

| Requirement | Evidence needed before the full demo is called complete |
|---|---|
| Private persistent Passport | Session-reentry E2E plus real two-user and anonymous database isolation tests. |
| Existing-course continuity | Confirmed topic edits and retained checkpoint survive reload; no compulsory restart. |
| Different abilities, different interventions | Two controlled diagnostic attempts yield different justified next actions. |
| Genuine evidence transition | A scored attempt records provenance/version and updates only supported skills. |
| Respectful recovery and agency | Simulated pause is labeled; accepted/declined revisions behave differently and correctly. |
| Transparent opportunity gaps | Requirement comparison changes only with relevant evidence; sources/demo status are visible. |
| Safe AI failure | Malformed output, injection-shaped text, unknown IDs, and timeouts cannot make unauthorized writes. |
| Reliable retries | Repeating a request cannot double-award evidence or create conflicting active plans. |
| Inclusion and usability | Primary flow works on a mobile viewport, with keyboard access and text alternatives. |
| Reproducible demonstration | Clean setup, fixture/reset steps, and entire hero flow work from the documented commands. |

Use unit tests for deterministic rules, database integration tests for authorization and consistency, and Playwright for user journeys. Live model calls are a separately configured smoke check; required tests should use controlled responses and not depend on paid API availability.

## Deferred work and decision checkpoints

Defer broad curriculum coverage, automatic crawling, paid-course integrations, arbitrary-code grading infrastructure, a vector database, microservices, external notification delivery, billing, full offline sync, and production multilingual coverage.

Before each affected stage, resolve only what is needed: stack/auth/database configuration at bootstrap; diagnostic/rubric and fixture reconciliation before assessment; model/cost limits before live mentor integration; real source verification before live listings; hosting and access settings before deployment. Record approved changes in the existing decision logs. These checkpoints do not delay independent local development.
