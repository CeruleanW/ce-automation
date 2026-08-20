# ADR-0003: Tooling baseline deferred

- Status: Proposed
- Date: 2026-08-19
- Decider: CE admin

## Context

api-integrator's current tooling baseline:

- Package manager: **pnpm** (lockfile committed; `.pnpm-store/` present).
- TS execution: **tsx** for `pnpm cli`; **ts-node/esm loader** for `pnpm start`. No build step. `tsconfig.json` has `emitDeclarationOnly: true`; runtime is on-the-fly.
- TS strictness: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleDetection: force`, `allowImportingTsExtensions` (imports use explicit `.ts` suffixes).
- Tests: **Vitest** for `*.test.ts` unit (mock everything); **Playwright** for `*.spec.ts` integration (real APIs, dedicated test base, runtime guards against production data).
- **No** `lint`, `typecheck`, `format`, or `build` script. **No** `engines` field. `@types/node` pinned `^25.0.3` implies Node 25.

ce-automation has not started implementation. Three baselines were considered:

1. **Mirror api-integrator exactly.** pnpm + tsx + ts-node, same strict ESM TS, Vitest + Playwright, no lint/typecheck/format/build.
2. **Mirror + add lint/typecheck/format and an `engines` pin.** Same stack, plus eslint, `tsc --noEmit`, prettier, and an `engines.node` field.
3. **Mirror + add a build step.** Compile to `dist/` with `tsc`, add a `package.json` `exports` field, make ce-automation an installable package (future home for shared CE code).

## Decision

Defer. Record the three candidates and their tradeoffs; pick one before the first feature command ships. Until then, write no `package.json`, `tsconfig.json`, or test config; write only documentation.

This ADR's status flips from **Proposed** to **Accepted** when:

- the first `ce` command is implemented, AND
- the chosen baseline is recorded in the "Decision" section above, AND
- `docs/architecture.md` and `docs/testing.md` are updated to match.

## Decision criteria

- **Pick Option 1** if ce-automation stays a single-file CLI with no external consumers and the CE admin wants maximum consistency with api-integrator.
- **Pick Option 2** if ce-automation grows past one CLI file or if the CE admin wants `tsc --noEmit` to catch JSON-shape typos before runtime. Closes the api-integrator tooling gap that api-integrator chose not to fix.
- **Pick Option 3** if ce-automation is expected to become the future home for shared CE automation code that other projects import as a package. Heaviest; only justified if a second consumer appears.

## Consequences of deferring

- Documentation can be written against any of the three options; all doc examples avoid committing to a build step or lint rules.
- `docs/architecture.md` describes the module layout in implementation-agnostic terms; `docs/testing.md` describes the test runner contract, not the config.
- Risk: deferred decision may drift. Trigger: any PR that adds `package.json`.

## References

- api-integrator `package.json` (scripts, deps)
- api-integrator `tsconfig.json`
- api-integrator `CLAUDE.md` §Commands
