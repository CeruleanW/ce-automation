# Workflows

This document is the primary reference for ce-automation. It describes every operation in the CE course-publishing lifecycle, the command that triggers it, the api-integrator calls it composes, and its implementation status.

For the per-command JSON shapes, see `docs/features.md`. For the relationship and invocation contract, see ADR-0001 and ADR-0002.

## Status legend

| Status      | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| implemented | Command runs end-to-end against real services                          |
| roadmap     | Mechanism chosen; implementation pending                               |
| blocked     | Mechanism undecided; a follow-up ADR is required before implementation |

## Stage map

| Op  | Stage   | Command                        | Mode                                         | Status      |
| --- | ------- | ------------------------------ | -------------------------------------------- | ----------- |
| 1   | Before  | `ce courses:ready`             | Passthrough → `airtable:ready-courses`       | implemented |
| 1   | Before  | `ce courses:to-be-published`   | Passthrough → `airtable:to-be-published`     | implemented |
| 1   | Before  | `ce courses:fetch --id`        | Passthrough → `airtable:fetch-record --id`   | implemented |
| 2   | Before  | `ce registration:publish-all`  | Passthrough → `registration:publish-all`     | implemented |
| 2   | Before  | `ce registration:publish --id` | Passthrough → `registration:publish --id`    | implemented |
| 3   | Before  | `ce website:update`            | Local orchestration                          | blocked     |
| 4   | Before  | `ce email:create`              | Local orchestration                          | implemented |
| 5   | Before  | `ce email:send`                | Local orchestration                          | implemented |
| 6   | Before  | `ce promote:run`               | Local orchestration                          | blocked     |
| 7   | Before  | `ce feedback:publish`          | Local orchestration                          | roadmap     |
| 8   | Before  | `ce qr:generate`               | Local orchestration                          | blocked     |
| —   | During  | `ce registration:stop`         | Local orchestration                          | roadmap     |
| —   | After   | `ce feedback:collect`          | Local orchestration                          | roadmap     |
| —   | After   | `ce feedback:stop`             | Local orchestration                          | roadmap     |
| —   | Support | `ce term:ensure`               | Passthrough → `supabase:ensure-current-term` | implemented |
| —   | Support | `ce drive:find-folder --name`  | Passthrough → `drive:find-folder`            | implemented |
| —   | Support | `ce drive:duplicate --file-id` | Passthrough → `drive:duplicate`              | implemented |
| —   | Support | `ce forms:auth`                | Passthrough → `forms:auth`                   | implemented |
| —   | Support | `ce forms:status`              | Passthrough → `forms:status`                 | implemented |
| —   | Support | `ce gws:exec <args>`           | Passthrough → `gws:exec`                     | implemented |
| —   | Support | `ce obsidian:exec <args>`      | Passthrough → `obsidian:exec`                | implemented |

## Op 1 — Fetch course data from source

### When

Run before any other op. Confirm a course is ready to be published and not already published.

### Steps

1. CE admin runs `ce courses:ready` (or `ce courses:to-be-published` for a stricter ready-and-unpublished filter, or `ce courses:fetch --id <recordId>` for a single record).
2. ce-automation shells out to the matching api-integrator command.
3. api-integrator resolves the Airtable Composio connection, lists CE Class records, filters by `ready-to-be-process=true` and `form-link` blank.
4. JSON result returns to ce-automation, which prints it.

### Data in

Airtable CE Class base (production). Field schema documented in api-integrator's `features/airtable/schema.ts` (`CeClassFields`).

### Data out

Array of `CeClassRecord` objects (or a single record for `--id`). Each record carries the course title, schedule, target audience, descriptions, teacher, and an Airtable record id.

### Status

implemented (passthrough).

## Op 2 — Publish registration form

### When

After Op 1 confirms a record is ready and unpublished.

### Steps

1. CE admin runs `ce registration:publish-all` to process every ready, unpublished record, or `ce registration:publish --id <recordId>` for a single record.
2. ce-automation shells out to api-integrator's `registration:publish-all` / `registration:publish --id`.
3. api-integrator orchestrates the 7-step per-record flow documented in its `docs/workflows.md`:
   - Validate (ready-to-be-process=true, form-link blank, title present)
   - Build `ContentPlan` (title + description with placeholders substituted, blank lines dropped)
   - Resolve connections: Drive (create/move), Forms (edit), Airtable (write-back)
   - Resolve term folder (find or create under `CE_ROOT_DIRECTORY_ID`)
   - `createForm()` — duplicate `REGISTRATION_TEMPLATE_ID`, move into term folder
   - `applyContentToForm()` — set title + description via `GOOGLEFORMS_BATCH_UPDATE_FORM`
   - `updateCeClassRecord()` — write form-link back to Airtable
4. JSON result (or void on `publish-all`) printed by ce-automation.

### Failure model

`publish-all` is sequential. On first failure it aborts; records processed earlier already have `form-link` written back to Airtable, so re-running `publish-all` auto-resumes (the ready-and-unpublished filter skips them). Single-record `publish --id` validates readiness before doing anything; raises `RecordNotReadyError`, `RecordAlreadyPublishedError`, or `MissingRequiredFieldError` from api-integrator.

### Status

implemented (passthrough).

## Op 3 — Update website

### When

After Op 2 writes the registration form link back to Airtable. Ensures the website reflects the new course.

### Steps (target)

1. `ce website:update` orchestrator calls `runApiIntegrator('airtable:fetch-record', ['--id', recordId])` to fetch the course.
2. Calls `runApiIntegrator('supabase:ensure-current-term')` to ensure the current term exists in the Supabase `term` table.
3. Pushes course info to the website platform (mechanism undecided).

### Status

blocked. The website platform and push mechanism are undecided. Follow-up ADR required: candidates include Sheets-driven static site, Obsidian-driven site, or a CMS API.

## Op 4 — Create email

### When

Before the email send deadline (Op 5).

### Steps

1. `ce email:create` orchestrator fetches the course via `airtable:fetch-record --id`.
2. Renders an inline TS template literal with course-field substitution (title, description, target audience, schedule, time, location, teacher, registration form link, note). Description uses `short-description-for-news-or-poster` if non-blank, else `long-description`. Lines whose substituted value is blank are dropped.
3. Returns the rendered email as JSON (`{ recordId, term, subject, body }`) for the CE admin to review or pipe to `ce email:send` (Op 5). The Op 5 orchestrator also re-uses the exported `renderEmailDraft` pure function directly rather than re-running the Op 4 fetch-then-render pipeline.

No Obsidian dependency yet — the template is inline. No `supabase:ensure-current-term` side effect — the course's `term` field is read directly from the Airtable record.

### Status

implemented.

## Op 5 — Send email

### When

Tuesday, two weeks before the course start day.

### Steps

1. `ce email:send` orchestrator fetches the course via `airtable:fetch-record --id` (single fetch — it needs `start-date` for the timing rule and the same fields Op 4 renders from) and computes the send deadline from `start-date` using `lib/clock.ts` `emailSendDeadline`.
2. If invoked before the deadline and `--force` is not set, returns `{ recordId, sent: false, plannedSendAt }` without calling gws.
3. If invoked on or after the deadline (or with `--force`), resolves recipients per ADR-0005 (`--to` flag → `CE_EMAIL_RECIPIENTS` env → `MissingRecipientsError`), re-renders the body via the Op 4 `renderEmailDraft` pure function, and calls `runApiIntegrator('gws:exec', ['gmail', '+send', '--to', addr, ..., '--subject', subject, '--body', body])`. The subject is RFC 2047 B-encoded first (`lib/rfc2047.ts`) — gws mangles raw non-ASCII subjects (Latin-1 double-encoding mojibake) and RFC 5322 requires ASCII headers anyway.
4. api-integrator's `gws:exec` passthrough hands the args to the gws Gmail wrapper, which composes RFC 2822 MIME via `features/gws/mail-message.ts` and sends via the gws CLI.
5. Returns `{ recordId, sent: true, sentAt, messageId }` (messageId from `result.data.id`). `CE_DRY_RUN=true` short-circuits the send and returns `{ recordId, sent: false, dryRun: true, recipients, subject, body, sendArgs }` instead.

### Timing rule

Send day = (course start day) − 14 days, then rolled forward to the next Tuesday. `lib/clock.ts` implements this as pure date math, fully unit-tested.

### Status

implemented.

## Op 6 — Promote

### When

Two Sundays before the course start day.

### Steps (target)

1. `ce promote:run` orchestrator computes the promotion day from the course start date via `lib/clock.ts`.
2. Publishes the promotion to a channel — mechanism undecided.

### Timing rule

Promotion day = (course start day) − 14 days, then rolled forward to the next Sunday. `lib/clock.ts` implements this as pure date math.

### Status

blocked. The promotion channel is undecided (Obsidian post? Website? Social?). Follow-up ADR required.

## Op 7 — Create feedback form

### When

Before the course ends, so the QR code (Op 8) can be generated in time.

### Steps (target)

1. `ce feedback:publish` orchestrator fetches the course via `airtable:fetch-record --id`.
2. Calls `runApiIntegrator('drive:duplicate', ['--file-id', FEEDBACK_TEMPLATE_ID])` to duplicate the feedback form template.
   - `FEEDBACK_TEMPLATE_ID = 1AL97T_D6DlJoBym3PmDeesV2ifbQCPe9D6YJyODN0zM` (per api-integrator README).
3. Resolves the current term folder via `drive:find-folder` (or creates if absent — mechanism TBD).
4. Moves the duplicated form into the term folder.
5. Edits the form content — title + description substituted with course fields — via `forms:*` (Drive-auth-config slug for create/move; Forms-auth-config slug for edit). Mirrors Op 2's dual-connection requirement.
6. Writes the feedback form link back to Airtable. Path undecided: (a) api-integrator adds an `airtable:update-record` CLI command, (b) ce-automation composes `airtable:fetch-record` + `gws:exec sheets append` only if course data is mirrored to Sheets, or (c) defer the write-back until api-integrator exposes writes. Tracked as part of Op 7 roadmap.

### Status

roadmap.

## Op 8 — Generate QR code for feedback form

### When

After Op 7 produces the feedback form link.

### Steps (target)

1. `ce qr:generate` orchestrator fetches the feedback form link from the Airtable record.
2. Generates a QR code PNG encoding the form URL — mechanism undecided.
3. Writes the QR image somewhere accessible to the CE admin (Drive folder via `drive:*`, Obsidian via `obsidian:exec`, or local file — TBD).

### Status

blocked. The QR generator is undecided. Follow-up ADR required: candidates include a Composio-exposed QR tool, an external QR API, or a local library.

## During course — Stop registration responses

### When

On or after the course start day.

### Steps (target)

1. `ce registration:stop` orchestrator fetches the registration form link from the Airtable record.
2. Calls `forms:*` (or `gws:exec forms ...`) to set `acceptResponses=false` on the registration form.

### Status

roadmap. Depends on api-integrator exposing a Forms `batch_update` wrapper for `acceptResponses` (currently the Forms CLI surface exposes only `forms:auth` and `forms:status`; a content-edit command may need to be added there first).

## After course — Collect feedback responses

### When

After the course lectures end.

### Steps (target)

1. `ce feedback:collect` orchestrator fetches the feedback form link from the Airtable record.
2. Calls `forms:*` (or `gws:exec forms responses list ...`) to list responses.
3. Stores responses — mechanism TBD (Obsidian note? Supabase table? JSON file?).

### Status

roadmap.

## After course — Stop feedback responses

### When

After feedback collection is complete.

### Steps (target)

1. `ce feedback:stop` orchestrator fetches the feedback form link.
2. Calls `forms:*` (or `gws:exec`) to set `acceptResponses=false` on the feedback form.

### Status

roadmap. Same dependency as `ce registration:stop`.

## Timing calendar

### Term calculation

Based on current month, the system prepares for the **next** term. Implemented in api-integrator's `features/supabase/term.ts`; ce-automation relies on `ce term:ensure` which shells out to `supabase:ensure-current-term`.

| Current Month      | Next Term          | Folder Month Range |
| ------------------ | ------------------ | ------------------ |
| Jan – Mar (Winter) | Spring             | 04 – 06            |
| Apr – Jun (Spring) | Summer             | 07 – 08            |
| Jul – Aug (Summer) | Fall               | 09 – 12            |
| Sep – Dec (Fall)   | Winter (next year) | 01 – 03            |

ce-automation relies on `ce term:ensure` for term persistence; `lib/clock.ts` only computes email/promote deadlines from `courseStart` (course-start − 14d rolled forward to Tuesday/Sunday). The source of truth for the term table itself stays api-integrator.

### Email send day

Course start day − 14 days, rolled forward to next Tuesday.

### Promotion day

Course start day − 14 days, rolled forward to next Sunday.

## Failure model

### Passthrough commands

Surface api-integrator's exit code and stderr verbatim. The CE admin sees the same error api-integrator would have shown.

### Locally orchestrated commands

- Each step's failure is wrapped in `ApiIntegratorError` carrying the failing command and exit code.
- Orchestrators abort on first failure by default; the CE admin re-runs after fixing the cause.
- Idempotency: every orchestrator must be safe to re-run. State written back to Airtable (form links) acts as the resume checkpoint, mirroring Op 2's behavior.
- Blocked commands exit with code 2 and a message naming the follow-up ADR; never spawn a child process.

## Full lifecycle reference

Ported from api-integrator `README.md` §Publishing Operations:

### Before course starts

1. Fetch course data from Airtable — **Op 1** (implemented)
2. Publish registration form — **Op 2** (implemented)
3. Update website with course info — **Op 3** (blocked)
4. Create announcement email — **Op 4** (implemented)
5. Send announcement email (Tuesday +2 wks before start) — **Op 5** (implemented)
6. Promote (2 Sundays before start) — **Op 6** (blocked)
7. Create feedback form from template — **Op 7** (roadmap)
8. Generate QR code for feedback form — **Op 8** (blocked)

### During course

- Stop collecting registration responses — `ce registration:stop` (roadmap)

### After course

- Collect feedback responses — `ce feedback:collect` (roadmap)
- Stop collecting feedback responses — `ce feedback:stop` (roadmap)
