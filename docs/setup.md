# Setup

Getting-started guide for the CE admin. Walks through prerequisites, env provisioning, first production run, and common troubleshooting.

## Prerequisites checklist

### 1. Node and pnpm

- Node version: ≥20 (per ADR-0003; `engines.node` field in `package.json`). The CE admin's system runs Node 20.20.2.
- pnpm: install globally (`corepack enable && corepack prepare pnpm@latest --activate`).

### 2. api-integrator repo

- Clone `/ai-projects/api-integrator` (or set `API_INTEGRATOR_DIR` to its path if installed elsewhere).
- Follow its setup. The CE admin must have run `pnpm install` there and provisioned its `.env` (see below).

### 3. Google Workspace CLI (`gws`)

Full reference including automation and troubleshooting: `docs/gws-authentication.md`.

- Install: `npm install -g @googleworkspace/cli`
- Provide an OAuth client (one of): run `gws auth setup` (needs `gcloud`), or save `client_secret.json` to `~/.config/gws/`, or set `GOOGLE_WORKSPACE_CLI_CLIENT_ID` + `GOOGLE_WORKSPACE_CLI_CLIENT_SECRET` env vars.
- Authenticate end-to-end (pre-checks the client, opens browser for consent, verifies):
  ```bash
  pnpm ce auth:gws
  # already-authed → skips login; otherwise opens browser, then verifies
  # override scopes: pnpm ce auth:gws --scopes gmail
  ```
  This opens a browser for OAuth consent — **run it on a machine with a browser**. Headless environments (servers, CI, remote shells without X forwarding) cannot complete the OAuth flow. There is no device-code or service-account fallback for personal Gmail accounts: service accounts require Google Workspace domain-wide delegation and do not work with `@gmail.com` senders. If gws is already authenticated on another machine, copying `~/.config/gws/` (client_secret.json + credentials) to the target machine works, but the OAuth tokens may need refresh on first use.
- Verify before first send: `gws auth status` should report `"auth_method": "oauth"` and `credential_source` other than `"none"`.
- Used by ce-automation for Op 5 (email send) and any `ce gws:exec` passthrough.

### 4. Obsidian CLI

- Install Obsidian CLI v1.12+.
- Set the vault path used by api-integrator (it reads `OBSIDIAN_VAULT` from api-integrator's `.env`).
- Used by ce-automation for Op 4 (email create) and any `ce obsidian:exec` passthrough.

### 5. Composio dashboard

The two Google auth configs that api-integrator depends on must already be provisioned on the Composio dashboard:

- `googledrive` auth config — id `ac_YhLy6f-BU4RX` (hardcoded in api-integrator `features/google-drive/constants.ts`).
- `googleforms` auth config — id stored in api-integrator's `.env` as `GOOGLE_FORMS_AUTH_CONFIG_ID`. Provisioning walkthrough: api-integrator `docs/composio-forms-auth-setup.md`.

If either is missing, `ce forms:status` will report zero active connections and `ce registration:publish-all` will fail at the auth step.

## Env provisioning

ce-automation reads its own `.env`. All of its keys are optional:

```bash
# .env (ce-automation)
API_INTEGRATOR_DIR=/ai-projects/api-integrator
CE_DRY_RUN=
CE_NOW_OVERRIDE=
```

Everything else lives in api-integrator's `.env`. The CE admin provisions it once. Keys the CE admin must set there (names only; values are secrets):

| Key                           | Purpose                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `COMPOSIO_API_KEY`            | Composio SDK authentication                                                                       |
| `GOOGLE_API_KEY`              | Gemini client (used by api-integrator's `genai:hello`)                                            |
| `INTEGRATOR_USER_ID`          | Composio user id (defaults to `registration-user-001`)                                            |
| `GOOGLE_FORMS_AUTH_CONFIG_ID` | Forms auth config id (provisioned via the dashboard walkthrough)                                  |
| `AIRTABLE_TEST_BASE_ID`       | Test Airtable base id — MUST point at the dedicated test base, never the production CE Class base |
| `AIRTABLE_TEST_TABLE_ID`      | Test Airtable table id                                                                            |
| `GOOGLE_DRIVE_TEST_FOLDER_ID` | Test Drive folder id                                                                              |
| `SUPABASE_URL`                | Supabase project URL                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY`   | Supabase service-role key (bypasses RLS; keep secret)                                             |
| `GWS_BINARY`                  | gws binary path (default `gws`)                                                                   |
| `GWS_TIMEOUT_MS`              | gws spawn timeout (default per api-integrator)                                                    |
| `GWS_DEFAULT_USER_ID`         | gws default user id                                                                               |
| `OBSIDIAN_BINARY`             | Obsidian CLI binary path                                                                          |
| `OBSIDIAN_VAULT`              | Obsidian vault root path                                                                          |
| `OBSIDIAN_TIMEOUT_MS`         | Obsidian spawn timeout                                                                            |

See api-integrator's `docs/architecture.md` for the canonical env table.

## First production run

After prerequisites and env are provisioned. Steps 1–4 are read-only or idempotent verification; step 5 is a real publish that writes a form to Google Drive and a `form-link` back to Airtable — use a record id you intend to publish.

```bash
# 1. Install ce-automation deps
pnpm install

# 2. Verify api-integrator is reachable (read-only)
pnpm ce forms:status
# Expect: totalAccounts >= 1, activeConnectionId non-null

# 3. Ensure the current term exists in Supabase (idempotent write)
pnpm ce term:ensure

# 4. List ready courses (read-only)
pnpm ce courses:ready

# 5. Publish a single record's registration form (writes form + Airtable link)
pnpm ce registration:publish --id <recordId>
```

If step 2 returns zero accounts, run `pnpm ce forms:auth` (opens a browser for OAuth) and re-check.

### First real email send (Op 5)

Sending an announcement email is a real Gmail send — it cannot be undone. Before the first send, verify gws Gmail auth and dry-run the payload:

```bash
# 1. Verify gws is authenticated (run on a machine with gws auth completed)
gws auth status
# Expect: auth_method=oauth, credential_source != none

# 2. Dry-run: render the email + show send args without calling gws
CE_DRY_RUN=true pnpm ce email:send --id <recordId> --to <addr@example.com> --force
# Review subject, body, recipients, sendArgs in the JSON output

# 3. Real send (drops CE_DRY_RUN)
pnpm ce email:send --id <recordId> --to <addr@example.com> --force
# Expect: { recordId, sent: true, sentAt, messageId }

# 4. Without --force, the timing rule applies:
#    send proceeds only on/after emailSendDeadline(start-date) = Tue, start − 14d rolled forward
pnpm ce email:send --id <recordId> --to <addr@example.com>
```

If `--to` is omitted, recipients fall back to `CE_EMAIL_RECIPIENTS` in `.env` (per ADR-0005). If neither is set, the orchestrator throws `MissingRecipientsError` before calling gws — no email is sent.

## Troubleshooting

### `forms:status` reports zero active connections

The Google Forms Composio auth config is not connected. Either the auth config id in api-integrator's `.env` (`GOOGLE_FORMS_AUTH_CONFIG_ID`) is wrong, or the connection has not been initiated. Run `ce forms:auth` to initiate; if it still fails, follow api-integrator's `docs/composio-forms-auth-setup.md`.

### Term calc picks the wrong season

The next-term table maps current month to next term:

| Current            | Next               |
| ------------------ | ------------------ |
| Jan – Mar (Winter) | Spring             |
| Apr – Jun (Spring) | Summer             |
| Jul – Aug (Summer) | Fall               |
| Sep – Dec (Fall)   | Winter (next year) |

If `ce term:ensure` inserts the wrong term, check the system clock on the host running ce-automation. The calc is based on `new Date()`; an off-by-one month or wrong timezone will pick the wrong row. To verify without writing to the production Supabase, point `API_INTEGRATOR_DIR` at a copy of api-integrator whose `.env` references a test Supabase project, then run `ce term:ensure`. For Op 5, `CE_NOW_OVERRIDE=<ISO date> CE_DRY_RUN=true pnpm ce email:send --id <recordId>` inspects the computed send deadline and rendered payload against a fixed "now" without sending. Note: `ce courses:ready` is a passthrough and does not read "now", so it cannot verify term calc.

### `ApiIntegratorError: gws:exec exited 1: ... Application Default Credentials (ADC) ...`

gws is not authenticated. Run `gws auth status` to confirm (`auth_method: none`). Fix: run `gws auth login -s gmail` on a machine with a browser. See §Prerequisites 3 for the headless limitation. If you only need to preview the email, use `CE_DRY_RUN=true pnpm ce email:send ... --force` — it renders the payload without calling gws, so no auth is required.

### `ApiIntegratorError: gws:exec exited 1: ... unrecognized subcommand ...`

The gws CLI version installed does not match the subcommand shape ce-automation emits (`gmail +send --to --subject --body`). Check `gws --version` and `gws gmail +send --help`. If the `+send` helper is unavailable in your gws version, upgrade gws (`npm install -g @googleworkspace/cli`) or file an issue — do not change the arg shape without updating `docs/features.md` and the Op 5 unit tests.

### `MissingRecipientsError: No email recipients ...`

Neither `--to` nor `CE_EMAIL_RECIPIENTS` resolved any address. Pass `--to <addr1,addr2,...>` or set `CE_EMAIL_RECIPIENTS` in `.env`. The orchestrator throws before calling gws, so no email is sent.

### `MissingStartDateError: Course <id> has no start-date ...`

The Airtable record has no `start-date` field, so `emailSendDeadline` cannot be computed. Fix the record in Airtable (add a `start-date`), or use `--force` (still requires `start-date` to render — this error is thrown before the timing-rule check).

### `ApiIntegratorError: <cmd> exited 1: ...`

A passthrough command failed inside api-integrator. The error message is api-integrator's own. Re-run the same command directly against api-integrator to debug:

```bash
pnpm --dir "$API_INTEGRATOR_DIR" cli <cmd> [args...]
```

If that succeeds but `ce <cmd>` fails, the issue is in ce-automation's arg forwarding — check `docs/features.md` for the expected arg shape.

### `ApiIntegratorParseError: <cmd> returned unparseable output`

api-integrator's CLI printed something other than trailing JSON. Causes:

- api-integrator CLI version drift (a new banner line, a different stdout format).
- A `console.log` snuck into api-integrator's `cli.ts` outside the `JSON.stringify(result, null, 2)` call.
- pnpm printed a warning banner (the parser strips leading non-`{`/`[` bytes, but a banner in the middle of output will still break it).

Fix by aligning api-integrator to a known-good revision and re-running.

### `BlockedOpError: <command> is blocked — see ADR-NNNN`

The command depends on an undecided mechanism (Op 3, 6, or 8). Read the referenced ADR; if the mechanism has been chosen since the ADR was last updated, update the ADR and the command's status in `docs/workflows.md` before trying again.

### `pnpm ce` not found

ce-automation's `package.json` has not been created yet (ADR-0003 pending). Until then, no `ce` script exists. Implementation cannot start until ADR-0003 lands.

## References

- api-integrator `README.md` §Google Workspace CLI Setup
- api-integrator `docs/composio-forms-auth-setup.md`
- api-integrator `docs/architecture.md` (env table)
- `docs/architecture.md` (ce-automation env table)
- `docs/testing.md` (integration test prerequisites)
