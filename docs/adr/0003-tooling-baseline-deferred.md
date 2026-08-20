# ADR-0003: Tooling baseline

- Status: Accepted
- Date: 2026-08-19
- Decider: CE admin

## Context

api-integrator's current tooling baseline:

- Package manager: **pnpm** (lockfile committed; `.pnpm-store/` present).
- TS execution: **tsx** for `pnpm cli`; **ts-node/esm loader** for `pnpm start`. No build step. `tsconfig.json` has `emitDeclarationOnly: true`; runtime is on-the-fly.
- TS strictness: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleDetection: force`, `allowImportingTsExtensions` (imports use explicit `.ts` suffixes).
- Tests: **Vitest** for `*.test.ts` unit (mock everything); **Playwright** for `*.spec.ts` integration (real APIs, dedicated test base, runtime guards against production data).
- **No** `lint`, `typecheck`, `format`, or `build` script. **No** `engines` field. `@types/node` pinned `^25.0.3` implies Node 25.

Three baselines were considered:

1. **Mirror api-integrator exactly.** pnpm + tsx + ts-node, same strict ESM TS, Vitest + Playwright, no lint/typecheck/format/build.
2. **Mirror + add lint/typecheck/format and an `engines` pin.** Same stack, plus eslint, `tsc --noEmit`, prettier, and an `engines.node` field.
3. **Mirror + add a build step.** Compile to `dist/` with `tsc`, add a `package.json` `exports` field, make ce-automation an installable package (future home for shared CE code).

## Decision

Adopt **Option 2**. ce-automation mirrors api-integrator's stack (pnpm + tsx + strict ESM TS + Vitest + Playwright) and adds:

- `tsc --noEmit` as `pnpm typecheck` — catches JSON-shape typos in command modules before runtime. ce-automation parses api-integrator's JSON output into typed shapes; a typo would otherwise surface only at first run.
- `eslint` with `typescript-eslint` recommended preset as `pnpm lint` — closes the api-integrator tooling gap. No custom rules; project-neutral.
- `prettier` with default config as `pnpm format` / `pnpm format:check` — keeps multi-file modules consistent.
- `engines.node: ">=20"` — matches the runtime the CE admin actually uses (Node 20.20.2 as of 2026-08). `@types/node ^25.0.3` is the types-only pin mirrored from api-integrator and works on Node 20.

No build step. ce-automation stays source-first like api-integrator; the `ce` script runs `tsx src/cli.ts` directly.

## Decision criteria applied

- ce-automation grows past one CLI file (`commands/`, `orchestrators/`, `lib/` per `docs/architecture.md`) → Option 1 rejected.
- The CE admin wants `tsc --noEmit` to catch JSON-shape typos before runtime → Option 2's strongest criterion met.
- No second consumer of ce-automation exists → Option 3 rejected.

## Consequences

- **Positive**: typecheck catches JSON-shape typos before runtime; lint catches dead code and unused imports; format keeps diffs clean across the multi-module layout.
- **Positive**: `engines.node` pin documents the runtime requirement (Node 20+) that api-integrator left implicit.
- **Negative**: lint and format add CI surface area. Mitigation: no custom rules; presets only. If friction exceeds value, drop lint first (it's the most opinionated).
- **Negative**: still source-first — no `dist/`, no `exports` field. Other projects cannot `npm install` ce-automation. Acceptable: no second consumer exists.

## Implementation

Scripts in `package.json`:

- `ce` — `tsx src/cli.ts` (main entry; mirrors api-integrator's `cli` script)
- `test:vitest` — `vitest` (unit tests, `*.test.ts`)
- `test` — `playwright test` (integration tests, `*.spec.ts`)
- `typecheck` — `tsc --noEmit`
- `lint` — `eslint .`
- `format` — `prettier --write .`
- `format:check` — `prettier --check .`

## References

- api-integrator `package.json` (scripts, deps mirrored)
- api-integrator `tsconfig.json` (strictness mirrored)
- api-integrator `CLAUDE.md` §Commands
- `docs/architecture.md` (dependency table updated to match)
- `docs/testing.md` (run commands updated to match)
