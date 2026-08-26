# Features

This document describes ce-automation's public surface: the `ce` command groups, their signatures, what each delegates to, and the expected JSON shape returned.

For the lifecycle context behind each command, see `docs/workflows.md`. For the dispatcher and module patterns, see `docs/architecture.md`.

## Command surface

ce-automation exposes a single `ce` command. The first argument is a `group:action` selector. Args after it are passed through to the underlying command.

```bash
pnpm ce <group:action> [args...]
```

All implemented commands return JSON on stdout (pretty-printed) and exit 0 on success. On failure they write a single-line error to stderr and exit 1. Blocked commands exit 2 with an ADR reference.

## Group: `courses`

Airtable course-record passthroughs. Source of record data for every other op.

### `ce courses:ready`

- **Args**: none
- **Delegates to**: `airtable:ready-courses`
- **Returns**: array of ready course records (filtered by `ready-to-be-process=true`). Source of truth: api-integrator `features/airtable/processors.ts` `getReadyCourseRecordsToBePublished`.
- **Status**: implemented

### `ce courses:to-be-published`

- **Args**: none
- **Delegates to**: `airtable:to-be-published`
- **Returns**: array of records that are ready AND have a blank `form-link` (i.e., not yet published).
- **Status**: implemented

### `ce courses:fetch --id <recordId>`

- **Args**: `--id <recordId>` (required)
- **Delegates to**: `airtable:fetch-record --id`
- **Returns**: single `CeClassRecord` object. Shape documented in api-integrator `features/airtable/schema.ts` (`CeClassRecord`).
- **Status**: implemented

### `ce courses:list [--titles]`

- **Args**: `--titles` (optional, boolean; if set, returns only the `title` field of each record)
- **Delegates to**: `airtable:fetch-all [--titles]`
- **Returns**: array of `CeClassRecord` (or array of strings if `--titles`).
- **Status**: implemented

## Group: `registration`

Registration-form publishing, Op 2.

### `ce registration:publish-all`

- **Args**: none
- **Delegates to**: `registration:publish-all`
- **Returns**: void (no JSON printed; api-integrator's `publishAllReady` resolves without a return value)
- **Failure model**: sequential; aborts on first failure; re-running auto-resumes because earlier records already have `form-link` written back to Airtable.
- **Status**: implemented

### `ce registration:publish --id <recordId>`

- **Args**: `--id <recordId>` (required)
- **Delegates to**: `registration:publish --id`
- **Returns**: result of `publishRegistrationFormById` (api-integrator `domains/registration.ts:235`). Shape: object with form id, form link, term folder id (exact fields TBD by api-integrator).
- **Errors raised (passthrough from api-integrator)**: `MissingRequiredFieldError`, `RecordNotReadyError`, `RecordAlreadyPublishedError`.
- **Status**: implemented

### `ce registration:stop`

- **Args**: `--id <recordId>` (required)
- **Delegates to**: composed locally — `airtable:fetch-record --id` to get the form link, then `forms:*` (or `gws:exec forms ...`) to set `acceptResponses=false`.
- **Returns**: `{ recordId, formLink, acceptResponses: false }` (target shape).
- **Status**: roadmap. Depends on api-integrator exposing a Forms `batch_update` wrapper.

## Group: `feedback`

Feedback-form lifecycle, Op 7 + after-course collection.

### `ce feedback:publish --id <recordId>`

- **Args**: `--id <recordId>` (required)
- **Delegates to (locally composed)**:
  - `airtable:fetch-record --id` to fetch course fields
  - `drive:duplicate --file-id 1AL97T_D6DlJoBym3PmDeesV2ifbQCPe9D6YJyODN0zM` (feedback template)
  - `drive:find-folder --name <term-folder>` (or create — TBD)
  - `forms:*` to edit title + description (Forms-auth-config slug)
  - Airtable update to write `feedback-form-link` back (path TBD — see workflows.md Op 7)
- **Returns**: `{ recordId, feedbackFormId, feedbackFormLink, termFolderId }` (target shape).
- **Status**: roadmap

### `ce feedback:collect --id <recordId>`

- **Args**: `--id <recordId>` (required)
- **Delegates to (locally composed)**: `airtable:fetch-record` to fetch `feedback-form-link`, then `forms:*` (or `gws:exec forms responses list`) to list responses, then storage step (TBD).
- **Returns**: array of feedback response objects (target shape; storage format TBD).
- **Status**: roadmap

### `ce feedback:stop --id <recordId>`

- **Args**: `--id <recordId>` (required)
- **Delegates to (locally composed)**: `airtable:fetch-record` + `forms:*` (or `gws:exec`) to set `acceptResponses=false`.
- **Returns**: `{ recordId, feedbackFormLink, acceptResponses: false }` (target shape).
- **Status**: roadmap

## Group: `email`

Email create (Op 4) and send (Op 5).

### `ce email:create --id <recordId>`

- **Args**: `--id <recordId>` (required)
- **Delegates to (locally composed)**: `airtable:fetch-record --id` for course data; inline TS template for body rendering.
- **Returns**: `{ recordId, term, subject, body }` — rendered email draft as JSON. Description uses `short-description-for-news-or-poster` if non-blank, else `long-description`; lines with blank values are dropped.
- **Status**: implemented

### `ce email:send --id <recordId>`

- **Args**: `--id <recordId>` (required); `--to <addr1,addr2,...>` (optional, overrides `CE_EMAIL_RECIPIENTS` for this invocation per ADR-0005); `--force` (optional boolean, bypasses the timing-rule check).
- **Delegates to (locally composed)**: `airtable:fetch-record --id` (single fetch — needs `start-date` for the timing rule and the same fields Op 4 renders); `lib/clock.ts` `emailSendDeadline` computes the send deadline (Tuesday +2 wks before course start); the Op 4 `renderEmailDraft` pure function re-renders subject + body; on/after the deadline (or with `--force`), a pre-flight `checkGwsAuth` gate (spawns `gws auth status`, parses JSON — see `lib/gws-auth.ts` and `docs/gws-authentication.md`) verifies gws is authenticated, then `gws:exec gmail +send --to <addr> ... --subject <s> --body <b>` sends via the gws CLI's high-level `+send` helper (which handles RFC 5322 MIME + base64 internally). The gate is skipped on dry-run and before-deadline paths.
- **Recipient resolution**: `--to` flag (comma-separated, trimmed, empties dropped) → `CE_EMAIL_RECIPIENTS` env var → `MissingRecipientsError`. Never silently sends to nobody.
- **Returns**: `{ recordId, sent: false, plannedSendAt }` when before the deadline and `--force` is not set; `{ recordId, sent: true, sentAt, messageId }` after a successful send (`messageId` from `result.data.id`, `null` if absent); `{ recordId, sent: false, dryRun: true, recipients, subject, body, sendArgs }` when `CE_DRY_RUN=true` (no gws call).
- **Errors raised**: `MissingRecipientsError`, `MissingStartDateError`, `GwsAuthError` (pre-flight gate failure, with remediation hints), `ApiIntegratorError` (gws send failure).
- **Status**: implemented

## Group: `auth`

One-time-per-machine setup helpers. Not lifecycle ops — these prepare a dependency so the op commands can run.

### `ce auth:gws [--scopes <csv>]`

- **Args**: `--scopes <drive,gmail,sheets,forms>` (optional, defaults to `drive,gmail,sheets,forms`)
- **Delegates to (locally composed)**: `lib/gws-auth.ts` `readGwsAuthStatus` pre-checks the OAuth client (file on disk, env vars, or prior `gws auth setup`); if missing, throws `GwsClientError` with setup guidance. If an OAuth client exists and gws is not yet authenticated, spawns `gws auth login -s <scopes>` with inherited stdio (opens the host browser for OAuth consent — run on a machine with a browser). After login (or skipped if already authed), `checkGwsAuth` verifies `auth_method` is set and non-`none` (real value: `oauth2`) + `storage!=none`.
- **Returns**: `{ authenticated: true, authMethod, credentialSource, scopes, loginSkipped }`.
- **Errors raised**: `GwsClientError` (no OAuth client — lists the three ways to provide one), `GwsAuthError` (post-login verification failed), `Error` (login exited non-zero).
- **Interactive**: yes — the `gws auth login` step opens a browser and blocks until consent completes. No browser-less fallback for personal Gmail (see `docs/gws-authentication.md`).
- **Status**: implemented

## Group: `website`

Op 3.

### `ce website:update --id <recordId>`

- **Args**: `--id <recordId>` (required)
- **Delegates to**: undecided.
- **Returns**: TBD.
- **Status**: blocked — see follow-up ADR (mechanism undecided: Sheets-driven static site, Obsidian-driven site, or CMS API).

## Group: `promote`

Op 6.

### `ce promote:run --id <recordId>`

- **Args**: `--id <recordId>` (required); `--force` (optional) to bypass the timing-rule check.
- **Delegates to**: undecided.
- **Returns**: TBD.
- **Status**: blocked — see follow-up ADR (channel undecided: Obsidian post, website, social).

## Group: `qr`

Op 8.

### `ce qr:generate --id <recordId>`

- **Args**: `--id <recordId>` (required)
- **Delegates to (locally composed)**: `airtable:fetch-record` to fetch `feedback-form-link`, then QR generator (mechanism undecided) to produce a PNG, then storage step (`drive:*`, `obsidian:exec`, or local file — TBD).
- **Returns**: `{ recordId, feedbackFormLink, qrLocation }` (target shape).
- **Status**: blocked — see follow-up ADR (generator undecided).

## Group: `term`

Supabase term-table support command.

### `ce term:ensure`

- **Args**: none
- **Delegates to**: `supabase:ensure-current-term`
- **Returns**: result of `ensureCurrentTerm()` from api-integrator `features/supabase/processors.ts`. Idempotent upsert of the current term row.
- **Status**: implemented

## Group: `drive`

Drive primitive passthroughs for power-user access.

### `ce drive:find-folder --name <folderName>`

- **Args**: `--name <folderName>` (required)
- **Delegates to**: `drive:find-folder --name`
- **Returns**: Drive folder object (id, name, mimeType) from `findFolderByName`.
- **Status**: implemented

### `ce drive:duplicate --file-id <fileId>`

- **Args**: `--file-id <fileId>` (required)
- **Delegates to**: `drive:duplicate --file-id`
- **Returns**: duplicated file object (id, name) from `duplicateFile`.
- **Status**: implemented

## Group: `forms`

Google Forms Composio connection management.

### `ce forms:auth`

- **Args**: none
- **Delegates to**: `forms:auth`
- **Returns**: `{ userId, authConfigId, connectedAccountId, alreadyConnected }`. Opens a browser for OAuth on first run.
- **Status**: implemented

### `ce forms:status`

- **Args**: none
- **Delegates to**: `forms:status`
- **Returns**: `{ authConfigId, userId, totalAccounts, accounts: [{id, status}], activeConnectionId }`.
- **Status**: implemented

## Group: `gws`

Raw passthrough to the Google Workspace CLI wrapper.

### `ce gws:exec <args...>`

- **Args**: any number of args joined with spaces and passed as the gws command
- **Delegates to**: `gws:exec <args...>`
- **Returns**: parsed JSON stdout from the gws CLI binary.
- **Status**: implemented

## Group: `obsidian`

Raw passthrough to the Obsidian CLI wrapper.

### `ce obsidian:exec <args...>`

- **Args**: any number of args joined with spaces and passed as the Obsidian CLI command
- **Delegates to**: `obsidian:exec <args...>`
- **Returns**: parsed JSON stdout from the Obsidian CLI binary.
- **Status**: implemented

## `lib/shell.ts` contract

The mockable boundary for api-integrator calls. All commands and orchestrators call `runApiIntegrator` rather than spawning directly. A second mockable boundary, `lib/gws-auth.ts`'s `checkGwsAuth`, spawns the `gws` binary directly (not via api-integrator) and is injected through the same `RunnerConfig`.

```ts
export async function runApiIntegrator(
  cmd: string,
  args: string[] = [],
): Promise<unknown>;

export class ApiIntegratorError extends Error {
  constructor(
    public readonly cmd: string,
    public readonly args: string[],
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(`${cmd} exited ${exitCode}: ${stderr}`);
  }
}

export class ApiIntegratorParseError extends Error {
  constructor(
    public readonly cmd: string,
    public readonly stdoutTail: string,
  ) {
    super(`${cmd} returned unparseable output: ...${stdoutTail}`);
  }
}

export class BlockedOpError extends Error {
  constructor(
    public readonly command: string,
    public readonly adr: string,
  ) {
    super(`${command} is blocked — see ${adr}`);
  }
}
```

## `lib/clock.ts` contract

Pure date math, no I/O. Unit-tested without mocks.

```ts
export function emailSendDeadline(courseStart: Date): Date; // Tue, courseStart - 14d rolled forward
export function promotionDay(courseStart: Date): Date; // Sun, courseStart - 14d rolled forward
```

`CE_NOW_OVERRIDE` env var, when set, overrides `new Date()` only for timing-rule checks inside orchestrators that read it via `RunnerConfig.now`.

## Help output

`pnpm ce` with no args, or with `-h` / `--help`, prints the command list with descriptions, mirroring api-integrator's `printHelp()` shape.
