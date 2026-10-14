# Course context — C1/C2 contract

C1 was implemented on `feat/course-context-foundation`; C2 adds the editor on feature branch `feat/course-editor`, 13 October 2026. [PR #1](https://github.com/Ekene-Chris/meno/pull/1) merged C1 with passing CI. C2 is based on that merged `main`. Manual entry and review are available; AI extraction follows in AI1.

## Learner flow

Open **My courses** from the dashboard or navigation. `/courses` lists private drafts and confirmed courses, 20 per page; `/courses/new` starts a draft; `/courses/{id}` opens its saved review. These routes require an authenticated learner with a Passport, and refresh the cookie session through the proxy.

1. Add the title, source type, optional reference URL, and permitted outline/notes. Enter modules and topics in course order. Choose a canonical frontend skill when it fits, or keep a topic explicitly unmapped. The URL is a reference link, and outline text is displayed as text.
2. Reorder modules with keyboard-accessible buttons, select where you paused, and add an optional return note. Removing the selected module clears its checkpoint after a warning. This never marks earlier modules complete.
3. **Save draft & review** persists the draft and opens its review. Incomplete drafts can be saved; confirmation requires a module and a topic in every module. Confirmation is a separate action on the saved version.
4. Return to the same course and checkpoint after reloading or signing in again. Editing confirmed context creates a new draft, with the previous confirmed version available below the review. Cancel discards unsaved edits after a warning and leaves the saved course intact.

Conflicting saves keep the form unchanged. **Load latest saved version** displays current saved content for comparison; the learner explicitly chooses to keep their edits over that version or discard them in favor of the saved version. A second concurrent change is checked again on save. A stale confirmation loads a fresh review and requires another explicit confirmation.

Network errors and server failures retain the input and original request ID. Editing pauses until **Retry save** or **Retry confirmation** resolves the uncertain outcome. Every successful receipt is followed by a current-state read, so an older retry cannot appear to confirm a newer draft. Unsaved text stays in memory in the current tab, not browser storage; cancel, ordinary link navigation/sign-out, and browser unload have warnings. This is not offline autosave: a browser crash or navigation outside these guards may lose unsaved input.

## Behavior

A learner with a saved Passport can create a course draft, replace it with another saved revision, and confirm the exact revision they reviewed. Course context never awards skill evidence or infers module completion. The checkpoint is a learner-supplied place to resume, not proof of progress.

Each draft save retains an immutable content version and ordered modules. `courses.revision` points to the latest draft. `courses.confirmed_revision` remains unchanged until explicit confirmation. A saved edit after confirmation therefore produces `draft_changes`; the previous confirmed course remains available. Earlier versions are retained in the database, while the current detail endpoint returns only the latest draft and latest confirmed version.

Confirmation requires at least one module and at least one topic in each module. Topics may be explicitly unmapped (`skill_id: null`); unknown does not mean weak. Non-null skill IDs must exist in the shared catalog. The API does not fetch reference URLs, execute outline text, infer topics, or invoke a model.

## Endpoints

All routes use the authenticated cookie session, return `Cache-Control: private, no-store`, and derive ownership from authentication. Mutations require JSON and an `Origin` matching `NEXT_PUBLIC_APP_URL`. Complete onboarding before creating a course.

| Method | Path | Request / result |
|---|---|---|
| `GET` | `/api/courses?page=0` | Up to 20 summary records and `nextPage`, or `null` at the end. Only `page` is accepted as a query field. Summaries exclude source outlines. |
| `POST` | `/api/courses` | `{ requestId, course }`; creates a draft and returns a receipt with HTTP 201. |
| `GET` | `/api/courses/{id}` | Current draft and confirmed snapshots, or 404 for an absent or foreign course. |
| `PUT` | `/api/courses/{id}` | `{ requestId, expectedRevision, course }`; atomically saves a complete replacement draft. Omitted modules are removed from the new draft, not historical versions. |
| `POST` | `/api/courses/{id}/confirm` | `{ requestId, expectedRevision }`; confirms the current reviewed revision without allowing hidden content changes. |

For example, the `course` field has this shape; IDs shown are illustrative:

```json
{
  "title": "My JavaScript course",
  "source_type": "online_course",
  "source_url": "https://example.test/course",
  "outline": "Functions\nPromises\nFetching data",
  "modules": [
    {
      "id": "dc49b6a6-3c56-4b6f-9ef6-27a915c50f2c",
      "title": "Promises",
      "topics": [
        { "label": "Promise chaining", "skill_id": "js.promises" },
        { "label": "A topic outside the catalog", "skill_id": null }
      ]
    }
  ],
  "checkpoint_module_id": "dc49b6a6-3c56-4b6f-9ef6-27a915c50f2c",
  "checkpoint_note": "This is where I paused."
}
```

Use a new UUID `requestId` for each intended save/confirmation and reuse that UUID only for retries of the same request. Keep module UUIDs stable when editing or reordering; generate a new one for each new module. Array order defines module order. A non-null checkpoint must reference a module in that same draft. Null checkpoints and empty module arrays are allowed while drafting.

The mutation receipt is `{ courseId, revision, confirmedRevision }`. Detail reads return `{ id, revision, confirmedRevision, status, updatedAt, draft, confirmed }`. Each snapshot is `{ revision, savedAt, content }`, where `content` matches the course shape above. `confirmed` is null before the first confirmation. Status is `draft`, `confirmed`, or `draft_changes`.

## Retries and conflicts

Course writes serialize for each learner and compare `expectedRevision` with the latest saved revision. A stale write/confirmation returns 409 without changing anything. A request receipt records a SHA-256 fingerprint of its operation and input plus the resulting version IDs. An identical retry returns that original receipt even after a later edit; the client should then reload current context. Reusing the same request ID with different content or a different operation returns 409.

Confirmation itself does not increment the content revision. Confirming a revision again with a new request ID returns 409; retrying the original confirmation with its original ID returns its receipt. A current draft cannot be confirmed while containing empty modules/topics.

The editor preserves unsaved form input on a 409 and offers comparison/reconciliation. It never silently resubmits using a newer expected revision. A save failure never partially replaces a course's content, modules, checkpoint, or receipt.

| Status | Meaning |
|---|---|
| 400 | Invalid schema, unknown skill, invalid checkpoint, or incomplete confirmation |
| 401 | No valid authenticated session |
| 403 | Incorrect or missing mutation origin |
| 404 | Missing, invalid, or inaccessible course ID |
| 409 | Stale revision, reused request ID, already-confirmed revision, or incomplete Passport prerequisite |
| 413 | Request exceeds the route's byte limit |
| 415 | Mutation is not JSON |
| 503 | An unexpected database/service failure; private details are redacted |

## Limits and stored data

- Course title: 2–160 characters; source type: `online_course`, `class`, `bootcamp`, `university`, `self_study`, or `other`.
- Optional source URL: up to 2,048 characters, HTTP/HTTPS, no embedded credentials, whitespace, or backslashes. It is stored as a reference only.
- Outline: up to 12,000 characters; optional checkpoint note: up to 500 characters. Input text is trimmed, and optional blank values become null.
- Up to 30 modules, each with a distinct UUID and a 1–160 character title; up to 10 topics per module with 1–120 character labels. Null mappings are preserved explicitly.
- The app bounds normalized course content to 48 KiB and course-save requests to 64 KiB. The database also enforces a 64 KiB JSON ceiling for direct RPC calls. Confirmation keeps the existing 8 KiB mutation limit. These are initial implementation limits, not permanent product constraints.
- Course summary pages contain at most 20 records; accepted page numbers are 0–1000. Pagination uses update-time/id ordering and may shift if courses change between requests.

`courses`, `course_revisions`, and `course_modules` all have RLS and owner-read policies. Authenticated clients have no direct insert/update/delete grants. The summary view uses invoker permissions, so it cannot bypass those policies. Composite foreign keys keep versions, modules, owners, and checkpoints scoped together. Only the bounded save/confirm functions perform course mutations. Table constraints and RPC validation also protect direct authenticated database calls.

Deleting the owning authentication account cascades to its course data and receipts. The tests delete only their temporary accounts. Self-service export/deletion and a mature retention policy remain in the pilot roadmap; do not interpret retained versions as a completed user-facing history or privacy-control feature.

## Verification and local migrations

Run `npm run db:migrate` to apply pending local migrations without resetting learners. Then run `npm run check`, `npm run test:integration`, `npm run test:e2e`, and `npm run build`.

C1's database checks cover nested ownership, RLS/grants, read-only summaries, confirmation, historical context, retry collisions, concurrent saves, invalid direct-RPC input, rollback, and account deletion. Browser checks cover actual cookie authentication, save/reentry, draft-versus-confirmed content, cross-user denial, route validation, and private pagination. The existing Passport journeys are included as regressions. No test requires an AI key or a hosted service.

C2 adds browser journeys for mobile course entry, mapped/unmapped topics, keyboard reordering, checkpoint removal, cancel/navigation warnings, persisted confirmation and session reentry, conflicting edits and confirmations, lost-response retries (including an intervening newer draft), incomplete drafts, injection-shaped text, page-level ownership denial, and list pagination. Desktop review and mobile editor screenshots are generated in ignored `test-results/` and were visually inspected. C2 needs no additional migration or provider configuration.

14 October follow-up: the first saved draft stays locked until its saved-course route mounts. This prevents edits in a temporary review from being lost during slow navigation. A browser regression holds that navigation open, verifies no editing is available, and then checks that subsequent edits survive reload. Browser assertions allow ten seconds for cold development-route compilation on CI.
