# Hosted development

Configured on 14 October 2026. This is a public development app for trying the Passport and course flow, including merged AI outline suggestions. D2 is merged and adds resumable JavaScript checks and evidence. P1 adds recovery proposal APIs on its feature preview; learner review/acceptance and mentoring follow later.

| Service | Development target |
|---|---|
| App | https://meno-ochre.vercel.app |
| Vercel | `raven-energy/meno`, connected to `Ekene-Chris/meno` |
| Supabase | `Meno` organization, Free tier, `meno-dev` project |
| Project reference | `vqgtrttptdpebabcjtao` |
| Database region | `eu-west-1` |

The Vercel deployment target called **Production** currently serves this development app. Its **Preview** deployments share the same development database. A future pilot/production release needs its own release gate and environment/data decision.

## Authentication and runtime configuration

The founder explicitly chose **unverified email/password sign-up for development**. Hosted confirmation is off, sign-up is enabled, anonymous sign-in is disabled, and passwords require at least ten characters. The app displays a development label and tells people creating an account that email confirmation is off. Before a verified public pilot, configure an email sender, enable confirmation, and implement the remaining account/data controls in the roadmap.

Vercel Production and Preview have these variables:

- `NEXT_PUBLIC_SUPABASE_URL`: the hosted development project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: its public key; RLS and authenticated identity control private data.
- `NEXT_PUBLIC_APP_URL`: `https://meno-ochre.vercel.app`.
- `NEXT_PUBLIC_DEPLOYMENT_STAGE`: `development`.
- `OPENAI_API_KEY`: sensitive server-only key configured by the founder.
- `OPENAI_EXTRACTION_MODEL`: `gpt-5.6-luna`, configurable for this bounded extraction task.
- `OPENAI_EXTRACTION_REASONING_EFFORT`: `none`.
- `OPENAI_EXTRACTION_DAILY_LIMIT`: `50`; Production and Preview share this quota.

The sensitive server-only `SUPABASE_SECRET_KEY`, configured in Production and Preview with the founder’s explicit approval, supports AI proposal accounting, trusted deterministic diagnostic mutations and recovery proposal saves. This key bypasses RLS. Services authenticate and check profile/attempt/proposal context ownership with the learner's session before trusted writes. Ordinary course/Passport operations and diagnostic/proposal reads retain the session client; browser sessions cannot invoke accounting, diagnostic mutation or proposal-write RPCs. See [extraction](OUTLINE_EXTRACTION.md), [diagnostic](DIAGNOSTIC.md) and [recovery proposal](RECOVERY_PROPOSALS.md) contracts. Diagnostics and recovery selection do not call OpenAI.

Database passwords, `TEST_DATABASE_URL`, and `SUPABASE_TEST_SERVICE_ROLE_KEY` are not app runtime variables. Setup credentials are in ignored `.env.supabase.dev` with owner-only permissions. Local `.env.local` remains configured for local Supabase and the tests reject hosted targets. `.vercelignore` excludes all environment files and generated output from deployment uploads.

The app accepts mutation origins only from its configured canonical URL and exact deployment/branch URLs provided by Vercel. Request Host and forwarded headers cannot expand that allowlist. Confirmation redirects use the requesting trusted origin so previews do not redirect through localhost or a different deployment. Supabase's callback allowlist covers the canonical callback and the Meno preview/deployment host pattern in the same Vercel team.

## Schema and future updates

All seven migrations through `202610140005_mentor_workspace.sql` and the shared fourteen-skill seed have been applied. No learner accounts, assessed skills or opportunities are seeded. Private Passport/course tables retain their grants, RLS and save/confirm operations. D2 adds owner-readable attempt/receipt tables and server-only start/save/evaluation functions, nullable evidence provenance fields and bounded diagnostic events. P1 adds immutable owned proposal/context/receipt records and six reviewed shared resources. Existing data is retained; deploying the schema does not assign grades, activate plans or alter course checkpoints.

After reviewing a future schema change, authenticate with `npx supabase login`, link the intended development project, and preview/apply pending migrations:

```sh
npx supabase link --project-ref vqgtrttptdpebabcjtao
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Do not reset the hosted database to deploy a migration. The initial hosted catalog came from `seed.sql`. P1 now initializes the same shared v1 catalog in its migration before resource foreign keys, preserving existing metadata, so fresh setup works before the seed stage. Deploy intentional catalog changes explicitly; do not mix them with learner or opportunity fixtures.

Local auth settings remain in `supabase/config.toml`. The limited hosted auth settings are in `supabase/hosted-dev.toml`. To review/apply those settings without sending the local development configuration:

```sh
mkdir -p /private/tmp/meno-supabase-hosted-config/supabase
cp supabase/hosted-dev.toml /private/tmp/meno-supabase-hosted-config/supabase/config.toml
npx supabase config diff --project-ref vqgtrttptdpebabcjtao --workdir /private/tmp/meno-supabase-hosted-config
npx supabase config push --project-ref vqgtrttptdpebabcjtao --workdir /private/tmp/meno-supabase-hosted-config
```

## Git and deployment

Keep changes on feature branches and merge reviewed PRs. The repository integration deploys the configured main branch and creates PR previews. Environment changes apply to subsequent builds, so redeploy after changing public runtime configuration. The Vercel project uses Node 22 to match the repository's pinned runtime.

For an explicitly authorized manual update of the public development URL, link the existing Vercel project and deploy:

```sh
vercel link --yes --scope raven-energy --project meno
vercel deploy --prod
```

`--prod` selects the Vercel target behind the public development URL; it does not make this a completed pilot release. Commit and review the source before deploying, and merge the hosting changes so a later Git-triggered build preserves them.

## Verification

Local lint, typecheck, fifty unit tests, and twelve browser journeys pass, including exact hosted-origin boundaries and the first-save navigation regression. The existing database authorization checks remain part of CI. Hosted verification uses only temporary, explicitly identified development learners and removes them afterward; the regular test suite is never pointed at the hosted project.

The live check passed public sign-up without confirmation, Passport creation, course save/confirmation, checkpoint reload, sign-out/reentry, mobile layout, and cross-user API/page denial. Both temporary hosted accounts and their associated course/Passport data were removed. The authenticated catalog contains fourteen skills, and course mapping leaves assessed skill findings unchanged. Sign-up reached onboarding in approximately four and two seconds for the two checked accounts.

Official references: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration), [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp), and [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

AI1 live acceptance passed on the protected preview `meno-133v9qt6u-raven-energy.vercel.app`, using the configured OpenAI key, `gpt-5.6-luna` with reasoning `none`, and the shared 50-request daily ceiling. Real candidate output, exact retries, unchanged confirmed course/checkpoint/skill evidence, and private/anonymous boundaries passed. Temporary test accounts and their cascaded proposals/courses were removed. PR #4 is merged. The canonical development app also passed real mobile extraction, correction, checkpoint selection, save/confirmation and reload without changing skill evidence. Its temporary test learner was removed.

P2 adds the additive 202610140004_recovery_review.sql migration for immutable adjustments, owner-scoped decisions/action receipts, trusted review writes and stable learner-session reads. It has been applied to meno-dev without resetting learner data. It reuses the explicitly authorized server-only Supabase key and requires no new service or model credentials.

M1 adds 202610140005_mentor_workspace.sql for private conversation history, session-derived context, trusted reservations/finalization and combined outline/mentor quotas. It is applied to meno-dev without resetting data. Mentor model/reasoning settings optionally override existing extraction settings; both features use the same approved keys and shared daily limit. See [MENTOR_WORKSPACE.md](MENTOR_WORKSPACE.md).

T1 adds 202610140006_practical_exercises.sql for an authenticated public exercise catalog, owner-only draft/submitted work and trusted retry-safe persistence. No provider call or new environment setting is needed. Free-form work is stored as inert text and remains inconclusive; T1 does not write skill evidence. See [PRACTICAL_WORK.md](PRACTICAL_WORK.md). Its development migration and live acceptance results are recorded in the T1 PR.
