# Hosted development

Configured on 14 October 2026. This is a public development app for trying the implemented Passport and course flow; AI extraction, diagnostics, and mentoring are still future work.

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

Database passwords, privileged API keys, `TEST_DATABASE_URL`, and `SUPABASE_TEST_SERVICE_ROLE_KEY` are not app runtime variables. Credentials used during setup are in ignored `.env.supabase.dev` with owner-only permissions. Local `.env.local` remains configured for local Supabase and the tests still reject hosted targets. `.vercelignore` excludes all environment files and generated output from deployment uploads.

The app accepts mutation origins only from its configured canonical URL and exact deployment/branch URLs provided by Vercel. Request Host and forwarded headers cannot expand that allowlist. Confirmation redirects use the requesting trusted origin so previews do not redirect through localhost or a different deployment. Supabase's callback allowlist covers the canonical callback and the Meno preview/deployment host pattern in the same Vercel team.

## Schema and future updates

Both migrations in `supabase/migrations/` and the shared fourteen-skill seed have been applied. No learner accounts, assessed skills, or opportunities are seeded. Private Passport/course tables retain their grants, RLS, and authoritative save/confirm operations.

After reviewing a future schema change, authenticate with `npx supabase login`, link the intended development project, and preview/apply pending migrations:

```sh
npx supabase link --project-ref vqgtrttptdpebabcjtao
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Do not reset the hosted database to deploy a migration. The initial shared catalog came from `seed.sql`; deploy intentional catalog updates explicitly instead of rerunning demo fixtures indiscriminately.

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

Official references: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration), [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp), and [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).
