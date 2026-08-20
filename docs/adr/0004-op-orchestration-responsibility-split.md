# ADR-0004: Op orchestration responsibility split

- Status: Accepted
- Date: 2026-08-19
- Decider: CE admin

## Context

ADR-0001 chose a thin CLI shell. ADR-0002 chose shell-out invocation. The 8-operation lifecycle includes operations api-integrator has not implemented (#3 website, #4 email create, #5 email send, #6 promote, #7 feedback form, #8 QR code). ce-automation must decide, per operation, whether to:

- **Passthrough** — delegate one-to-one to a single api-integrator CLI command.
- **Orchestrate locally** — run multiple api-integrator primitive CLI commands in sequence, holding intermediate JSON in memory.
- **Block** — defer until api-integrator grows a feature or until a separate mechanism ADR lands.

## Decision

Per-operation split:

| Op  | Stage   | Command                        | Mode                                         | Status                          |
| --- | ------- | ------------------------------ | -------------------------------------------- | ------------------------------- |
| 1   | Before  | `ce courses:ready`             | Passthrough → `airtable:ready-courses`       | implemented                     |
| 1   | Before  | `ce courses:to-be-published`   | Passthrough → `airtable:to-be-published`     | implemented                     |
| 1   | Before  | `ce courses:fetch --id`        | Passthrough → `airtable:fetch-record --id`   | implemented                     |
| 2   | Before  | `ce registration:publish-all`  | Passthrough → `registration:publish-all`     | implemented                     |
| 2   | Before  | `ce registration:publish --id` | Passthrough → `registration:publish --id`    | implemented                     |
| 3   | Before  | `ce website:update`            | Local orchestration                          | blocked (mechanism ADR pending) |
| 4   | Before  | `ce email:create`              | Local orchestration                          | roadmap                         |
| 5   | Before  | `ce email:send`                | Local orchestration                          | roadmap                         |
| 6   | Before  | `ce promote:run`               | Local orchestration                          | blocked (channel ADR pending)   |
| 7   | Before  | `ce feedback:publish`          | Local orchestration                          | roadmap                         |
| 8   | Before  | `ce qr:generate`               | Local orchestration                          | blocked (generator ADR pending) |
| —   | During  | `ce registration:stop`         | Local orchestration                          | roadmap                         |
| —   | After   | `ce feedback:collect`          | Local orchestration                          | roadmap                         |
| —   | After   | `ce feedback:stop`             | Local orchestration                          | roadmap                         |
| —   | Support | `ce term:ensure`               | Passthrough → `supabase:ensure-current-term` | implemented                     |
| —   | Support | `ce drive:find-folder --name`  | Passthrough → `drive:find-folder`            | implemented                     |
| —   | Support | `ce drive:duplicate --file-id` | Passthrough → `drive:duplicate`              | implemented                     |
| —   | Support | `ce forms:auth`                | Passthrough → `forms:auth`                   | implemented                     |
| —   | Support | `ce forms:status`              | Passthrough → `forms:status`                 | implemented                     |
| —   | Support | `ce gws:exec <args>`           | Passthrough → `gws:exec`                     | implemented                     |
| —   | Support | `ce obsidian:exec <args>`      | Passthrough → `obsidian:exec`                | implemented                     |

## Constraint on local orchestration

Local orchestrators may only call api-integrator's exposed CLI commands. They must not import api-integrator source. Rationale: keeps the boundary in `src/lib/shell.ts`, preserves the ADR-0002 test seam, and prevents TS-config coupling.

When an operation needs a primitive api-integrator does not expose (e.g., a QR generator, a website platform client, a promotion channel), the operation is marked **blocked** and a follow-up ADR records the chosen mechanism. Blocked operations may still be invoked; they exit with a clear "blocked — see ADR-NNNN" message and exit code 2.

## Consequences

- **Positive**: every command's status is explicit; the CE admin never discovers an unimplemented op at run time.
- **Positive**: locally orchestrated ops stay testable — the orchestrator's only external dependency is `runApiIntegrator`, which is mocked in unit tests.
- **Negative**: ops #3, #6, #8 cannot ship until their mechanism ADRs land. `docs/workflows.md` records them with `blocked` status and links to ADR placeholders.
- **Negative**: ops #4, #5, #7, and the during/after controls depend on api-integrator's primitive CLI surface remaining stable; if api-integrator renames a primitive, the orchestrator breaks. Mitigated by integration tests.

## Follow-up ADRs needed

- **Op 3 website update mechanism** — target platform (Sheets-driven? Obsidian-driven? CMS?).
- **Op 6 promote channel** — where the promotion post lands.
- **Op 8 QR generator** — chosen tool or library.

Each follow-up ADR's status starts as `Proposed` and flips to `Accepted` when the mechanism is chosen and the corresponding `ce` command moves from `blocked` to `implemented`.

## References

- api-integrator `README.md` §Publishing Operations (the 8-op list)
- api-integrator `docs/workflows.md` §Full Publishing Lifecycle
- ADR-0001, ADR-0002
