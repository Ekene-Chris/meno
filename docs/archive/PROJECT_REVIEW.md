# Meno project review

Initial review on 13 October 2026, before application implementation. This historical audit records the starting repository state, handoff repair, and findings that affect implementation. For current functionality and setup, use the [root README](../../README.md); for completed and upcoming work, use the [implementation plan](../IMPLEMENTATION_PLAN.md). Bootstrap and Slice 1 have since been implemented, and the temporary directory READMEs were consolidated into the root README.

## Product understanding

Meno helps people continue a learning journey they have already started. The central interaction is choosing a useful next step from the learner's goal, existing course, demonstrated abilities, obstacles, and practical constraints. Engagement and opportunity should reinforce each other: a credible target explains why a skill matters, and assessed progress changes the learner's visible gaps.

The Learner Passport holds that continuity. The Momentum Engine uses it to offer explanations, practice, and recovery milestones. The Opportunity Engine uses the same skill identifiers and evidence to explain requirements and suggest relevant practice. These are responsibilities within one application, not separate products or deployments.

The hero demonstration follows David, a fictional returning JavaScript learner. It must show actual persisted changes from course context through diagnosis, accepted recovery work, assessment, and an updated opportunity comparison. Beginners, active learners, and opportunity seekers use the same model. The demonstration should remain usable on a phone, with text-first guidance and understandable failure states.

## Sources reviewed

| Source | Review result |
|---|---|
| Original repository `README.md` and `.gitignore` | Only a two-line product description and baseline ignore rules; no application files. Git working tree was clean on `main`. |
| Handoff `AGENTS.md` | Read in full; defines product invariants, modular boundaries, and incremental folder creation. Restored to the repository root without modification. |
| Handoff root `README.md` | Read in full; describes a documentation-only delivery and contains a sample future build prompt. |
| Handoff `docs/README.md` | Byte-identical duplicate of the handoff root README, with root-relative links inappropriate for its nested location. Replaced in the project by a documentation index. |
| `PRODUCT_STRATEGY.md` | Read in full, including research draft, confirmed decisions, proposals, and acceptance checks. Preserved unchanged. |
| `TECHNICAL_DESIGN.md` | Read in full, including schemas, AI contracts, security, target tree, and five slices. Preserved unchanged. |
| `Meno_Product_Strategy.docx` | Full text reviewed, including tables and research questions; consistent with the central strategy. Preserved unchanged as a reference. This was a content review, not a Word layout-editing task. |
| Eight PNG diagrams | All inspected visually. They support the track priorities, course independence, mentorship loop, shared context, opportunity gaps, screen proposal, entry states, and David demo. |

The original handoff and Word file were preserved separately. The project carries its own source reference and diagrams, so another checkout does not depend on the founder’s personal filesystem paths.

## Initial structural changes

- Restored `AGENTS.md`, both strategy/design Markdown files, and all eight diagrams to the paths expected by the handoff.
- Preserved the Word strategy under `docs/reference/` so it travels with the repository.
- Replaced the placeholder project README with an accurate project entry point and current setup status.
- Added a proper documentation index instead of copying the misplaced duplicate README.
- Established `src/`, `supabase/`, and `tests/` with responsibility guides. Application subdirectories will be created with their implementation, following technical design Section 12 and the working procedure in `AGENTS.md`.
- Added shared editor settings and ignore rules for environment files, future browser-test output, and local Supabase state.
- Added the implementation plan and this review. Original source documents, Downloads files, and Git history were preserved.

No dependency installation, application generation, migrations, account creation, deployment, commit, or push was part of this structural pass.

Verification passed: SHA-256 comparisons confirmed all 12 copied source files are unchanged, including the eight diagrams and Word reference. All 35 local Markdown links across 10 Markdown files resolve. No Finder metadata was imported. Git's whitespace check passed for tracked edits, and ignore-rule checks confirmed local environment files and generated test/database state are excluded while `.env.example` remains eligible for version control. Application tests were not applicable because there is no application or test runner yet.

## Confirmed requirements and working assumptions

| Topic | Status for implementation |
|---|---|
| Name, Meno | Founder-confirmed in the handoff. |
| Tracks 2 and 3, returning learners, course independence, beginner support | Confirmed product direction. |
| Persistent context and evidence-backed progress | Core requirements. Never treat self-report or AI confidence as demonstrated mastery. |
| Opportunities during learning | Confirmed direction; transparent gaps and learner agency are required. |
| Single TypeScript modular monolith | Handoff architecture baseline; follow its module boundaries for the proposed implementation. |
| Next.js, Supabase, OpenAI, Tailwind, Zod, Vercel | Recommended stack, not provisioned services or a recorded founder approval. Record adoption when application work starts. |
| Frontend JavaScript demo and six-screen organization | Working proposals. Plan around them without claiming broad subject coverage or a fixed final interface. |
| Pasted outlines and a small curated catalog | Recommended initial scope. File ingestion and automatic URL fetching are optional later work. |
| Clearly labeled fictional opportunities first | Proposed way to make the initial end-to-end flow reproducible. Real entries require source verification. |
| Local npm workflow | Proposed because npm is already available. No package manager or lockfile has yet been adopted. |
| Fixed deadline | None supplied; the user asked to proceed without a deadline-driven schedule. Sequence by dependencies and acceptance gates. |

## Findings to carry into implementation

### Evidence state conflict in the David fixture

Product strategy Section 10 and `07_david_hero_demo.png` leave API integration **not assessed**. Technical design Section 15 describes both promises and API integration as needing review. These states have different meanings.

Before seeding the scenario, align the fixture with the evidence policy. Proposed baseline: API integration stays `not_assessed` until an actual task supplies evidence; promises becomes `needs_review` only after a recorded result supports that finding. Do not seed either status as a real learner's result. This is an explicit proposed reconciliation, not a silent edit or an approved change to either source document.

### The conceptual schema needs implementation details

The technical table list is a blueprint, not executable SQL. Settle these points in the relevant migration:

- Persist the four-state entry value; it is described in the experience but absent from the conceptual `profiles` field list. Decide which course/module checkpoint represents where the learner stopped.
- Enforce one active goal per learner consistently, including concurrent submissions.
- Define where versioned assessment questions, rubrics, submitted answers, and AI inference are stored. A seeded question/rubric definition is sufficient if attempts retain a stable version reference.
- Restrict assessed evidence and derived skill status to trusted evaluation paths. A broad owner-write policy on these tables would allow fabricated mastery even if it prevents cross-user access.
- Authorize child rows through their owning course, path, or assessment. Validate that referenced goals, evidence, attempts, and path revisions belong to the same learner.
- Store non-skill eligibility separately from skill requirements, allowing unknown values. Location and education rules do not become fake skill IDs.
- Make attempt evaluation, evidence updates, and event recording atomic and safe to retry; apply the same discipline to accepted path revisions.

These details belong in domain contracts and migrations, rather than speculative empty SQL files in this setup pass.

### Assessment and demo truthfulness

The sample opportunity graphic uses a backend role and qualitative progress bars. It illustrates the product idea; it is not a frontend curriculum specification or a validated scoring model. The demo's diagnostic, practical rubric, and opportunity requirements must refer to the same scoped JavaScript skills.

The first grader should evaluate fixed, bounded answers and an explicit practical rubric. Uploaded or pasted code must not execute in the application server. AI-assisted feedback must disclose its limits and cannot, by itself, certify general employability.

### Research and release follow-ups

The survey introduction mentions optional contact details, but the ten questions contain no completed contact opt-in. Resolve the wording before distributing the survey. No survey has been published or sent by this task.

Naming availability, funding for free learner access, live opportunity sources, full multilingual support, scheduled outbound reminders, and long-term learning/employment outcomes remain future work. They do not block the local prototype.

## Environment at the initial review

Observed locally: Node.js `v22.23.2`, npm `10.9.8`, and Docker/Vercel executable paths. Supabase CLI and pnpm were not found on `PATH`. Docker daemon status, provider accounts, API access, hosting limits, and model availability were not tested. No project-local `.env` or application configuration exists.

Bootstrap must verify compatible maintained dependencies against official documentation before pinning versions. Choose an authentication entry flow and development database, then record the decisions. Credentials should be supplied through local environment configuration when integration needs them; structural work requires none.

## Next action identified by the initial review

Execute the bootstrap and Slice 1 tasks in the [implementation plan](../IMPLEMENTATION_PLAN.md). The first product milestone is a learner who signs in, saves a goal and preferences, and returns to the same private Passport in another session, with database isolation proved using a second user.
