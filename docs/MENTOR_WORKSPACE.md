# Contextual mentor workspace — M1

M1 adds private, persistent explanations, clarifying questions and curated-reference recommendations. Open **My mentor** at /mentor from navigation, the Passport, a confirmed course or an accepted step. Chat is AI guidance; it cannot assess work, award skill evidence, move a checkpoint or change an accepted plan. Plan choices continue through P2. Practical submissions and assessment remain T1/T2.

## Context and source boundaries

The server derives learner identity from authentication and reads only the active goal, preferences, scoped skill observations, an explicit confirmed course, the accepted activity and reviewed catalog metadata. Default course context follows the accepted step, even if a newer pending proposal uses a different course. Choose another confirmed course or “No course” explicitly. Confirmed titles are paginated; later unconfirmed titles/modules stay separate. A deleted accepted course offers an explicit no-course recovery; its saved activity and conversation history remain.

The stored request snapshot includes up to six confirmed modules (checkpoint first, then course order), fourteen current frontend skill records, reviewed resource metadata, the immutable accepted proposal, three recent ready turns for the same goal/course and five event type/date records. It excludes display names, motivation, raw outlines/topic labels/checkpoint notes, diagnostic answers and unrelated conversations. The full learningContextHash still covers omitted confirmed modules, so changing an omitted module invalidates relevant context. Snapshot storage is bounded to 96 KiB.

The provider receives a smaller projection: at most six relevant skills and three resources, three recent turns truncated to 600 question/800 reply characters and three recent activity records. The question is at most 2,000 characters. Course titles, learner-adjusted tasks, questions and prior conversation are untrusted data outside developer instructions. No arbitrary links are fetched, uploaded lessons ingested or learner code executed. References are source metadata; the app does not claim to have retrieved complete lesson bodies.

The mentor context hash covers learning context, accepted intent and recent ready conversation; bounded recent-event metadata is excluded from freshness. An unconfirmed draft or new pending proposal therefore does not discard help for unchanged confirmed/accepted context. Relevant goal/preferences/evidence/resource/confirmed-course/accepted-step changes are checked again under the learner lock before finalization. A changed source produces a failed receipt and keeps the question, rather than saving an explanation against obsolete context.

## Typed replies and honest limits

The response contains exactly action (explain/clarify/recommend_resource), reply, rationale, resourceIds, skillIds, evidenceIds and limitations. Replies are at most 3,000 characters, rationale 600, and one to four limitations of 400 each. At most three skill/resource references and five observed evidence IDs are accepted. Application validation rejects unknown/duplicate IDs, inferred/self-reported evidence citations, unsupported actions, extra grading/ownership fields, blank explanations and model-supplied URLs. Database finalization independently checks bounded shape and owned/catalog references.

Links are rendered from retained catalog rows, not model URLs. Evidence references display their original scope and kind. English text, checked/review dates and unknown download/reading costs remain visible; own notes are an alternative. The UI labels model replies **AI EXPLANATION**, shows the stored model/policy version, preserves earlier context and exposes caveats. Text is rendered as escaped plain text. IDs and shape validation do not establish factual correctness; learner calibration and broader quality evaluation remain pilot work.

## API and persistence

| Method | Route | Behavior |
|---|---|---|
| GET | /api/mentor | Current context plus the latest 20 owned, current-goal turns; default accepted course |
| GET | /api/mentor?courseId=none | Explicit goal/evidence context without a course |
| GET | /api/mentor?courseId={uuid}&page={n} | Explicit owned confirmed course and history pagination |
| POST | /api/mentor | {requestId, question, courseId, expectedContextHash}; courseId is a UUID or null |

Requests use cookie authentication; mutations require trusted origin/JSON and at most 12 KiB. Responses are private, no-store. Foreign explicit courses return opaque 404. Session-owner reads precede construction of the already authorized server-only Supabase writer. mentor_turns has owner SELECT policies, no client write grants, immutable request provenance and pending/ready/failed states. Only service_role executes reserve/finalize functions; get_mentor_context derives auth.uid. Account deletion cascades all private conversation data. End-user chat export/deletion controls remain pilot B2 work.

An exact request replay returns the original pending/ready/failed result before current-context checks. Reusing an ID for changed question/course/context returns 409; cross-feature ID reuse is rejected. Ready/failed retries never call a model again. A pending receipt remains checkable after course/provider configuration changes and expires after two minutes. One pending question per learner prevents competing conversation turns. Model calls run outside transactions. Policy version is mentor-v1; stored history is validated against original source snapshots, not a later catalog.

The UI freezes the original payload/ID after lost or unverified responses and expired sessions, offers new-tab sign-in, and rereads saved history after a receipt. Context conflicts preserve the question for explicit reload. Known configuration/quota failures keep the unsent question editable and leave the accepted step/references accessible. Same-tab link/sign-out/unload warnings protect unsent work; crash, browser-back restoration and offline persistence are not guaranteed.

## Provider and shared request limits

The fixed OpenAI Responses endpoint uses strict JSON Schema, store:false, no tools, no automatic provider retry, a 25-second provider timeout, 2,200 output-token ceiling, 60 KiB input body and 64 KiB response limit. Refused, incomplete, malformed, oversized or invalid-reference responses fail without an explanation. These follow the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

OPENAI_API_KEY and SUPABASE_SECRET_KEY stay server-only. Optional OPENAI_MENTOR_MODEL and OPENAI_MENTOR_REASONING_EFFORT override shared extraction settings; blank values use the shared settings. The existing development gpt-5.6-luna model supports structured outputs and none/low reasoning as documented in its [official model reference](https://developers.openai.com/api/docs/models/gpt-5.6-luna). No new credential is required.

Outline and mentor reservations share the original quota lock and combined counters: three requests/minute and ten/rolling 24 hours per learner, and OPENAI_EXTRACTION_DAILY_LIMIT across accounts (development 50; configurable range 1–100). Failed reservations count; exact retries are free. Unconfigured requests do not reserve. These are request limits, not monetary billing controls; administrative account deletion also removes its private reservation history.

The UI discloses that relevant learning context/questions go to the configured provider. store:false does not itself establish zero provider retention; account data controls apply. See [OpenAI platform data controls](https://developers.openai.com/api/docs/guides/your-data). Meno stores its own private conversation for continuity. No provider-retention or regional-processing promise is made.

## Verification and remaining work

Unit tests cover schemas, references, provider wire contracts, refusal/incomplete/oversized responses, blank configuration overrides, owned writer boundaries and exact receipt replay. Real Postgres checks cover private access, stale source/failure atomicity, shared quotas in both directions, pending expiry, accepted-course selection, omitted-module freshness, account deletion, duplicate reservations and context changes during lock waits.

Browser journeys use controlled persisted replies locally, never paid model calls. They cover accepted-step mentoring, fresh-session resume, source/scope display, unchanged evidence/checkpoints, unconfigured fallback, context conflicts, committed lost responses, expired sessions, pending reentry, history paging and removed-course recovery. Final full-suite/build/CI/live-provider results are recorded in the M1 PR and implementation plan. Practical exercise/feedback and evidence-backed opportunity comparisons remain subsequent packages.
