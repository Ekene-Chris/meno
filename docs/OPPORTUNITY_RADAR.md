# Opportunity Radar and connected journey — tonight’s demo

The founder set tonight’s deadline to 11pm WAT on 14 October 2026 and requested clearly labeled examples only. O1/O2’s thin slice and a connected-journey guide take priority over the original R1 order. This is a product priority decision; the bounded catalog/matching details below are adopted implementation choices.

## Three curated fictional directions

/opportunities lists a frontend API portfolio brief, a frontend apprenticeship pathway and a community interface challenge. All entries show **DEMO — NOT A LIVE LISTING**, use Meno fictional scenario as their organization, and have no source URL, application URL, deadline or location. Eligibility, education, time commitment and compensation are unspecified. The current schema rejects non-demo verification, fake application/source metadata and invented dates. This release contains no live opportunity feed or application automation.

Public authenticated catalog rows and normalized requirements share the existing skill IDs. Requirements distinguish required versus preferred and guided_foundation versus independent_project. The frontend API brief retains the original fictional practical direction and adds separately labeled guided preparation criteria; these do not rewrite independent project requirements into easy quiz criteria.

## Evidence-aware comparisons

Each comparison shows its scoped observation, method, rubric, source link and limitations. Self-report, AI inference and missing evidence remain unknown. Quiz observations may show a gap but do not satisfy guided construction or independent project criteria. A complete supported guided scaffold can show the corresponding preparation criterion; it never establishes an independently implemented app. Independently assessed practical/external observations are shown only within their recorded scope, with a reminder that a skill ID alone does not establish every detail of a requirement or career qualification.

There is no readiness percentage, hiring probability or application gate. Since the examples have no real application process, no fictional Apply action is shown. Future genuine links must remain explorable regardless of Meno’s guidance and require separately verified source/eligibility/date metadata.

Gap actions connect promise/fetch/DOM preparation to /practice?session=promises/fetch/display, JavaScript foundations to the existing diagnostic, and other skills to a mentor discussion. Fixed scaffolds and chat are explicitly separated from independent artifact assessment. These links do not activate a plan or award evidence. P1/P2 remains responsible for fresh proposals and explicit learner acceptance.

## Private saved baselines

Saving an example captures the authenticated learner’s current relevant skill observations in the database transaction. The client cannot supply a baseline, identity or grade. “Since saved” compares that retained snapshot with current evidence, showing changed status and separately noting a new observation with unchanged requirement status. Unrelated skills stay unchanged. Removing then resaving intentionally creates a new baseline; this is disclosed in the UI.

saved_opportunities and opportunity_save_receipts have owner SELECT RLS; clients cannot write rows directly. Authenticated save_opportunity derives auth.uid, takes the shared learner lock, enforces expected saved state, captures its own baseline and deduplicates request IDs. Exact receipts return before later state checks. Account deletion cascades private saves/receipts. Catalog/helper grants deny anonymous and cross-user private access; the private observation helper is not callable by clients.

GET /api/opportunities reads the bounded catalog/current comparisons. GET /api/opportunities/{id} reads one example. PUT takes exactly {requestId, expectedSaved, saved}; cookie authentication, trusted-origin JSON and private/no-store responses apply. Lost responses/session expiry freeze the original save for retry; a verified receipt is followed by an authoritative reread so an old save cannot hide a newer removal. Conflicts require explicit reload before another choice.

## Connected journey

/journey and the Passport’s next-step card use one authenticated database snapshot. Markers come from actual course confirmations, evaluated checks, accepted revisions, saved mentor explanations, current-goal submitted work/progress and privately saved examples. They are not skill percentages or invented activity. Courses and mentor help are optional; all steps remain available. “Comparison ready” means a baseline and recorded progress exist, not that an opportunity was applied for or a requirement fully verified.

The guide connects existing features without creating fake learner results. It preserves returning-course context and offers an explicit path to shorter P2 proposals. Scheduled reminders/inactivity detection are not claimed. See [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) for the live route and honest fallbacks.

## Verification

Unit checks cover guided versus independent scope, quiz/self-report/inference exclusion, unknown/gap distinction, unrelated requirements, forbidden metadata and bounded gap links. Real Postgres checks cover source-derived baselines, changed observations, receipt replay/CAS, authenticated identity, RLS/helper/direct-write denial, unknown skills/metadata guards, account cleanup and authoritative journey markers.

The returning browser rehearsal saves a baseline before course/diagnostic, accepts a step, receives controlled persisted mentor help, submits/records guided work and verifies changed preparation versus unverified independent criteria. Browser fixtures never make paid provider calls. Beginner focus links, lost saves with intervening removals, forged input, session renewal, two users and mobile rendering are covered. Production build, fresh CI, additive development migration and hosted acceptance are tracked in the feature PR.
