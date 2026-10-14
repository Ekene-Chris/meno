---
name: meno-feature-review
description: Review Meno feature changes for evidence scope, authorization, retries and learner-controlled plans. Use for feature code reviews and verification planning, not ordinary copy or styling edits.
---

# Meno feature review

Produce a source-backed review of the requested Meno change. Use the user's scope and existing authorization; this workflow does not authorize deployment, live learner changes or posting review messages.

## Collect only the context needed

Run the credential-free [context helper](scripts/review-context.mjs) from the repository root:

```sh
node .agents/skills/meno-feature-review/scripts/review-context.mjs --base origin/main
```

It includes branch changes, staged/unstaged tracked changes and non-ignored untracked paths. It reads Git metadata and checks contract/test locations; it never opens environment files, calls providers, executes tests or mutates learner data. It reports context, not a review verdict. If the base ref is unavailable, choose an existing local base; do not fetch or change branches merely to run the helper.

For a proposed or narrowly scoped change, pass repository-relative paths after `--files`. Existing tests are suggestions; use the actual diff to choose checks, and mention missing coverage rather than manufacturing a passing result.

Read [AGENTS.md](../../../AGENTS.md), relevant product/design constraints and the helper's affected contracts. Use [the documentation map](../../../docs/INDEX.md) to resolve other references. Treat older roadmap entries as historical; current source, migrations and contracts determine implemented behavior.

## Trace the authoritative transition

Follow the touched route → request schema → authenticated service → database function/grants/RLS → rendered result. A plausible model explanation or a client-only status change is not an authoritative write.

For changes to evidence or comparisons, trace a concrete before/after observation through the original attempt, rubric, method and shared skill ID. Guided scaffold findings can support guided preparation; they cannot silently satisfy independent project criteria, complete a separate accepted task or change an unrelated skill. Check preservation of partial, differently scoped, stronger and newer prior evidence against the relevant contract.

For changes to proposals, check the separation of latest pending and accepted revisions. Inspect current-goal/course/context checks, edit/accept/decline behavior, and whether the old accepted step survives a pending or declined recovery. A simulated pause must retain its demo provenance through later edits.

For trusted writes, verify that identity comes from auth, owned reads precede the server-only writer, source references belong to that learner and browser grants cannot bypass the intended transition. Inspect the shared learner lock, exact-receipt-before-freshness order, compare-and-set checks and transaction boundaries. Trace a lost response and a concurrent/context-changing request, not just the happy path.

For AI changes, inspect the bounded context projection, untrusted text placement, strict output schema, owned/catalog reference validation, reservation/finalization and failure paths. Chat/extraction cannot award assessed evidence or activate a plan. Keep keys server-side and imported/code text inert.

## Verify and report

Use checks proportional to the changed behavior. Database tests cover real ownership/atomicity; unit tests cover policy and schema cases; browser tests cover confirmation, saved state, retry/conflict/session reentry and visible scope/demo labels. Follow the repository's loopback guards and existing test setup. Do not run the regular suite against hosted data or call a paid provider just to satisfy this review.

Report actionable findings with severity, file/line, a concrete trigger and consequence. State what was actually checked and what remains unverified. If there are no findings, say so with the verification performed; neither the helper nor passing tests establish general learning quality or production readiness. Return the review in the current conversation unless the user requested another destination.
