# Testing

ce-automation currently uses Vitest for unit tests. The mockable boundaries are `runApiIntegrator` (api-integrator calls) and `checkGwsAuth` (gws binary spawn), both injected via `RunnerConfig` (see `docs/features.md`).

## Test runners

| Runner     | Pattern     | Purpose                                           | Requires                 |
| ---------- | ----------- | ------------------------------------------------- | ------------------------ |
| Vitest     | `*.test.ts` | Unit tests; external commands and services mocked | nothing (no credentials) |
| Playwright | `*.spec.ts` | Real-service integration/e2e tests                | No specs currently       |

Vitest discovers the repository's `*.test.ts` files. The Playwright runner is configured, but this repository currently has no `*.spec.ts` tests.

## Unit-test inventory

| File                                       | Coverage                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli.test.ts`                          | Help and command dispatch; argument validation; api-integrator forwarding; result/error output, including website and feedback commands. |
| `src/lib/clock.test.ts`                    | Current/next term folder names and email/promotion date calculations.                                                                    |
| `src/lib/gws-auth.test.ts`                 | GWS auth status parsing and actionable auth errors.                                                                                      |
| `src/lib/rfc2047.test.ts`                  | RFC 2047 subject encoding.                                                                                                               |
| `src/lib/shell.test.ts`                    | api-integrator process invocation, JSON parsing, and process/CLI errors.                                                                 |
| `src/orchestrators/email-create.test.ts`   | Airtable fetch, announcement rendering, field fallbacks, and malformed response handling.                                                |
| `src/orchestrators/email-send.test.ts`     | Timing gates, dry-run/force behavior, recipient handling, and Gmail invocation.                                                          |
| `src/orchestrators/website-update.test.ts` | Course/news sync ordering, news mapping, stable news IDs, and invalid start-date rejection.                                              |

The CLI tests mock `runApiIntegrator`; they verify the command boundary and arguments, not Google, Airtable, Drive, Forms, or Supabase behavior. Those service workflows are owned by api-integrator.

## The single mockable boundary

`src/lib/shell.ts`'s `runApiIntegrator(cmd, args)` is the only I/O seam for api-integrator calls. `src/lib/gws-auth.ts`'s `checkGwsAuth()` is a second I/O seam (it spawns the `gws` binary directly, not via api-integrator). Both are injected via `RunnerConfig`; unit tests mock both and never spawn a real process.

Pattern used by the email-send unit tests:

```ts
import { describe, it, expect, vi } from "vitest";

describe("email-send orchestrator", () => {
  it("returns a dry-run payload without sending", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeRun = vi.fn(async (cmd: string, args: string[] = []) => {
      calls.push({ cmd, args });
      if (cmd === "airtable:fetch-record")
        return {
          id: args[1],
          fields: { "start-date": "2026-09-20", title: "Test Course" },
        };
      return undefined;
    });

    const { sendEmail } = await import("./email-send.ts");
    const result = await sendEmail(
      "recXYZ",
      {
        runApiIntegrator: fakeRun,
        now: () => new Date("2026-09-10T00:00:00Z"),
        checkGwsAuth: vi.fn(async () => ({
          auth_method: "oauth2",
          credential_source: "file",
          storage: "encrypted",
        })),
      },
      { to: "admin@example.com", dryRun: true },
    );

    expect(result.sent).toBe(false);
    expect("dryRun" in result && result.dryRun).toBe(true);
    expect(calls.map((c) => c.cmd)).toEqual(["airtable:fetch-record"]);
  });
});
```

The `RunnerConfig` injection (see `docs/architecture.md` §Patterns ported from api-integrator) is what makes this work — orchestrators never import `runApiIntegrator` or `checkGwsAuth` directly; they receive them as parameters.

## Pure modules (no mocks needed)

`src/lib/clock.ts` is pure date math. Tests call its functions directly with fixed `Date` inputs:

```ts
describe("clock", () => {
  it("picks Tuesday two weeks before course start", () => {
    const start = new Date("2026-09-20"); // Sunday
    const deadline = emailSendDeadline(start);
    expect(deadline.getDay()).toBe(2); // Tuesday
    expect(deadline.getTime()).toBe(new Date("2026-09-08").getTime()); // 12 days earlier, Tuesday
  });
});
```

No mocks, no I/O. These tests run fastest and should cover every timing rule.

## Run commands

Mirrors api-integrator plus the Option 2 additions (see ADR-0003):

- `pnpm exec vitest run` — run all unit tests once (no credentials needed).
- `pnpm exec vitest run src/cli.test.ts` — run one unit-test file.
- `pnpm test:vitest` — start Vitest in its default watch mode.
- `pnpm test` — Playwright runner; no integration specs are currently present.
- `pnpm typecheck` — `tsc --noEmit`; catches JSON-shape typos in command modules.
- `pnpm lint` — `eslint .` (typescript-eslint recommended preset, no custom rules).
- `pnpm format:check` — `prettier --check .`; run before committing.

## Coverage boundaries

- These tests verify ce-automation's CLI arguments, orchestration order, formatting, and error handling; they do not contact Google, Airtable, Drive, Forms, or Supabase.
- The website course/news sync is tested with a mock api-integrator boundary here. api-integrator owns the actual Airtable/Supabase service behavior.
- There are currently no Playwright end-to-end tests in ce-automation. Live-service coverage belongs in api-integrator's `docs/testing.md`.

## Doc maintenance

When modifying source under `src/`, update the relevant doc to stay in sync:

| Doc File               | Covers                                              |
| ---------------------- | --------------------------------------------------- |
| `docs/architecture.md` | Module layout, patterns, env vars, dependencies     |
| `docs/features.md`     | Command surface, JSON shapes, status                |
| `docs/testing.md`      | Test runners, coverage, patterns, mockable boundary |
| `docs/workflows.md`    | Lifecycle operations, status, timing rules          |

Update docs when:

- A new command or orchestrator module is added, renamed, or removed.
- The `runApiIntegrator` contract or `RunnerConfig` shape changes.
- A new env var is added.
- A test file or testing pattern changes.
- A workflow op changes status (implemented / roadmap / blocked).
- An ADR lands that flips a deferred decision (update ADR-0003, this doc, `architecture.md`, `features.md`).

Do not update docs for internal refactors that don't change the public surface.

## References

- api-integrator `docs/testing.md` (source of patterns)
- api-integrator `CLAUDE.md` §Testing Conventions
- `docs/architecture.md` §Patterns ported from api-integrator
- `docs/features.md` (command surface and `runApiIntegrator` contract)
