# Course context — C1 contract

Implemented on `feat/course-context-foundation`, 13 October 2026. This is the backend foundation for [C2's course editor](IMPLEMENTATION_PLAN.md), not a completed import screen or AI extractor.

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

The editor should preserve unsaved form input on a 409 and offer to reload/reconcile changes. It must not silently resubmit using a newer expected revision. A save failure never partially replaces a course's content, modules, checkpoint, or receipt.

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
