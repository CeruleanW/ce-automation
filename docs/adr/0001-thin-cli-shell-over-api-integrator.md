# ADR-0001: Thin CLI shell over api-integrator

- Status: Accepted
- Date: 2026-08-19
- Decider: CE admin

## Context

`/ai-projects/api-integrator` already implements Operation #2 of the 8-operation CE course-publishing lifecycle (registration-form publishing), plus partial Operation #1 (Airtable fetch), Supabase term tracking, `gws` wrappers for Gmail/Drive/Forms, Obsidian CLI wrappers, and a Gemini client. It exposes those capabilities through a `pnpm cli <command>` dispatcher that prints `JSON.stringify(result, null, 2)` on success and writes errors to stderr.

`ce-automation` exists to give the CE admin a single operational surface for the full course-publishing lifecycle. It must not duplicate api-integrator's service-adapter logic. Three relationship options were considered:

1. **Thin CLI shell over api-integrator** — ce-automation exposes a `ce` command whose modules delegate to api-integrator's CLI for implemented operations and compose api-integrator's primitive CLI commands for unimplemented operations (#3 website, #4 email create, #5 email send, #6 promote, #7 feedback form, #8 QR code).
2. **Successor that supersedes api-integrator** — ce-automation becomes the production home; api-integrator is archived as R&D.
3. **Workspace dependency with source imports** — pnpm workspace link; ce-automation imports api-integrator's barrels directly via tsx.

## Decision

Adopt Option 1: ce-automation is a thin CLI shell over api-integrator. Both projects coexist. api-integrator remains the service-adapter layer; ce-automation is the operator surface and lifecycle orchestrator.

## Consequences

- **Positive**: single user-facing surface; api-integrator can evolve independently; no shared TypeScript config; ce-automation stays small.
- **Positive**: clear separation of concerns — service adapters vs. lifecycle orchestration.
- **Negative**: no shared types across the boundary; every command result must be parsed as JSON and re-typed on ce-automation's side.
- **Negative**: ce-automation must track api-integrator's CLI command surface and JSON shapes; version drift between the two projects can break commands silently.
- **Mitigation**: integration tests run ce-automation commands against api-integrator's real CLI (see `docs/testing.md`); `docs/features.md` records the delegated command table.

## Alternatives considered

- Option 2 rejected: api-integrator's lifecycle work (registration domain, content-plan seam, term calc, dual Forms auth setup) is production quality and already in use; superseding it would discard working code and force a rebuild of the Composio auth configs.
- Option 3 rejected: source imports couple the two projects' `tsconfig.json` settings (api-integrator uses `allowImportingTsExtensions`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`); ce-automation would inherit constraints it doesn't need. Also blocks the "invoke api-integrator from a different working directory" use case.

## References

- api-integrator `README.md` §Goals
- api-integrator `src/cli.ts` (command dispatcher pattern)
- ADR-0002 (invocation mechanism)
- ADR-0004 (per-op responsibility split)
