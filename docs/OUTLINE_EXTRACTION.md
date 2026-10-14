# Course outline suggestions — AI1

Implemented on `feat/course-outline-extraction`. Live acceptance passed against a Vercel preview connected to `meno-dev`; the manual course path remains available.

## Learner flow

In the course editor, enter a title and paste permitted syllabus text, then choose **Suggest topics from outline**. The disclosure explains that the title and outline go to OpenAI. Reference URLs are never fetched. No Passport, assessment, checkpoint note, account identity, course ID, or request ID goes to the provider.

Suggestions appear separately from the editable modules. Each skill mapping is labeled **Suggested match**, **Uncertain match**, or **No catalog match**. All require review; these labels describe content mapping, not a learner's ability. Non-course input may produce an empty result without fabricating lessons.

The learner can discard the preview or choose **Use suggested modules**. Replacing existing modules requires a clear confirmation. Using suggestions changes only the form, generates fresh module IDs, clears the module checkpoint so it can be chosen again, and retains the return note. The learner can correct topics/mappings, save a draft, and confirm it through the existing C2 flow. A previous confirmed version stays intact throughout extraction and subsequent draft saves.

Changing the title, outline, or locally known saved revision makes the preview inapplicable. Edits made in another session are checked before and after the provider call; C2's revision checks also protect the eventual course save. Ordinary manual editing remains available during provider failure. Unsaved form changes retain C2's documented limitations.

## Server contract

`POST /api/courses/import`, authenticated cookie session, trusted same-origin JSON, private/no-store response.

```json
{
  "requestId": "<UUID>",
  "courseId": null,
  "expectedRevision": 0,
  "expectedConfirmedRevision": null,
  "title": "JavaScript course",
  "outline": "Functions: parameters and callbacks. Arrays: map and filter."
}
```

An existing course supplies its owned ID, current draft revision, and confirmed revision. Client-supplied ownership fields and unknown fields are rejected. The server authenticates, verifies the Passport and owned course through the learner's RLS session, loads the shared catalog, and reserves a request before spending provider tokens.

The returned receipt contains `requestId` and `result.modules`. Modules contain `title` and `topics`; topics contain `label`, a known `skill_id` or `null`, and `mapping` (`suggested`, `uncertain`, or `unmapped`). An unmapped topic must have a null skill. No ownership, tools, progress, or assessment fields are accepted. The model schema and runtime validator use the same Zod contract. The result is also validated before persistence.

The provider uses the fixed OpenAI Responses endpoint with strict structured outputs, `store: false`, no tools, no conversation state, and no automatic retries. Developer instructions and untrusted source text are separate messages. Prompt wording is one layer; schema validation, restricted capabilities, learner review, and authoritative writes provide the enforcement boundaries. This does not prove that models are immune to every injection or factual mistake.

## Persistence, concurrency, and usage limits

`outline_extractions` holds private candidate proposals, input fingerprints, model name, status, safe error codes, and timestamps. It does not duplicate the source outline. Successful candidates are stored here **before review**, separately from `courses`; extraction never invokes a course save/confirmation or an evidence write. This refines the original proposed import flow to avoid overwriting learner corrections before their choice.

Learners can read only their own rows and cannot reserve/finalize requests or write proposals through direct database access. The server-only Supabase client uses `SUPABASE_SECRET_KEY` for these accounting operations. It receives the authenticated identity from trusted server code after RLS checks. Ordinary Passport and course services retain session-scoped clients. The server key is privileged and bypasses RLS, so it must remain a sensitive server-only environment variable.

`reserve_outline_extraction` serializes short reservations across server instances. The provider call runs outside the transaction. `finish_outline_extraction` checks the saved course owner, draft and confirmed revisions again and stores either a fully validated proposal or a failure. It never changes the course.

| Boundary | Limit |
|---|---|
| Title | 2–160 characters |
| Outline | 20–12,000 characters and at most 24 KiB UTF-8 |
| HTTP body | 32 KiB, read incrementally |
| Catalog | At most 100 known skills |
| Provider request | 60 KiB encoded, including instructions/schema/catalog |
| Provider call | 25 seconds; route duration ceiling 45 seconds |
| Provider output | 4,000 tokens and 64 KiB response body |
| Validated candidate | 20 modules, 1–10 topics per module; 24 KiB encoded |
| Learner reservations | 3 per rolling minute, 10 per rolling 24 hours |
| Shared reservations | Configured rolling 24-hour ceiling, default 50, maximum 100 |

All attempted calls, including refusals/timeouts/invalid results, consume a reservation. An exact retry returns the existing result/status and cannot start another provider call. Reusing an ID with different input fails. Interrupted pending requests expire on a retry after two minutes, and a deliberate new request can then be made. Unknown results/network failures keep the client request ID; terminal failures allow an explicit new attempt. There are no background retries.

The shared cap is a request/token ceiling, not a dollar billing guarantee. Production and Preview currently share both the development database and its quota. Model prices and available account credits must be checked when changing the configured model. A provider-side account budget/usage monitor remains useful before a larger public pilot.

Candidates remain stored until account deletion; UI discard hides the preview and does not delete the stored receipt. Refreshing loses an un-applied preview's in-memory request ID; saved course drafts persist normally. Automatic proposal restoration and a retention/deletion UI are not implemented. Deleting an account cascades its proposals along with the Passport.

## Configuration and verification

Server-only variables:

```sh
SUPABASE_SECRET_KEY=<project secret or legacy service-role key>
OPENAI_API_KEY=<OpenAI project key>
OPENAI_EXTRACTION_MODEL=<structured-output-capable model>
OPENAI_EXTRACTION_REASONING_EFFORT=none
OPENAI_EXTRACTION_DAILY_LIMIT=50
```

Reasoning effort is optional and must be supported by the chosen model; the adapter accepts `none` or `low`. No model is hard-coded into runtime code. Missing or invalid provider settings keep the manual path working and report that suggestions are unavailable. Keys must never use `NEXT_PUBLIC_` names, be committed, or be uploaded in environment files.

For local paid-provider checks, set the server key from the local stack's service-role key. The normal browser suite explicitly disables paid calls and uses controlled intercepted candidates for the UI; unit/service tests replace the provider; actual database tests use only loopback targets and rolled-back or cleaned fixtures. These fixtures are never product mentor output.

Verification covers strict output/known IDs, injected assessment fields, refusals, incomplete JSON, tool calls, rate limits, stream size, timeout, minimal provider context, retry accounting, two-connection reservations, direct RPC/write denial, private reads, course revision/confirmation races, deletion cascades, mobile review/correction/confirmation, replacement choice, stale previews, lost responses, and real manual fallback.

Official implementation references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and [GPT-5.6 Luna configuration](https://developers.openai.com/api/docs/models/gpt-5.6-luna). Model selection remains configurable.

Live acceptance on 14 October 2026 passed real extraction of a JavaScript outline containing injection-shaped instructions, known-ID validation, exact retry without another reservation, unchanged confirmed course/checkpoint and unassessed skills, private proposal reads, cross-user course rejection, and anonymous rejection. Two temporary hosted learners and their cascaded data were removed. The normal CI suite also passed 73 unit, 35 database, and 16 browser checks, plus the production build. The preview check used the actual configured provider; UI review/correction was separately exercised with explicit browser fixtures.
