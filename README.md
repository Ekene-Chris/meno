# Meno

**Learn anywhere. Get mentored here.**

Meno is a persistent, course-agnostic AI learning and career mentor. It helps learners who have stalled regain momentum, demonstrate practical skills, and connect their progress to credible opportunities. Beginners and learners seeking opportunities share the same underlying learner context.

## Current implementation

Application bootstrap and **Slice 1: Learner Passport** are implemented:

- Email/password account creation, sign-in, cookie sessions, and sign-out.
- Four onboarding entries: beginning, returning or stuck, actively learning, and exploring opportunities.
- A private, persistent goal, optional learning preferences, and Passport dashboard.
- Fourteen shared frontend skills, initially **not assessed**, with evidence provenance enforced in the database.
- Atomic, retry-safe Passport saves and tested database access controls.
- Unit, database integration, and browser tests, plus a CI workflow.

**C1: Course-context persistence** is also implemented at the API/database layer. Authenticated learners can save versioned course drafts, ordered modules, topic mappings, and a checkpoint; confirm the revision they reviewed; and retrieve draft and confirmed context separately. Updates reject stale revisions, retries return their original result, and private course records are protected by grants and RLS. The [course API contract](docs/COURSE_CONTEXT.md) describes the endpoints and limits.

**C2: Course editor and review** is implemented on `feat/course-editor`. Open **My courses** from the dashboard or navigation to add a course, arrange modules and topics, choose shared skills or leave topics unmapped, and keep your checkpoint. Save a draft, review it, then explicitly confirm it. Later edits retain the previous confirmed context. Conflicting saves preserve your form for comparison; uncertain saves can be retried without duplicates.

**AI1: Course outline suggestions** is implemented on `feat/course-outline-extraction`, with local and live preview acceptance verified. Learners can request candidate modules and uncertain skill matches, choose whether to use them, correct the form, and save/confirm through C2. Requests are bounded and retry-safe; provider failure preserves manual editing. See the [extraction contract](docs/OUTLINE_EXTRACTION.md) for server configuration and limitations.

**D1/D2: JavaScript skill checks** adds eight versioned questions, server-only answer keys and deterministic correct/partial/incorrect/skipped observations. Open **Skill checks** to save answers, resume in another session, review results and inspect scoped evidence in the Passport. Exact retries cannot duplicate findings; skipped/incomplete retakes preserve earlier complete evidence. Findings describe fixed quiz examples, not certification or project readiness. See the [diagnostic contract](docs/DIAGNOSTIC.md).

Mentoring, recovery plans, and opportunity matching follow in the [implementation plan](docs/IMPLEMENTATION_PLAN.md). A [hosted development environment](docs/HOSTED_DEVELOPMENT.md) uses Supabase and the connected Vercel project.

## Local development

Use Node.js `22.23.2`, npm `10.9.8`, and a running Docker engine. From the repository root:

```sh
nvm use
npm ci
npm run db:start
npm run db:migrate
npm run db:env
npm run dev
```

Open [Meno locally](http://localhost:3000), choose **Create an account**, and complete onboarding. `nvm use` is optional if the required Node version is already installed. The Supabase CLI is a pinned project dependency; a global installation is unnecessary.

`db:env` creates an ignored `.env.local` from the local Supabase stack without printing credentials. It refuses to overwrite an existing file: skip that step on an already configured checkout. [`.env.example`](.env.example) documents each variable. Keep `NEXT_PUBLIC_APP_URL` equal to the browser origin, including the port, when changing the development address.

Diagnostics require the server-only `SUPABASE_SECRET_KEY`; new local setup writes it from the local stack. An older configured checkout must add its local service-role key under this name without exposing it in chat or a public variable. OpenAI settings are optional for manual course entry and deterministic checks.

The local stack uses API port `54321`, database port `54322`, and email preview port `54324`. Email confirmation is disabled locally and, by the founder’s choice, on the hosted development project. The [hosted guide](docs/HOSTED_DEVELOPMENT.md) records that configuration; verified pilot authentication and email delivery remain future work.

After pulling a feature branch with new migrations, run `npm run db:migrate` against the running local stack. It applies pending migrations without resetting existing learner data. New checkouts also use this command; already-applied migrations are skipped.

`npm run db:stop` stops the local stack and preserves its data. To intentionally erase **all local learner accounts and application data**, use `npm run db:reset`; it reapplies migrations and the shared skill seed. The reset command explicitly targets the local database. Automated tests instead remove or roll back their own temporary learners.

## Verification

With the local database running and `.env.local` configured:

```sh
npm run check
npm run test:integration
npm run test:browser:install
npm run test:e2e
npm run build
```

`check` runs Biome lint, TypeScript, and unit tests. Integration tests exercise the real database, including anonymous and cross-user denial, evidence integrity, concurrent saves/evaluation, skipped retakes and retries. Browser tests start their own application on port `3100` and check persistence, session reentry, mobile onboarding/course editing/diagnostics, scoped results, Passport evidence, conflicts, lost responses, pagination and protected routes. Database and browser test setup rejects non-loopback database/API hosts.

Regenerate database types after schema changes with `npm run db:types`. [CI](.github/workflows/checks.yml) uses the same setup and verification commands; C1's checks passed on [PR #1](https://github.com/Ekene-Chris/meno/pull/1). CI does not deploy the application.

## Repository layout

```text
meno/
├── AGENTS.md
├── README.md
├── docs/
│   ├── PRODUCT_STRATEGY.md
│   ├── TECHNICAL_DESIGN.md
│   ├── PROJECT_REVIEW.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── COURSE_CONTEXT.md
│   ├── assets/
│   └── reference/
│       └── Meno_Product_Strategy.docx
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── lib/
│   ├── types/
│   └── proxy.ts
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   ├── config.toml
│   └── setup.mjs
└── tests/
    ├── unit/
    ├── integration/
    ├── e2e/
    └── helpers/
```

This follows the agreed layout, with root tooling files and `.github/` supporting development. The temporary directory guides have been consolidated into this single README. Create further feature modules as their slices are implemented.

## Architecture and data boundaries

The implemented stack is a TypeScript modular monolith using Next.js App Router, React, Tailwind, Supabase/Postgres, and Zod. Dependency versions are pinned in `package.json` and `package-lock.json`. Biome, Vitest, and Playwright cover lint, domain/database checks, and browser behavior.

Routes authenticate and validate requests, feature services load or save domain state, and the database enforces ownership and evidence rules. `save_passport` derives identity from authentication, serializes concurrent saves for each learner, and deduplicates request IDs. Clients cannot write assessed evidence or promote their own skills directly.

Stored data includes the authentication account, chosen entry state, goal, optional display name and learning preferences, skill summaries, scoped evidence and bounded history events. The course API stores permitted outlines, module/topic mappings, self-reported checkpoints and retained course revisions. Diagnostics store assigned question versions, saved answer choices/skips, feedback, evaluations and retry receipts. Course/diagnostic event receipts contain fingerprints and entity/revision IDs, not copies of outlines or answers. No practical task submissions, AI conversation logs or live opportunity records are collected yet. Language preference is stored for future use; the current interface is English.

Passport/course services and diagnostic reads use the public Supabase key and the learner's session. AI accounting and trusted diagnostic mutations use a separate server-only `SUPABASE_SECRET_KEY` after session-scoped authorization and ownership checks. Private candidate proposals retain validated results and fingerprints, not duplicated source outlines. The separate test-key variable is for local fixture setup/cleanup. OpenAI receives only course titles/outlines plus the shared skill catalog when the learner requests suggestions; diagnostic responses are graded deterministically without a model call.

## Project documents

- [AGENTS.md](AGENTS.md): project instructions and product boundaries.
- [Product strategy](docs/PRODUCT_STRATEGY.md): users, scope, and confirmed product decisions.
- [Technical design](docs/TECHNICAL_DESIGN.md): architecture blueprint and implementation decision log.
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md): full product roadmap, ordered work queue, acceptance gates, pilot readiness and later expansion. D1 is merged; D2 adds the assessment journey, with recovery proposals next.
- [Outline extraction](docs/OUTLINE_EXTRACTION.md): suggestion review, provider/configuration limits, request accounting, privacy, and manual fallback.
- [Diagnostic contract](docs/DIAGNOSTIC.md): versioned questions, narrow scoring, private attempts, save/retry behavior and scoped evidence precedence.
- [Course-context contract](docs/COURSE_CONTEXT.md): implemented API, draft/confirmation behavior, limits, and verification.
- [Hosted development](docs/HOSTED_DEVELOPMENT.md): Vercel/Supabase targets, development sign-up choice, runtime settings, and deployment workflow.
- [Initial project review](docs/PROJECT_REVIEW.md): source audit, folder repair, and findings to carry forward.
- [Original Word strategy](docs/reference/Meno_Product_Strategy.docx): preserved source reference.

Implementation references: [Next.js setup](https://nextjs.org/docs/app/getting-started/installation), [Supabase server-side authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [local development](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Contribution workflow

Create or switch to a feature branch before changing files. Commit coherent, verified work on that branch; do not commit directly to `main`. Keep the implementation plan and relevant contracts current as each package is delivered.

## Product boundaries

- Track 2, learner engagement, and Track 3, guidance and opportunity, drive the product.
- Record self-report, observed answers, assessed work, and AI inference distinctly.
- Persist only authorized, validated changes; require appropriate learner confirmation for plan revisions.
- Label fictional opportunities and simulated inactivity visibly as demo data.
- Preserve learner agency, course independence, privacy, accessibility, and text-first mobile use.
