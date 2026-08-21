# ADR-0005: Email recipients for `ce email:send`

- Status: Accepted
- Date: 2026-08-20
- Decider: CE admin
- Supersedes: none (fills a gap left open by ADR-0004 Op 5)

## Context

`ce email:send` (Op 5) composes an announcement email from a course's Airtable record (re-using the `createEmail()` renderer from Op 4) and sends it via api-integrator's `gws:exec gmail messages send ...` primitive. The send step needs a recipient list.

The README that scopes the publishing lifecycle says only:

> 5. Send email
>    1. Tuesday before the promotion date, i.e. Tuesday + 2 weeks prior to the course start day
>    2. send to

— i.e. "send to" is left unspecified. The Airtable `CeClassFields` schema (api-integrator `features/airtable/schema.ts`) has no `email-recipients` field. There is no existing recipient source.

The mechanism must:

- Provide a default recipient list so the CE admin can run `ce email:send --id <id>` without passing recipients every time.
- Allow per-invocation override (different recipients for a specific course).
- Avoid requiring an Airtable schema change or api-integrator change for the first cut.
- Keep email addresses out of git (PII).

## Decision

Resolve recipients as follows:

1. **Default**: read `CE_EMAIL_RECIPIENTS` from the environment. The value is a comma-separated list of email addresses, e.g. `CE_EMAIL_RECIPIENTS=admin@church.example,newsletter@church.example`.
2. **Override**: `ce email:send --id <recordId> --to <addr1,addr2,...>` (optional). When set, `--to` overrides the env var for that invocation only.
3. **Failure**: if neither `--to` nor `CE_EMAIL_RECIPIENTS` is set, the orchestrator throws a clear error before calling `gws:exec` — never silently sends to nobody, never silently sends to a hardcoded address.

The orchestrator splits the resolved string on `,`, trims whitespace, drops empty tokens, and passes the resulting array as `--to` args to `runApiIntegrator('gws:exec', ['gmail', 'messages', 'send', '--to', ...addrList, ...])`. The exact gws subcommand shape is delegated to api-integrator's `features/gws/mail-message.ts` (RFC 2822 MIME composer + `gmail messages send`).

No Airtable schema change. Per-course recipient overrides (via an `email-recipients` field on `CeClassRecord`) are deferred to a future ADR if the CE admin finds the global default + `--to` flag insufficient.

## Consequences

- **Positive**: works today with no api-integrator change and no Airtable base change; the CE admin sets `CE_EMAIL_RECIPIENTS` once in `.env` and runs `ce email:send` per course.
- **Positive**: `--to` flag covers one-off overrides (e.g. a course with a different audience) without touching `.env`.
- **Positive**: explicit failure when recipients are missing — no silent no-op, no silent send to a stale address.
- **Negative**: `CE_EMAIL_RECIPIENTS` holds PII emails. Mitigation: `.env` is gitignored (`.gitignore` line 2); the CE admin must not commit it.
- **Negative**: global default is not per-course. For 95% of CE courses the recipient list is the same (the congregation newsletter list); for the rest, `--to` covers it. If per-course becomes common, escalate to the Airtable-field ADR.
- **Negative**: the orchestrator cannot validate that the addresses are well-formed or that the gws Gmail account can send to them. Validation deferred to gws (the send will fail with a gws error if an address is invalid).

## Alternatives considered

- **Airtable `email-recipients` field on `CeClassRecord`**: most flexible — per-course recipient list lives with the course data. Rejected for first cut: requires api-integrator `CeClassFields` schema update, Airtable base change, and a UI change for the CE admin to edit the field. Defer until the global default proves insufficient.
- **Obsidian note per course or per term**: recipients stored in Obsidian notes, fetched via `obsidian:exec`. Rejected: adds an Obsidian round-trip to every send; recipients are configuration, not course content.
- **Config file `recipients.json`**: a JSON file mapping course ids (or term names) to recipient lists. Rejected: another file to maintain; env var + `--to` covers the same surface with less ceremony.
- **Hardcoded constant in `src/orchestrators/email-send.ts`**: rejected immediately — secrets in source, no per-invocation override, can't ship.

## Implementation

When Op 5 ships:

- Add `CE_EMAIL_RECIPIENTS=` to `.env.example`.
- Add `CE_EMAIL_RECIPIENTS` to `docs/architecture.md` §Env var contract (own env vars table).
- `src/config.ts` gains `getEmailRecipients(): string[]` — reads `process.env.CE_EMAIL_RECIPIENTS`, splits on `,`, trims, drops empties.
- `src/orchestrators/email-send.ts` resolves recipients as `--to` flag value (if present) → `getEmailRecipients()` → throw `MissingRecipientsError`.
- `src/commands/email.ts` adds `email:send` with `--id` (required) + `--to` (optional) + `--force` (optional, bypasses timing-rule check per `docs/workflows.md` Op 5).
- `docs/features.md` `ce email:send` entry updated with the resolved args + return shape.
- `docs/workflows.md` Op 5 status flips from `roadmap` to `implemented`.

## References

- `docs/workflows.md` §Op 5 — Send email
- `docs/features.md` `ce email:send --id <recordId>`
- ADR-0004 Op 5 row (roadmap → will flip to implemented when Op 5 ships)
- api-integrator `src/features/gws/mail-message.ts` (RFC 2822 MIME composer)
- api-integrator `README.md` §Publishing Operations Op 5 ("send to" gap)
