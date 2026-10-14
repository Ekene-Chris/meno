# JavaScript diagnostic — D1

D1 provides versioned content and deterministic scoring for a short JavaScript diagnostic. It is a server-side foundation: there is no assessment UI, attempt persistence, or evidence write yet. D2 will connect these operations to a resumable learner journey and the Passport.

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

Keep v1 immutable once attempts reference it. Changes to prompts, options, keys, scopes, or scoring rules require a new content/rubric version, rather than updating saved attempts against new answers. D2 must retain the assigned version and fingerprint with each attempt.

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

Local lint, TypeScript, and all 88 unit tests pass, including 15 diagnostic tests. The production build passes. The question wording and narrow rubric are implementation choices for the prototype; calibration with learners has not been performed.

## D2 integration gate

D2 must authenticate and own each attempt, save the exact assigned version, resume bounded responses, and evaluate/insert observations atomically with idempotent submission receipts. Return feedback only after evaluation. Preserve prior evidence and define how a later observed finding changes the current scoped summary; skipped items must not erase valid earlier evidence. Render provenance and these limitations in the Passport. A retake is a new attempt, while an exact retry returns the prior evaluation.
