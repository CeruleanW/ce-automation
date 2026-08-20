# Architecture

## Overview

`ce-automation` is a thin CLI shell that automates the Church Education (CE) course-publishing lifecycle on top of `/ai-projects/api-integrator`. It does not own service-adapter code; it invokes api-integrator's CLI commands as a child process, parses JSON stdout, and orchestrates multi-step lifecycle operations locally.

See:

- ADR-0001 for the relationship decision.
- ADR-0002 for the invocation mechanism.
- ADR-0003 for the (deferred) tooling baseline.
- ADR-0004 for the per-operation responsibility split.

## Layered view

```
┌─────────────────────────────────────────────────────────────┐
│  CE admin (sole user)                                       │
└────────────────────────────┬────────────────────────────────┘
                             │ pnpm ce <command> [args]
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  ce-automation  src/cli.ts                                   │
│  dispatcher: argv → command module → JSON stdout            │
│                                                              │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ commands/  │  │ orchestrators/│  │ lib/                  │ │
│  │ per-op     │  │ multi-step   │  │ shell.ts (spawn+parse)│ │
│  │ passthrough│  │ local logic  │  │ clock.ts (date math)  │ │
│  └─────┬──────┘  └──────┬───────┘  └──────────┬───────────┘ │
└────────┼────────────────┼─────────────────────┼─────────────┘
         │                 │                     │
         └─────────────────┴─────────────────────┘
                             │ runApiIntegrator(cmd, args)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  api-integrator  pnpm --dir $API_INTEGRATOR_DIR cli <cmd>   │
│  src/cli.ts  →  features/*  →  external services            │
│  (Airtable, Drive, Forms, Supabase, gws, Obsidian, Gemini)  │
└─────────────────────────────────────────────────────────────┘
```

## Module layout

Current `src/` structure (per ADR-0003, Option 2):

```
src/
├── run.ts                       ENTRY: top-level await; calls main() with process.argv.slice(2); loads dotenv
├── cli.ts                       Dispatcher: argv → command module; exports testable main(argv): Promise<number>
├── config.ts                    getIntegratorDir(), isDryRun(), getNowOverride(), now() env readers
├── commands/                   per-op command modules — thin wrappers (implemented)
│   ├── courses.ts              ce courses:* (Airtable passthrough)
│   ├── registration.ts         ce registration:*
│   ├── term.ts                 ce term:* (Supabase passthrough)
│   └── primitives.ts          ce drive:* / forms:* / gws:* / obsidian:* passthroughs
├── orchestrators/              (roadmap — not yet created) local multi-step logic for ops #3-#8
│   ├── website-update.ts      op 3 — blocked pending mechanism ADR
│   ├── email-create.ts        op 4
│   ├── email-send.ts          op 5
│   ├── promote-run.ts         op 6 — blocked pending channel ADR
│   ├── feedback-publish.ts    op 7
│   ├── qr-generate.ts         op 8 — blocked pending generator ADR
│   ├── registration-stop.ts   during-course
│   ├── feedback-collect.ts    after-course
│   └── feedback-stop.ts       after-course
└── lib/
    ├── shell.ts                runApiIntegrator(cmd, args) — spawn pnpm, parse JSON; RunnerConfig interface
    ├── clock.ts                pure date math: emailSendDeadline(), promotionDay() (UTC)
    ├── errors.ts               ApiIntegratorError, ApiIntegratorParseError, BlockedOpError
    └── command.ts              Command / CommandMap types
```

**Co-location rule**: every command in `commands/` and every orchestrator in `orchestrators/` has a paired unit test (`*.test.ts`) in the same directory, mirroring api-integrator's co-location convention.

## Patterns ported from api-integrator

### 1. Command dispatcher shape

`src/cli.ts` mirrors api-integrator's `src/cli.ts` lines 27-201: a `commands` object literal keyed by command name, each entry `{ description, run(args) }`. `main(argv)` takes argv as a parameter (testable), dispatches, prints `JSON.stringify(result, null, 2)` on success, writes to `console.error` on failure, returns an exit code. `src/run.ts` is the actual entry: reads `process.argv.slice(2)`, calls `main`, and `process.exit`s on non-zero.

### 2. `parseArgs` for flags

Use `node:util` `parseArgs` with kebab-case option names, mirroring api-integrator's `--id`, `--name`, `--file-id`, `--titles`.

### 3. Dynamic import inside `run()`

The `run` body uses `await import('./commands/<x>.ts')` rather than top-level static imports, mirroring api-integrator's lazy-load pattern. Keeps cold-start fast and allows test mocks to register before the system-under-test loads.

### 4. Config-injection seam

Each orchestrator takes a `RunnerConfig` parameter defaulting to production:

```ts
export interface RunnerConfig {
  runApiIntegrator: (cmd: string, args?: string[]) => Promise<unknown>;
  now: () => Date;
}
```

Production wiring passes the real `runApiIntegrator` and `() => new Date()`. Unit tests pass a fake `runApiIntegrator` that returns scripted JSON, and a fixed `now` for deterministic timing-rule tests. Mirrors api-integrator's `AirtableConfig` injection pattern in `features/airtable/airtable-api.ts`.

### 5. Production-data guards

Integration tests (`*.spec.ts`) include runtime guards that throw if env vars point at production Airtable base/table IDs or production Drive folder IDs. Mirrors api-integrator's `CE_CLASS_BASE_ID` / `GENERATED_DIRECTORY_ID` guard pattern.

## Env var contract

### Own env vars (read by ce-automation)

| Var                  | Required | Purpose                                                                                | Default                       |
| -------------------- | -------- | -------------------------------------------------------------------------------------- | ----------------------------- |
| `API_INTEGRATOR_DIR` | no       | Path to api-integrator repo                                                            | `/ai-projects/api-integrator` |
| `CE_DRY_RUN`         | no       | If `true`, orchestrators log the sequence of `runApiIntegrator` calls without spawning | (unset)                       |
| `CE_NOW_OVERRIDE`    | no       | ISO date; overrides "now" for timing-rule tests of email/promote                       | (unset)                       |

### Delegated env vars (read by api-integrator via its own `.env`)

ce-automation does not read these. They live in `$API_INTEGRATOR_DIR/.env` and are loaded by api-integrator's `import 'dotenv/config'` at the top of its `cli.ts`. The CE admin sets them once; documented in api-integrator's `docs/architecture.md`:

- `COMPOSIO_API_KEY`, `GOOGLE_API_KEY`, `INTEGRATOR_USER_ID`
- `AIRTABLE_TEST_BASE_ID`, `AIRTABLE_TEST_TABLE_ID` (test base only)
- `GOOGLE_DRIVE_TEST_FOLDER_ID`
- `GOOGLE_FORMS_AUTH_CONFIG_ID`
- `GWS_BINARY`, `GWS_TIMEOUT_MS`, `GWS_DEFAULT_USER_ID`
- `OBSIDIAN_BINARY`, `OBSIDIAN_VAULT`, `OBSIDIAN_TIMEOUT_MS`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

ce-automation's `docs/setup.md` lists the subset the CE admin must provision before first run.

## Dependency table

Per ADR-0003 (Option 2: mirror + typecheck/format/lint + engines). No build step.

| Package                                     | Purpose                                                      |
| ------------------------------------------- | ------------------------------------------------------------ |
| `tsx`                                       | TS execution for `pnpm ce`                                   |
| `dotenv`                                    | `.env` loader (mirrors api-integrator)                       |
| `@types/node`                               | Node type defs (pinned `^25.0.3` to match api-integrator)    |
| `typescript`                                | TS compiler (`tsc --noEmit` for typecheck)                   |
| `tslib`                                     | Required by tsconfig `esModuleInterop` helpers               |
| `vitest`                                    | Unit test runner (`*.test.ts`)                               |
| `@playwright/test`                          | Integration test runner (`*.spec.ts`)                        |
| `eslint`, `@eslint/js`, `typescript-eslint` | Lint (typescript-eslint recommended preset, no custom rules) |
| `prettier`                                  | Format (default config)                                      |

## What ce-automation does NOT own

- Airtable, Drive, Forms, Supabase, gws, Obsidian, Composio, or Gemini client code. All of that lives in api-integrator.
- The dual Google Forms auth-config provisioning (Drive for create/move/delete, Forms for get/edit). Documented in api-integrator's `docs/composio-forms-auth-setup.md`; ce-automation just calls `ce forms:auth` and `ce forms:status`.
- Term-calculation business rules. The next-term table (Winter→Spring→Summer→Fall) is implemented in api-integrator's `features/supabase/term.ts`; ce-automation only calls `ce term:ensure`. The local `lib/clock.ts` duplicates the table only for timing-rule computations (email Tuesday +2 wks, promote Sunday −2) that api-integrator does not expose.

## References

- api-integrator `docs/architecture.md` (source of patterns)
- api-integrator `src/cli.ts` (dispatcher template)
- `docs/workflows.md` (lifecycle, the primary doc)
- `docs/features.md` (command surface)
