# In-app recovery check-ins — R1 demo slice

A learner with an accepted step can open `/check-in` from My journey or My next step, select a learning obstacle, and request a five-minute partial activity. No personal explanation, sensitive detail, inactivity diagnosis or model call is needed. Skipping records nothing. A pending proposal must be reviewed before another check-in can replace it.

The choices are reduced time, confusion, device/connection limits, or an explicitly reported return after a pause. A separate opt-in **DEMO DATA — SIMULATED INACTIVITY** choice deliberately simulates a return; it does not mean a missed session was detected. The label appears in the form, saved response, history, proposal, and later edited/accepted descendants.

## Proposal and agency

The existing `recovery-v1` selector reads the current goal, observations and confirmed course behind the accepted step. It may suggest a different gap when new evidence exists. It does not restart the course or reinterpret a pause as lost ability. The check-in requests a learner-chosen reduction through the existing P2 adjustment contract: five minutes, one small beginning action, and a question/reflection. For access limits the first action uses existing notes without downloads. This is partial work, not completion or a scored submission.

The evidence-based base proposal and its reduced revision are saved in one transaction; both remain in revision history. `editedFrom` explains the reduction. Learners use the existing My next step confirmation flow to accept, edit or decline. The previously accepted step stays active while the new suggestion is pending or declined. Explicit acceptance changes only the active plan revision. Skill evidence, course checkpoints, practical submissions and opportunity baselines remain unchanged.

## Data and API boundaries

- `GET /api/check-in` reads the owned accepted/latest path and ten most recent check-ins; `POST` accepts only request ID, expected path revision, accepted proposal ID, source and obstacle. Identity comes from authentication. Unknown fields, arbitrary notes and inferred sources are rejected.
- `recovery_checkins` has owner-only authenticated SELECT, no browser writes, and owner-qualified foreign keys to both accepted and proposed revisions. The server-only writer composes existing `propose_learning_path` and `review_learning_path` contracts under the shared learner lock.
- Exact request receipts resolve before freshness checks. A reused request with another source/obstacle conflicts. The actual edit audit event shares the check-in request ID, preventing reuse by another path operation. Invalid edits roll back the base proposal too.
- Root revision, current active goal/accepted step and semantic context hash are checked before writing. A deleted/unconfirmed course cannot be silently ignored; learners can explicitly choose another course or no course in My next step and accept a fresh step first.
- `get_checkin_provenance` resolves only owned proposals and decreasing edited ancestry. Simulated labels survive edits beyond the visible history page. Private responses use `private, no-store`; provider keys and source text stay server-side.
- Lost responses freeze the selection and preserve the exact request for retry. Session renewal can happen in a new tab. A conflict links to the authoritative saved plan instead of overwriting it.

## Deliberate scope

This is an in-app, learner-initiated intervention. No scheduled notifications, automatic missed-session detection, personal motivation prediction, evidence awards, or independent project grading run here. Check-in history is a record of choices, not proof that a recovery activity helped or was completed.

Verification covers typed source labels, partial-work bounds, transaction rollback, stale context and active-step conflicts, replay after later decisions, cross-user/anonymous denial, course/checkpoint preservation, edited provenance, mobile layout, and lost-response retries. Existing P2 evidence/activation tests remain applicable.
