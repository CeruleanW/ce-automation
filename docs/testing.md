# Testing

ce-automation inherits api-integrator's two-runner model: Vitest for unit tests, Playwright for integration tests. The mockable boundaries are `runApiIntegrator` (api-integrator calls) and `checkGwsAuth` (gws binary spawn), both injected via `RunnerConfig` (see `docs/features.md`).

## Test runners

| Runner     | Pattern     | Purpose                                                                                         | Requires                                                               |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Vitest     | `*.test.ts` | Unit tests; mock all external dependencies including `runApiIntegrator`                         | nothing (no credentials)                                               |
| Playwright | `*.spec.ts` | Integration tests; run real `ce` commands against the real api-integrator CLI and real services | api-integrator `.env` provisioned, dedicated test base, runtime guards |

Config files mirror api-integrator's, plus the Option 2 additions (see ADR-0003):

- Vitest matches `src/**/*.test.ts` only (so `*.spec.ts` is left to Playwright).
- Playwright: `testDir: './src'`, `testMatch: '**/*.spec.ts'`, `fullyParallel: true`, `reporter: 'html'`, `trace: 'on-first-retry'`, CI-keyed retries and worker count.

## The single mockable boundary

`src/lib/shell.ts`'s `runApiIntegrator(cmd, args)` is the only I/O seam for api-integrator calls. `src/lib/gws-auth.ts`'s `checkGwsAuth()` is a second I/O seam (it spawns the `gws` binary directly, not via api-integrator). Both are injected via `RunnerConfig`; unit tests mock both and never spawn a real process.

Pattern (ported from api-integrator's "register mock before dynamic import" convention):

```ts
import { describe, it, expect, vi } from "vitest";

describe("feedback-publish orchestrator", () => {
  it("duplicates the feedback template and writes the link back", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeRun = vi.fn(async (cmd: string, args: string[] = []) => {
      calls.push({ cmd, args });
      if (cmd === "drive:duplicate")
        return { id: "form-new-123", name: "Feedback — Test Course" };
      if (cmd === "airtable:fetch-record")
        return { id: args[1], fields: { title: "Test Course" /* … */ } };
      return undefined;
    });

    const { publishFeedbackForm } = await import("./feedback-publish.ts");
    const result = await publishFeedbackForm("recXYZ", {
      runApiIntegrator: fakeRun,
      now: () => new Date("2026-09-01T00:00:00Z"),
      checkGwsAuth: vi.fn(async () => ({
        auth_method: "oauth",
        credential_source: "file",
        storage: "encrypted",
      })),
    });

    expect(result.feedbackFormId).toBe("form-new-123");
    expect(calls.map((c) => c.cmd)).toEqual([
      "airtable:fetch-record",
      "drive:duplicate",
      "drive:find-folder",
      // … forms edit, airtable update
    ]);
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

## Integration tests

Integration tests spawn the real `pnpm ce` against the real api-integrator CLI. They are the only thing that catches:

- JSON-shape drift between ce-automation's expectations and api-integrator's CLI output.
- Arg-forwarding bugs (kebab-case flag mismatches).
- Auth/config errors (Composio connection dropped, Forms auth-config mis-provisioned).

### Prerequisites

- api-integrator repo present at `API_INTEGRATOR_DIR` with `.env` provisioned (see `docs/setup.md`).
- Dedicated test Airtable base, test Drive folder — never production. Integration tests include runtime guards that throw if `AIRTABLE_TEST_BASE_ID` equals the production `CE_CLASS_BASE_ID` or if `GOOGLE_DRIVE_TEST_FOLDER_ID` equals the production `GENERATED_DIRECTORY_ID`. Ported from api-integrator's guard pattern.
- gws and Obsidian CLIs authenticated.

### What to test

Per command group:

- `courses:*` — assert JSON shape against api-integrator `features/airtable/schema.ts` types.
- `registration:*` — run `--id` against a known test record; assert form-link written back; clean up via `drive:duplicate`'s inverse (delete the created form).
- `term:*` — assert idempotency: two runs produce the same Supabase row.
- `forms:status` — read-only; assert `activeConnectionId` is non-null.
- `drive:*` — assert duplicate-then-find round-trip; clean up the duplicate.
- `gws:exec` / `obsidian:exec` — assert a trivial command (e.g., `gws:exec gmail users getProfile`) returns parseable JSON.

### What NOT to test

- Production Airtable base, production Drive folders. Runtime guards enforce this.
- Blocked commands (Op 3, 6, 8). They exit 2; an integration test asserts the exit code and the ADR reference, nothing else.
- Real email send (`ce email:send`). Even in integration tests, never send a real email; gate behind `CE_DRY_RUN=true` or skip via a Playwright `test.skip`.

## Production-data guards

Mirroring api-integrator's pattern, every `*.spec.ts` that could touch Airtable or Drive includes at the top:

```ts
const PROD_BASE = "appXXXXXXXXXXXXX"; // production CE Class base id
const PROD_ROOT = "0XXXXXXXXXXXXXXXX"; // production root Drive folder id

test.beforeAll(() => {
  if (process.env.AIRTABLE_TEST_BASE_ID === PROD_BASE) {
    throw new Error(
      "Refusing to run integration tests against the production Airtable base",
    );
  }
  if (process.env.GOOGLE_DRIVE_TEST_FOLDER_ID === PROD_ROOT) {
    throw new Error(
      "Refusing to run integration tests against the production Drive folder",
    );
  }
});
```

Exact production IDs are recorded in api-integrator's `features/airtable/constants.ts` and `features/google-drive/constants.ts`.

## Run commands

Mirrors api-integrator plus the Option 2 additions (see ADR-0003):

- `pnpm test:vitest` — unit tests (no credentials needed).
- `pnpm test` — integration tests (requires env and API access).
- `pnpm typecheck` — `tsc --noEmit`; catches JSON-shape typos in command modules.
- `pnpm lint` — `eslint .` (typescript-eslint recommended preset, no custom rules).
- `pnpm format:check` — `prettier --check .`; run before committing.

## Doc maintenance

When modifying source under `src/`, update the relevant doc to stay in sync:

| Doc File               | Covers                                          |
| ---------------------- | ----------------------------------------------- |
| `docs/architecture.md` | Module layout, patterns, env vars, dependencies |
| `docs/features.md`     | Command surface, JSON shapes, status            |
| `docs/testing.md`      | Test runners, patterns, mockable boundary       |
| `docs/workflows.md`    | Lifecycle operations, status, timing rules      |

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
- `docs/features.md` (runApiIntegrator contract)
