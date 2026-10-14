# Guided practical progress — T2

T2 adds a separate, explicit **Record progress** action after a T1 submission. It atomically saves an exercise result, narrow guided skill observations and a suggested follow-up. The original submission/feedback remains immutable. Course checkpoints and accepted tasks are not completed or replaced by this operation: a link to an accepted proposal does not prove its original or learner-edited instructions were fulfilled.

## Observations and honest scope

api-mini-app-v1 / guided-api-rubric-v1 has three sessions, each with four fixed scaffold choices/traces, on shared skill IDs js.promises, web.fetch-api and web.dom. T2's policy is guided-progress-v1. Sources are practical_task evidence with the required assessment_method guided_scaffold, original attempt ID, rubric version, observation scope and caveat. The method qualifier distinguishes this evidence from independently reviewed project work; the broad evidence kind is never sufficient to establish independent competence.

Per session: zero observed choices creates no evidence and is not_assessed; some correct choices without a gap are learning/inconclusive; an observed wrong choice is needs_review; all four observed and correct is demonstrated **only within the stated guided scope**. The Passport displays **Shown in guided scaffold**, links back to the saved work and retains the limitations. Overall guided_complete requires all twelve criteria met; missing or unsupported work is inconclusive; a complete submission with a gap needs review. Code/reflection, authorship, runtime behavior, independent application construction, broad mastery and career qualification remain unassessed. This is an adopted prototype assessment policy, not a calibrated learning measurement or a new founder-confirmed product commitment.

The scorer rechecks the retained, supported source version on the server. Database recording compares that feedback to the immutable submission, derives finding counts/statuses/scopes itself and permits evidence only for observed known skills. Free-form work yields no evidence and a mentor-help follow-up. T1 feedback alone still changes no evidence; recording is a distinct learner-confirmed operation.

## Current summaries and preserved history

All observations remain in history. Summary replacement follows this conservative prototype policy:

| Current source | New guided observation |
|---|---|
| None, self-report or AI inference | May replace with the actual observed guided finding |
| Complete quiz or same-scope guided observation | A complete four-criterion retake may replace; partial work preserves the complete prior observation |
| Incomplete quiz or same-scope guided observation | Partial or complete observations may update within the disclosed guided scope |
| Independently assessed practical work, external verification or different practical scope | Keep the prior summary; retain the new guided observation in history |
| More recent observed work | Keep the newer summary when an older submission is recorded late |
| Unobserved new session | No evidence or summary write |

Chronology uses the original submission time for guided evidence and evaluation time for other observations, not the time someone clicks Record progress. An immutable recording cannot be reapplied later to overwrite newer evidence. Results show each finding's observed/met counts, evidence ID, whether its summary changed and why prior evidence was preserved. A guided pass is not automatically stronger than every other assessment kind. Independent calibration, rubric review and broader source precedence remain pilot work.

## Suggested next action

The same transaction stores one bounded follow-up: review_gap for a specific observed gap; finish_guided for unanswered guided work; independent_practice after all fixed criteria are met; mentor_help for unsupported free-form work. A suggested independent exercise is not itself assessed. Every follow-up states its source limits and that the accepted task/checkpoint remain unchanged.

These follow-ups belong to the recorded exercise, including historical work after a goal or plan change. They do not automatically activate a learning plan or create a P1 revision. Learners can discuss the suggestion with Meno or open My next step to propose/review a fresh plan through the existing P1/P2 authorization, freshness and acceptance rules. Current evidence can change P1's next recommendation, while acceptance remains explicit.

## API, persistence and retries

POST /api/practice/{id}/progress takes exactly {requestId, contentHash}. Identity, grades, skills, completion and plan changes cannot be supplied by the client. Cookie authentication, trusted-origin JSON, bounded request bodies and private/no-store responses apply. An owner-scoped read precedes construction of the approved server writer. Draft work and mismatched source hashes return 409; foreign attempts return opaque 404. Unsupported versions preserve saved work/evidence.

practical_progress stores one immutable result per owned attempt; practical_progress_receipts binds each request ID to attempt/source/result. Both private tables allow owner SELECT only; only service_role can invoke the writer. Evidence has an owned source FK, required method/scope, and one finding per attempt/skill. Account deletion cascades private results, receipts and evidence. Raw code/reflection never goes to a model or log through recording.

The writer shares the learner advisory lock with Passport/course/diagnostic/plan mutations. It writes result, evidence, permitted summaries, follow-up, audit event and receipt in one transaction, with no model call/code execution. Invalid source feedback rolls everything back. Exact retries are checked before current-source work; another request for an already recorded attempt returns the same assessment, so there is no second evidence award or follow-up. The client retains the original request through lost responses and expired sessions, with new-tab sign-in and navigation warnings. A fresh read restores recorded progress after returning. Receipt replay remains possible when newer goals/evidence exist.

The P1/M1 context includes guided method and source attempt only for these new observations, leaving legacy context representation unchanged. Plan evidence links route to /practice rather than diagnostic pages. Mentor instructions explicitly preserve guided-versus-independent limits. This supplies source-aware context; it does not claim a new live opportunity comparison or provider-quality guarantee.

## Verification

Unit contracts reject invented IDs/skills/ownership/grades, duplicate skills, incomplete demonstration, evidence-less summary updates and unqualified methods/accepted-task completion. Real Postgres checks exercise partial/complete retakes, stronger-source preservation, late recording, no-evidence free-form work, atomic rejection, concurrent/exact/alternate retries, source FKs, grants/RLS and cascade cleanup. Browser journeys cover the course-linked returning story, unchanged unrelated skills/accepted task/checkpoint, changed P1 recommendation, method/source labels, partial/open work, lost committed recording, foreign denial, session renewal and 320-pixel layout.

Final build, CI, hosted acceptance and migration rollout results are tracked in the T2 PR. Next work is R1: respectful in-app obstacle check-ins and learner-controlled recovery proposals. Opportunity requirements and comparison remain O1/O2; guided scaffold evidence must not be sold there as independent portfolio competence.
