# ADR-0002: Shell out to api-integrator CLI and parse JSON stdout

- Status: Accepted
- Date: 2026-08-19
- Decider: CE admin

## Context

ADR-0001 chose the thin-CLI-shell relationship. Two invocation mechanisms were considered for how ce-automation actually calls api-integrator at runtime:

1. **Shell out to `pnpm cli <cmd> [args...]` with cwd set to the api-integrator path, and parse JSON stdout.**
2. **Programmatic source import via tsx** (workspace dep + `import { ... } from '../../api-integrator/src/...ts'`).
3. **Long-running HTTP/IPC service** wrapping api-integrator.

## Decision

Adopt Option 1. ce-automation spawns `pnpm cli <cmd> [args...]` as a child process with `cwd` set to `$API_INTEGRATOR_DIR` (equivalent to `cd "$API_INTEGRATOR_DIR" && pnpm cli ...`), captures stdout, and parses the trailing `JSON.stringify(result, null, 2)` block. The single boundary lives in `src/lib/shell.ts`:

```ts
export async function runApiIntegrator(
  cmd: string,
  args: string[] = [],
): Promise<unknown> {
  // spawn pnpm cli <cmd> <args...> with cwd=API_INTEGRATOR_DIR
  // on non-zero exit: throw ApiIntegratorError(cmd, stderr, stdout, exitCode)
  // on success: parse stdout JSON, return parsed value
}
```

`API_INTEGRATOR_DIR` defaults to `/ai-projects/api-integrator` and is overridable via env for non-default installs. (Originally implemented as `pnpm --dir <path> cli ...`; switched to the cwd form after pnpm 11 dropped the `--dir` value-parsing, causing it to exec the directory path itself.)

## Error model

- Non-zero exit code → `ApiIntegratorError` carrying `cmd`, `args`, `exitCode`, and stderr trimmed to a single line. Caller decides whether to abort or skip.
- Zero exit but unparseable stdout → `ApiIntegratorParseError` carrying the raw stdout tail (last 2 KB). Indicates api-integrator CLI version drift.
- Stdout may contain non-JSON banners (pnpm sometimes prints run-prefix lines); parser strips leading non-`{`/`[` bytes and trailing whitespace before `JSON.parse`.

## Consequences

- **Positive**: api-integrator remains a black box; ce-automation has zero TS-config coupling to it.
- **Positive**: survives api-integrator internal refactors as long as the CLI command surface and JSON shapes stay stable (enforced by api-integrator's integration tests).
- **Positive**: `runApiIntegrator` is the single mockable seam for unit tests — no need to mock 14 service modules.
- **Negative**: per-command process spawn cost (~300 ms pnpm + tsx cold start). Acceptable: the CE admin runs a handful of commands per semester.
- **Negative**: no compile-time type sharing. Each ce-automation command module must declare the expected JSON shape inline.
- **Mitigation**: `docs/features.md` records every delegated command's expected JSON shape; integration tests assert the shapes against the real CLI.

## Alternatives considered

- Option 2 rejected: requires shared `tsconfig.json` discipline; ADR-0001 already ruled this out.
- Option 3 rejected: only worth it if ce-automation issues many commands per session. The CE admin runs a few commands per semester per course; cold-start latency dominates over per-call overhead, and a long-running service would add its own lifecycle management.

## References

- api-integrator `src/cli.ts` lines 177-201 (dispatcher, prints `JSON.stringify(result, null, 2)` on success, `console.error(err.message)` + exit 1 on failure)
- ADR-0001 (relationship)
- ADR-0004 (which commands are passthrough vs. orchestrated)
