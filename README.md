# CE Automation

Thin CLI shell that automates the Church Education (CE) course-publishing lifecycle on top of [`/ai-projects/api-integrator`](../api-integrator). The CE admin runs a handful of `ce` commands per semester to publish registration forms, send announcement emails, create feedback forms, generate QR codes, and control response collection — all without touching the underlying Airtable, Google Drive, Google Forms, Supabase, gws, or Obsidian clients directly.

Implemented commands cover the read-only course-fetch surface (Op 1), registration-form publishing (Op 2), website sync (Op 3), announcement email create + send (Op 4 + Op 5), and feedback-form publishing (Op 7). Remaining roadmap and blocked operations are tracked in `docs/workflows.md`.

## Goals

Automate the repeated operations of publishing new CE courses each semester. Each course requires:

- Fetching course data from Airtable
- Publishing a registration form (duplicate template, move to term folder, substitute placeholders, collect responses)
- Updating the website
- Creating and sending an announcement email
- Promoting the course
- Creating a feedback form from a template
- Generating a QR code for the feedback form
- Stopping registration responses once the course starts
- Collecting and stopping feedback responses after the course ends

api-integrator implements the service-adapter layer (Airtable, Drive, Forms, Supabase, gws, Obsidian, Composio, Gemini) and Operation #2 (registration-form publishing). ce-automation is the operator surface for the full 8-operation lifecycle.

## Requirements

- Language: TypeScript (executed via tsx; no build step yet — see ADR-0003).
- UI: Command line. The only user is the CE admin.
- Depends on: api-integrator repo at a known path (default `/ai-projects/api-integrator`).

## Quickstart

```bash
# 0. Provision prerequisites and api-integrator's .env (see docs/setup.md)

# 1. Confirm api-integrator is reachable
pnpm ce forms:status

# 2. Ensure the current term exists in Supabase
pnpm ce term:ensure

# 3. List ready courses (read-only)
pnpm ce courses:ready

# 4. Publish a single record's registration form
pnpm ce registration:publish --id <recordId>

# 5. Or publish all ready, unpublished records at once
pnpm ce registration:publish-all
```

## Lifecycle at a glance

| Op  | Stage  | Command                                | Status      |
| --- | ------ | -------------------------------------- | ----------- |
| 1   | Before | `ce courses:ready`                     | implemented |
| 2   | Before | `ce registration:publish-all` / `--id` | implemented |
| 3   | Before | `ce website:update`                    | implemented |
| 4   | Before | `ce email:create`                      | implemented |
| 5   | Before | `ce email:send`                        | implemented |
| 6   | Before | `ce promote:run`                       | blocked     |
| 7   | Before | `ce feedback:publish --id --yes`       | implemented |
| 8   | Before | `ce qr:generate`                       | blocked     |
| —   | During | `ce registration:stop`                 | roadmap     |
| —   | After  | `ce feedback:collect`                  | roadmap     |
| —   | After  | `ce feedback:stop`                     | roadmap     |

Status legend and full per-op steps: `docs/workflows.md`. Full command surface with JSON shapes: `docs/features.md`.

## Documentation

| Doc                                            | Covers                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md) | Layered view, module layout, patterns, env vars, dependencies                 |
| [`docs/workflows.md`](docs/workflows.md)       | The 8-operation lifecycle; primary reference                                  |
| [`docs/features.md`](docs/features.md)         | Command surface, args, delegated commands, JSON shapes, status                |
| [`docs/testing.md`](docs/testing.md)           | Test runners, the single mockable boundary, production-data guards            |
| [`docs/setup.md`](docs/setup.md)               | Prerequisites, env provisioning, first production run, troubleshooting        |
| [`docs/adr/`](docs/adr/)                       | Decision records — relationship, invocation, tooling, op responsibility split |

## Architecture decisions

- [ADR-0001 Thin CLI shell over api-integrator](docs/adr/0001-thin-cli-shell-over-api-integrator.md) — accepted
- [ADR-0002 Shell out to api-integrator CLI and parse JSON stdout](docs/adr/0002-shell-out-to-api-integrator-cli.md) — accepted
- [ADR-0003 Tooling baseline deferred](docs/adr/0003-tooling-baseline-deferred.md) — proposed
- [ADR-0004 Op orchestration responsibility split](docs/adr/0004-op-orchestration-responsibility-split.md) — accepted
- [ADR-0005 Email recipients for `ce email:send`](docs/adr/0005-email-recipients-mechanism.md) — accepted

Follow-up ADRs needed for blocked ops (Op 3 website mechanism, Op 6 promote channel, Op 8 QR generator) before those commands can move from `blocked` to `implemented`.

## What ce-automation does NOT own

Service-adapter code (Airtable, Drive, Forms, Supabase, gws, Obsidian, Composio, Gemini) lives in api-integrator. ce-automation only invokes api-integrator's CLI commands and orchestrates multi-step lifecycle operations by composing those commands. See ADR-0001 and ADR-0004.

## References

- [api-integrator README](../api-integrator/README.md) — engine project
- [api-integrator docs](../api-integrator/docs/) — architecture, features, testing, workflows, Composio Forms auth setup
