# JavaScript diagnostic — D1 and D2

D1 provides versioned content and deterministic scoring. D2 connects it to private, resumable checks, explicit evaluation, and scoped Passport evidence. Open **Skill checks** from the navigation, Passport, or a confirmed course. Diagnostics work without OpenAI configuration.

## Version and content

Content version: `javascript-foundations-v1`. Rubric version: `objective-subset-v1`.

Eight fixed questions cover two examples for each of four catalog skills:

| Skill | Observed scope |
|---|---|
| `js.variables` | Read numeric addition; distinguish string values from numbers |
| `js.functions` | Read function return values and argument positions |
| `js.arrays` | Read `map` results without assuming mutation; read `filter` results |
| `js.promises` | Read callback order; identify settling and `then` behavior |

These examples cannot establish independent project-building ability, comprehensive JavaScript mastery, or API integration competence. Other shared skills receive no finding. The returning-learner fixture recognizes the observed functions/arrays answers while leaving API integration unassessed; promises need review only when the submitted answers support that finding.

Questions and answer keys are defined in a `server-only` module. The public projection includes prompts, inert code examples, options, selection type, and skill IDs, but no answer keys or scoring explanations. Returned copies cannot mutate the definitions for later learners. The definition's SHA-256 fingerprint and rubric version accompany every scored result; a pinned unit snapshot detects accidental content changes within v1.

Keep v1 immutable once attempts reference it. Changes to prompts, options, keys, scopes, or scoring rules require a new content/rubric version, rather than updating saved attempts against new answers. Each attempt retains its public question snapshot, content/rubric versions and fingerprint. The server rejects evaluation if its supported definition no longer matches that provenance; previous answers and evidence remain stored.

## Submission and scoring

A completed submission specifies the exact version and all eight unique question IDs. Each answer contains known choice IDs or `null` for an explicit skip. Single-selection items accept exactly one choice. Duplicate, unknown, missing, oversized, or code-shaped selections are rejected; strings are never evaluated. Client ownership, evidence, and skill-status fields are not part of this contract.

| Observation | Score and meaning |
|---|---|
| Exact correct option set | 1 point; correct for this item |
| Strict subset of correct options on a multiple-selection item, with no wrong option | Proportionate partial credit; the answer is explicitly partial |
| Any incorrect selected option | 0 points; observed incorrect answer |
| Explicit skip | No item score and no answer feedback; not a failure |

For each skill, both complete correct answers produce `demonstrated` **within the stated diagnostic scope only**. An observed incorrect or partial answer produces `needs_review`, with item-specific feedback and limitations. Correct answers with remaining skipped items produce `learning`, since the scope is incomplete. Skipping both items produces `not_assessed`. Skips never become incorrect observations or fabricated negative findings.

The scoring function returns typed observations, scoped findings, the content/rubric version and fingerprint, and limitations. It has no database dependency or write path. Objective point counts describe recorded responses; they are not confidence percentages, career readiness scores, or certification claims.

## Fixtures and verification

The explicit correct-answer fixture is test data, not a real learner's result. Tests also cover the fictional returning learner, all incorrect, all skipped, partial selections, incomplete correct scopes, mixed wrong/skip, shuffled submissions/options, invalid versions and IDs, injected fields, and non-execution of code-shaped strings. Public projections are checked for absent answer keys and immutable copies.

The question wording, narrow rubric and evidence precedence rules are implementation choices for the prototype; calibration with learners has not been performed. D1's 15 scoring checks remain part of the suite. D2 adds request/service, real database and browser verification for the journey and evidence boundaries.

## Attempts and API

| Method | Route | Contract |
|---|---|---|
| GET | `/api/assessments?page=0` | Owner-only history, 20 summaries per page, next page and active attempt ID; no keys or evaluations |
| POST | `/api/assessments` | `{requestId}` starts v1 or returns the existing unfinished check |
| GET | `/api/assessments/{id}` | Assigned public questions and saved answers; feedback/evaluation only after submission |
| PUT | `/api/assessments/{id}` | `{requestId, expectedRevision, answers}` explicitly saves up to eight known answers/skips |
| POST | `/api/assessments/{id}/evaluate` | `{requestId, expectedRevision}` evaluates the saved complete set; no client scores or evidence accepted |

All endpoints require a cookie session. Mutation origins must be trusted and bodies are limited to 8 KiB. UUIDs, integer revisions, known choice/question IDs and strict object fields are validated. Foreign or missing records return the same API 404. Responses use `private, no-store`. Private page loaders also use the learner's RLS session; a streamed loading shell can have HTTP 200 before the not-found UI renders, without returning attempt content.

Attempts begin at revision 1. Every save/evaluation increments the revision. A missing answer remains unfinished; only explicit `null` counts as skipped. Evaluation requires all eight questions answered or skipped and the saved revision. Evaluated attempts cannot be edited; **Take another JavaScript check** creates a new attempt. At most one unfinished check exists per learner, including concurrent start requests.

Every mutation carries a learner-scoped UUID and bounded fingerprint/receipt. An exact retry returns the original receipt, including after subsequent saves or evaluation. Reusing an ID for different input or submitting a stale revision returns 409. The browser rereads current owner-scoped state after a receipt so an older successful retry cannot display stale answers as current.

## Saving and recovery

The learner chooses one question at a time, explicitly saves progress, and reviews all saved answers before selecting **See my results**. Selection changes are kept in memory until saved; there is no automatic save or offline synchronization. Returning to a saved check resumes at the first unfinished question, or review when all eight are complete.

Conflicts preserve the local choices and offer a comparison with the latest saved version. Replacing saved answers or discarding local work requires an explicit choice. Uncertain requests freeze editing and retry the same operation/ID; no new grade or evidence is created by a lost response. Ordinary links, sign-out and page unload warn about unsaved/unverified answers. Browser history, crashes and device loss can still lose unsaved edits; save before leaving. Course revisions and self-reported checkpoints are unaffected.

## Authoritative evidence transaction

`diagnostic_attempts` and `diagnostic_mutations` have owner-only SELECT policies and no client write grants. Start/save/evaluate functions are executable only by `service_role`. The app authenticates and checks the profile/owned attempt using the learner's session before constructing its server-only `SUPABASE_SECRET_KEY` client. Ordinary Passport/course reads and edits continue using RLS sessions. No OpenAI call or learner code execution occurs during a diagnostic.

The server scores persisted responses against immutable D1 definitions. In one locked database transaction, evaluation verifies the saved revision/answers and provenance, inserts one quiz evidence row per answered skill, changes permitted current summaries, finalizes the attempt, and stores the event/receipt. Failure rolls back all effects. Evidence includes its owning attempt, exact scope, rubric, outcome, limitations and evaluation time. Each attempt/skill pair has at most one evidence row. Learning events contain only bounded receipt metadata, not answer copies.

| Existing evidence | Current-summary behavior |
|---|---|
| No assessed source, self-report or AI inference | An answered quiz scope can update its summary |
| Quiz evidence for the same scope | A complete later scope can update it, including an observed new gap; incomplete observations can replace only an unassessed/learning summary |
| Practical/project, external review, or a different quiz scope | Keep the existing summary; record the new quiz observation in history |
| Both items skipped | Insert no evidence and preserve every earlier summary/source |

Older evidence is retained even when a current summary changes. Incomplete retakes do not erase an earlier complete finding. The Passport fetches the current source separately from its latest 20 observations so an older preserved source remains visible. Every saved result can be reopened from paginated check history. The UI labels successful quiz findings **Shown in quiz examples**, exposes their scope/source and feedback, and keeps unsupported API integration and other skills unassessed.

## Verification

Unit checks cover strict requests, normalization, owner checks before privileged writes, stored-answer grading, unsupported versions, incomplete answers and retryable conflicts. Real database checks cover concurrent starts/submissions, atomic rollback, finalized immutability, exact/mismatched retries, skipped/incomplete retakes, scoped downgrades, stronger evidence preservation, grants/RLS and account-deletion cascades. Browser journeys cover mobile saves, a fresh authenticated session, beginner skips/retakes, two-tab conflicts, lost save/evaluation responses, private routes and history pagination. Verification results are recorded in the [implementation plan](../IMPLEMENTATION_PLAN.md).
