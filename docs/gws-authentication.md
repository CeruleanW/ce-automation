# gws authentication

How the Google Workspace CLI (`gws`) authenticates, why `ce email:send` fails
without it, and which parts of the process can be automated. Expands the
one-time setup step in `docs/setup.md` section 3 into a full reference.

## Where auth sits in the call chain

```
pnpm ce email:send              <- ce-automation (this repo)
  pnpm --dir $API_INTEGRATOR_DIR cli gws:exec ...   <- api-integrator
    execFile("gws", ["gmail", "+send", ...])          <- gws binary (global npm install)
      Google OAuth2                                   <- stored credentials in ~/.config/gws/
```

ce-automation never handles tokens. It shells out twice; only the innermost
process (`gws`) talks to Google. When `gws` is unauthenticated the outer layers
report it poorly: api-integrator wraps stderr as `gws command failed (exit N)`,
and ce-automation surfaces only the **last** stderr line (src/lib/shell.ts),
which for `gmail +send` is usually an echo of the composed email body, not the
error. Always debug auth at the `gws` layer directly.

## One-time interactive setup

### Prerequisite: an OAuth client

`gws auth login` needs an OAuth client before it can open the consent page.
Any one of:

| Option             | How                                                                                          | Notes                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| GCP wizard         | `gws auth setup`                                                                             | Requires `gcloud`; creates/uses a GCP project and OAuth client for you        |
| Client secret file | Download `client_secret.json` from Google Cloud Console, save to `~/.config/gws/client_secret.json` | Field layout template: `client_secret_template.json` in the api-integrator repo |
| Env vars           | `GOOGLE_WORKSPACE_CLI_CLIENT_ID` + `GOOGLE_WORKSPACE_CLI_CLIENT_SECRET`                       | Useful when you cannot write to `~/.config/gws/`                              |

Without a client, `gws auth login` prints `401: No OAuth client configured.`

### Login (browser consent)

```bash
gws auth login -s drive,gmail,sheets,forms
```

- `-s` limits the scope picker to the services ce-automation uses (Op 5 needs
  `gmail`; drive/sheets/forms cover the passthrough commands).
- Other scope flags: `--readonly` (read-only scopes), `--full` (all scopes incl.
  pubsub + cloud-platform; may trigger `restricted_client` for unverified apps),
  `--scopes` (explicit comma-separated scope list).
- This step opens a browser and cannot be fully automated. There is no
  device-code flow and no service-account fallback for personal Gmail accounts
  (service accounts require Workspace domain-wide delegation and cannot send as
  `@gmail.com`). Run it on a machine with a browser.

### What gets stored

`gws auth status` reports every artifact. After a successful login:

| Path / field                        | Purpose                                       |
| ----------------------------------- | --------------------------------------------- |
| `~/.config/gws/client_secret.json`  | The OAuth client (file option above)           |
| `~/.config/gws/credentials.enc`     | Encrypted OAuth tokens written by `login`      |
| `~/.config/gws/credentials.json`    | Plain-token alternative read when present      |
| token cache dir                     | Refreshed automatically on subsequent calls    |

Tokens refresh automatically afterwards; re-login is only needed after
`gws auth logout`, credential revocation, or moving to a new machine (copying
`~/.config/gws/` across machines works; tokens may need one refresh).

## Verifying before a real send

```bash
gws auth status
gws gmail users messages list --params '{"userId":"me","q":"is:unread","maxResults":1}'
```

Healthy state reports `"auth_method": "oauth"` and a `credential_source` other
than `"none"`. Unauthenticated state reports `"storage": "none"` with
`*_exists: false` for all files **and still exits 0** — automation must parse
the JSON, not trust the exit code. Any Gmail call returning
`401 / reason: "authError"` also means re-auth is required.

## Automating it

| Step                                              | Automatable? |
| ------------------------------------------------- | ------------ |
| Install `@googleworkspace/cli` globally            | yes          |
| Place `client_secret.json` / set client env vars   | yes          |
| Browser consent (`auth login`)                     | no — human, once per machine |
| Check auth state (`auth status` JSON)              | yes          |
| Provision credentials headless (`GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE`) | yes |
| Re-auth when tokens revoked/expired                | human        |

Two patterns:

1. **Workstation (this repo's default).** Do the interactive login once, then
   gate every automated run behind `pnpm check:gws`, which fails fast with
   remediation hints when auth is missing (see `scripts/check-gws-auth.ts`).
   Wire it into CI or a wrapper script before Op 5.
2. **Headless / CI.** Complete `gws auth export` on a browser machine, store the
   resulting credentials JSON in your secret manager, and point
   `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` at it in the runner environment.
   Alternatively copy the provisioned `~/.config/gws/` directory into the
   runner image. No browser needed at run time; refresh happens against the
   stored refresh token.

## Troubleshooting

Exact errors observed in practice, top layer to bottom:

| Symptom                                                                                                | Layer            | Cause / fix                                                     |
| ------------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------- |
| `airtable:fetch-record exited 1: For help, run: pnpm help run`                                          | ce-automation     | `API_INTEGRATOR_DIR` points at a missing repo or one without a `cli` script |
| `You installed esbuild for another platform ... @esbuild/linux-arm64 vs darwin-arm64`                    | api-integrator    | `node_modules` copied from another OS; run `pnpm install --force` there |
| `The "args" argument must be of type object. Received type string ('gmail +send ...')`                   | api-integrator    | Its cli.ts joined args into one string before `execFile`; pass the array |
| `gws command failed (exit 1): <composed body echoed>`                                                    | api-integrator    | Real error is hidden above/below; run the same `gws ...` call directly |
| `401 Access denied. No credentials provided.`                                                            | gws               | Not logged in: run `gws auth login -s drive,gmail,sheets,forms`  |
| `401 No OAuth client configured.`                                                                       | gws               | Provide `client_secret.json`, client env vars, or `gws auth setup` |
| `401 No encrypted credentials found.`                                                                   | gws               | Client exists but login never completed: run `gws auth login`    |
| `restricted_client` during consent                                                                       | Google            | Caused by `--full` scopes on an unverified app; use `-s` scoping |

Debug recipe: reproduce at the bottom of the chain first —

```bash
gws auth status
gws gmail +send --to <addr> --subject t --body b   # direct, no wrappers
pnpm --dir "$API_INTEGRATOR_DIR" cli gws:exec gmail +send --to <addr> --subject t --body b
pnpm ce email:send --id <recordId> --to <addr> --force
```
