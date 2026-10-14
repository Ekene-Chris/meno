# Meno

**Learn anywhere. Get mentored here.**

Meno is a persistent, course-agnostic AI learning and career mentor. It helps people who have stalled reconnect with their existing learning, take a useful next step and understand how their progress relates to an opportunity direction. Beginners and opportunity seekers share the same private learner context.

## What works today

The working frontend/JavaScript prototype connects:

- Email/password signup, four learner entry states and a persistent Learner Passport.
- Versioned course outlines, reviewed AI topic suggestions and a self-reported checkpoint.
- Resumable JavaScript checks, scoped evidence and learner-approved next steps.
- Course-aware mentor explanations with retained private history and provider fallbacks.
- Guided practical work, explicit progress recording and suggested follow-ups.
- Three clearly fictional opportunity briefs with saved before/after requirement comparisons.
- In-app obstacle check-ins and optional, visibly simulated pauses with recovery proposals.

Guided practice covers fixed code choices and traces; it does not verify an independently built app. Pasted code is stored as inert text. Opportunity entries are examples, not live listings. Accepting a plan changes intention, not skill evidence or course completion.

## Run locally

Use Node.js **22.23.2**, npm **10.9.8** and a running Docker engine:

```sh
nvm use
npm ci
npm run db:start
npm run db:migrate
npm run db:env
npm run dev
```

Open [localhost:3000](http://localhost:3000), create an account and complete onboarding. Choose a returning JavaScript learner to explore the complete course → check → accepted step → mentor → guided work → Passport → opportunity comparison flow. Save an example before practice to retain a baseline; submission and **Record progress** are separate actions.

`db:env` writes an ignored local configuration without printing credentials and refuses to overwrite an existing `.env.local`. Skip it on an already configured checkout. It includes the server-only Supabase writer and local fixture keys. [`.env.example`](.env.example) explains the variables. Keep `NEXT_PUBLIC_APP_URL` equal to the browser origin, including its port.

Manual course editing, diagnostic scoring, plans, guided feedback, recovery and opportunity comparisons work without an OpenAI key. AI outline suggestions and mentor replies need server-only `OPENAI_API_KEY`, a configured model and the trusted Supabase writer. Review [their contracts](docs/INDEX.md#feature-contracts) for bounded context, quotas and failure behavior.

Local Supabase uses API port `54321`, Postgres `54322` and email preview `54324`. Local and hosted development signup currently allow unverified email by the founder's choice. After pulling new migrations, run `npm run db:migrate`; it preserves existing data. `npm run db:stop` preserves the local stack. `npm run db:reset` deliberately erases all local learner data. Never reset the hosted database to deploy changes.

## Verify changes

With the local database and configuration ready:

```sh
npm run check:docs
npm run test:tooling
npm run check
npm run test:integration
npm run test:browser:install
npm run test:e2e
npm run build
```

`check` runs lint, TypeScript and unit tests. Database tests exercise real ownership, evidence transitions, atomicity and retries; browser tests cover persistence, mobile use, session recovery and the connected journey. Their fixture setup rejects hosted targets. Browser tests start their own server on port `3100`; let them finish before a build. Regenerate types after schema changes with `npm run db:types`. [CI](.github/workflows/checks.yml) runs the same checks.

## Structure and data boundaries

```text
meno/
├── AGENTS.md                  Codex project instructions
├── .agents/skills/            Reusable repository workflows
├── docs/                      Product, design, roadmap and indexed references
├── src/
│   ├── app/                   Pages and authenticated route handlers
│   ├── components/            Shared interface
│   ├── features/              Learner and learning domain behavior
│   ├── lib/                   Auth, database and AI adapters
│   └── types/                 Generated database and shared types
├── supabase/                  Migrations, shared catalog and local setup
├── scripts/                   Repository documentation checks
└── tests/                     Unit, database, browser and tooling checks
```

This is a TypeScript modular monolith: Next.js, React, Tailwind, Zod, Supabase and one mentor orchestrator using the OpenAI API. Routes authenticate and validate; domain services choose bounded actions; database functions and RLS enforce owned reads, trusted writes and exact retries. Learner identity comes from authentication. Keys remain server-side.

Private stored data includes goals/preferences, permitted outlines and checkpoints, diagnostic answers, proposal/decision history, mentor questions/replies, practical drafts/submissions, scoped evidence, obstacle reports and saved opportunity baselines. Model processing differs by feature: outline suggestions receive permitted source text; mentor replies receive a bounded projection of owned context and the question. Chat, course confirmation and self-report cannot award mastery. See [the contracts](docs/INDEX.md#feature-contracts) for retention, source scope and validation details.

## Build with Codex

Start with [AGENTS.md](AGENTS.md), the [product strategy](docs/PRODUCT_STRATEGY.md) and [technical design](docs/TECHNICAL_DESIGN.md). Plan against the [implementation roadmap](docs/IMPLEMENTATION_PLAN.md), use feature branches, verify coherent changes and open a PR for review.

The repository includes [meno-feature-review](.agents/skills/meno-feature-review/SKILL.md). In Codex:

```text
Use $meno-feature-review to review this branch against origin/main.
Trace evidence changes, authorization, retries and learner confirmation.
```

Its credential-free helper collects changed paths, relevant contracts and test locations without executing tests or touching learner data:

```sh
node .agents/skills/meno-feature-review/scripts/review-context.mjs --base origin/main
```

The helper provides review context, not an automatic safety verdict. Codex must inspect the actual code and report findings, validation and uncertainty. The workflow travels with the repository; it needs no personal paths or separate MCP service. For narrower work, invoke it with `--files` followed by repository-relative paths.

## Documentation and production path

[Start with the documentation map](docs/INDEX.md). Product strategy explains why; technical design explains the architecture and proposed choices; feature contracts explain implemented behavior; operations cover setup and deployment. Historical source review is separated from current guidance.

The hosted app is development infrastructure, even though Vercel calls its canonical target “Production.” A supported pilot needs verified email and account recovery, owner-scoped export/deletion, separate environment/data decisions, operational monitoring and restore procedures, maintained real opportunity sources, stronger artifact assessment and learner evaluation. The [roadmap's pilot release gate](docs/IMPLEMENTATION_PLAN.md#stage-7--prepare-a-real-learner-pilot) defines that work; this prototype does not establish long-term retention or employment outcomes.
