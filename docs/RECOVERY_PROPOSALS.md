# Recovery milestones — P1/P2

P1 implements deterministic next-step selection and private, revisioned proposal APIs. P2 adds learner-facing review/edit/accept/decline and explicit activation. A proposal cannot change an active plan, complete a task, move a course checkpoint or award skill evidence. No OpenAI call or code execution occurs.

## Prototype policy

Policy version: recovery-v1. Changing selection rules, task templates or the fictional requirement connection requires a new policy version; retained proposals are not rewritten.

The prototype recognizes JavaScript/JS/React, frontend/web-development, HTML and CSS goals. An unsupported goal returns 422 and leaves the saved goal and plan intact. This is an initial domain boundary, not a claim that Meno supports every tech skill.

Selection uses the active goal, entry state, time/device/connectivity/language preferences, current scoped evidence, shared prerequisites and an explicitly selected confirmed course:

1. Prioritize an observed review gap. Comparable gaps follow mapped modules at/after the saved checkpoint, then earlier modules, then catalog order. A recorded prerequisite gap comes before its dependent topic.
2. Otherwise explore an incomplete observed scope. A skip is not an incorrect answer.
3. A returning/active learner can continue an eligible mapped course topic. Course mapping and checkpoints are self-report, not demonstrated ability.
4. Otherwise choose an unassessed introductory scope. If the eligible scopes already have observations, propose practical explanation/application rather than claiming independent project mastery.

Only quiz, practical-task and externally verified project evidence count as observations. Self-report and AI inference cannot become strengths or failures. Earlier demonstrated observations are referenced as retained strengths; unknown prerequisites remain unknown and do not automatically force a restart. Quiz scopes remain narrow. API integration is not inferred from promise quiz answers.

Each proposal contains one skill, a start/review/practice mode, original text/paper activity, two to four steps, evidence IDs, rationale, a reviewed resource, optional confirmed-course anchor and explicit limitations. There are no readiness percentages, certifications or job guarantees.

| Saved constraints | Proposed session |
|---|---|
| Up to 30 study minutes per week | 5-minute draft, two steps |
| At least 180 minutes per week and a computer | 25-minute practice, four steps |
| Other values, including a phone/shared device | 15-minute focused session, three steps |
| Time unspecified | 15-minute adjustable assumption, disclosed |

These durations are prototype effort estimates, not measured reading times or promises of completion. The task can be drafted in text or on paper; code execution, video and project downloads are optional future work. Language preference is kept; when a reviewed resource in that language is absent, the English limitation is disclosed.

## Curated resources and fictional requirements

Fresh setup initializes the shared v1 skill/prerequisite catalog in the P1 migration before resources reference it. Existing catalog metadata is preserved; seed.sql contains no learner or opportunity fixtures.

The six English MDN articles below were opened and reviewed on **14 October 2026**. Their titles, links, skill mapping and review dates are stored in learning_resources; no lesson bodies are ingested. Article duration and download size remain unknown. Own course notes are an alternative when resource access is difficult.

| Skill | Primary source |
|---|---|
| web.html-basics | [Basic HTML syntax](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/Basic_HTML_syntax) |
| web.css-layout | [Introduction to CSS layout](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Introduction) |
| js.variables | [Variables](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Variables) |
| js.functions | [Functions](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Functions) |
| js.arrays | [Arrays](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Arrays) |
| js.promises | [How to use promises](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Async_JS/Promises) |

Only reviewed records whose check date has arrived and review deadline has not passed are eligible. The initial deadline is **12 January 2027**. Before that date, recheck sources and intentionally update their review metadata, or mark unavailable/needs-review sources. There is no automatic crawler or arbitrary URL fetch. An unavailable resource prevents a new proposal for that scope and preserves saved work; no invented replacement URL is returned.

The demo-frontend-api-v1 fixture is a **fictional project brief**, labeled **DEMO — NOT A LIVE LISTING**. It has no real employer, application URL or deadline. Functions, arrays, promises and API data handling are illustrative practical requirements. A relevant proposal can explain its preparation connection; completing a proposed step or answering a quiz does not satisfy a real hiring requirement. Opportunity screens and matching remain O1/O2 work.

## API contracts

| Method | Route | Behavior |
|---|---|---|
| GET | /api/learning-path?courseId={uuid} | Current goal's path ID/latest revision, active revision and immutable latest proposal; course parameter optional |
| POST | /api/learning-path/proposals | {requestId, expectedRevision, courseId} selects and saves one proposal; course ID is explicitly a UUID or null |
| GET | /api/learning-path/proposals/{id} | Owned immutable revision/context plus contextCurrent |

All requests use cookie authentication. Mutations require a trusted origin, JSON content and at most 8 KiB. Client-supplied ownership, grades, proposals, resources, policy versions, context hashes and active revisions are rejected. Foreign/missing proposal IDs return the same 404. Responses use private, no-store.

A learner with no path uses expected revision 0. Each successful new proposal increments the current goal's path revision. A stale revision returns 409. Exact request-ID retries return the original receipt {pathId, proposalId, revision}, including after context changes or later proposals. Reusing an ID for a different course/expected revision returns 409. Read the receipt's proposal ID to display the original saved result rather than regenerate it.

A null course ID intentionally uses no course. An explicit course must be owned and confirmed; foreign courses return 404 and unconfirmed ones 409. Only its confirmed title/modules/skill IDs/checkpoint enter selection. Later unconfirmed drafts do not change that selected snapshot.

The contextCurrent flag describes the semantic snapshot, not whether a revision is latest or accepted. GET detail checks the saved course context; GET root checks the requested course context (none if omitted). An old revision can still match context after a later proposal. P2 must also check the current path revision and explicit learner choice before activation.

## Persistence and authorization

The learning_paths table has one root per owned goal, a latest revision and nullable active revision. The learning_path_revisions table retains immutable policy, proposal and context snapshots. The learning_path_mutations table holds bounded input/receipt metadata. Account deletion cascades through all private records; the shared resource catalog remains.

The get_learning_path_context RPC derives identity from authentication. Its private helper reads only an explicit owner and returns a single context snapshot/hash. Context contains the goal, relevant constraints, shared skills/prerequisites, current evidence references/scope, selected confirmed course mappings and eligible resource metadata. It excludes names, motivations, raw outlines, topic text, checkpoint notes, diagnostic answers and conversation content.

The app reads context/receipts with the learner's RLS session before constructing its existing server-only SUPABASE_SECRET_KEY client. Only service_role can execute propose_learning_path; clients have SELECT grants and owner policies on private proposal tables, and cannot write resources or activate plans.

The write transaction takes the same learner advisory lock as Passport/course/assessment mutations, rereads the selection context and verifies its SHA-256 hash and expected path revision. It validates resource provenance, owned evidence references, assessed review/practice modes, retained-strength references and confirmed-course anchors. Then it atomically stores the revision, receipt and bounded event. Failure leaves no partial path, proposal or event. No evidence or course mutation is part of this transaction.

## Verification

Domain tests cover beginner/returning/practical-extension choices, observed prerequisite gaps, incomplete scopes, unassessed skills, self-report/AI separation, course ordering, time/device sizing, language limitations, unsupported goals, resource failure and invalid prerequisite graphs.

Real Postgres tests cover privacy of captured context, confirmed-versus-draft versions, immutable history, exact/mismatched retries, stale goal/time/evidence/catalog/course snapshots, malformed or unsupported references, RLS/grants, account-deletion cascades and competing/duplicate requests. A two-connection check changes the learner's context while a proposal waits for its lock and verifies rejection after the wait.

Authenticated browser API journeys connect actual diagnostic findings and confirmed courses to proposals, verify different beginner/stronger-quiz tasks, preserve evidence/checkpoints, test stale context and retries, and deny invalid, anonymous or cross-user requests. Current gate results are recorded in the implementation plan and P1 PR. Learner calibration remains pending. P2 review behavior and its verification are documented below.


## Learner review — P2

Open **My next step** at /learning-path from navigation, the Passport, diagnostic results or a confirmed course. The screen separates the accepted step from the latest proposal. It shows selection reasons, retained observations, unassessed prerequisites, source scopes, course provenance, estimates, resource dates/English/download limitations and the fictional requirement label. Course selection is explicit; only confirmed titles are listed, in pages of 20. With no selection in the URL, a returning session uses the latest proposal's saved course. Choose “No course” to intentionally use only the goal and evidence. A later course draft does not replace confirmed context.

Accepting requires a second confirmation. It changes only active_revision, stores an immutable decision and a bounded event/receipt, and never completes an activity, changes skills or advances a checkpoint. The current proposal must be latest, undecided, owned, tied to the active goal and semantically fresh under the shared learner lock. A pending proposal can be declined even when its context is obsolete, because declining cannot activate or edit anything. Declining preserves the previously accepted step. One proposal can have only one decision; competing accept/decline or edit/accept requests cannot both succeed.

Adjustments contain only title, estimatedMinutes (5/15/25) and two to four nonempty steps. Titles are limited to 160 characters and steps to 400 each; text is trimmed. The estimate cannot exceed a saved weekly time limit. These are prototype choices, not calibrated learning durations. Adjusting clones a fresh pending proposal into a new immutable revision, linked by edited_from. The skill, evidence, reasons, resource and course connection stay unchanged. Learner wording is displayed as an unassessed task preference. An edited task still needs separate acceptance. An already decided proposal requires requesting a fresh suggestion first.

| Method | Route | P2 behavior |
|---|---|---|
| GET | /api/learning-path/review | Snapshot of current root, latest proposal, accepted step, decisions, freshness and 20 history records; defaults to saved course |
| GET | /api/learning-path/review?courseId=none | Explicit no-course context; a UUID selects an owned confirmed course |
| GET | /api/learning-path/review?before={revision} | Earlier history, 20 records at a time; context/root remain current |
| GET | /api/learning-path/courses?page={n} | Owned confirmed course choices, 20 per page, excluding later unconfirmed titles |
| POST | /api/learning-path/proposals/{id}/review | {requestId, expectedRevision, operation: accept/decline}; edit adds adjustment: {title, estimatedMinutes, steps} |

P1 endpoints keep their existing contracts. P2 GET responses use one stable database snapshot for root, decisions, active step, context and history. Foreign explicit courses/proposals return opaque 404; an unavailable saved course keeps immutable history readable with contextAvailable=false. The learner can decline or explicitly choose no course. P2 private tables learning_path_decisions and learning_path_actions have owner SELECT policies and no client write grants. Only service_role can call review_learning_path; get_learning_path_review derives identity from auth.uid. The app checks ownership through the learner session before constructing the already authorized trusted writer.

Exact request-ID retries compare operation, proposal ID, expected revision and normalized adjustments, and return the original receipt before latest/freshness checks. A request ID reused for different inputs or another domain event returns 409. After a receipt, the UI reads current state so an old replay cannot conceal a newer proposal. Unverified writes and expired sessions freeze the original payload/ID for retry. A conflict keeps local adjustments and offers a saved-version comparison before explicit discard. Same-tab link/sign-out/unload warnings protect unsaved work; browser back/crash and full offline draft persistence are not implemented.

P2 tests cover real database decision/edit races, context changes during lock waits, immutable history, exact retry metadata, bounded edits, account-deletion cascades, RLS and unchanged evidence. Browser journeys cover the returning learner's course/diagnostic/review/edit/accept loop, fresh sign-in, decline preservation, conflicting tabs, lost responses with a newer revision, expired sessions, beginners, confirmed course paging, deleted course recovery and 320-pixel layout. Practical task submission/evaluation remains T1/T2; contextual mentor help begins with M1.
