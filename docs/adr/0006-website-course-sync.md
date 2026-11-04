# ADR-0006: Sync website courses through Supabase

- Status: Accepted
- Date: 2026-11-01
- Decider: CE admin

## Context

The Church Education website at `/ai-projects/church-eduction-website` reads its course data from Supabase. api-integrator already provides `supabase:course:sync-airtable`, which validates an Airtable record and creates or updates the corresponding website course and term row.

## Decision

`ce website:update --id <recordId>` syncs both website records:

- The course delegates to api-integrator's `supabase:course:sync-airtable --id <recordId>`. The Airtable course's own `term` and `year` determine the destination term; no current-calendar-term ensure is needed. Matching uses `(term_id, title)`, and ambiguous matches fail safely.
- The news row is upserted through `supabase:news:upsert`. Its title comes from the Airtable course title, content reuses the announcement email body, date comes from Airtable `start-date`, and `form_link` comes from `form-link`. A deterministic UUID derived from the Airtable record ID makes this idempotent without a database schema migration.

## Consequences

- The website's Supabase courses and news are updated without a separate website deployment.
- The operation requires a ready Airtable course and the api-integrator Airtable and Supabase credentials.
- Course mapping remains owned by api-integrator; news presentation content is rendered by ce-automation's shared announcement template.

## References

- `docs/workflows.md` — Op 3
- `docs/features.md` — `ce website:update`
- api-integrator `src/domains/course-sync.ts`
