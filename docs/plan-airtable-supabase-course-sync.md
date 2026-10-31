# Plan: Automate Airtable-to-Supabase Course Sync

## Goal

Reliably sync ready Airtable CE Class records for the upcoming term into the
matching Supabase `term` and `course` rows. Preserve the current one-record
command while adding safe batch discovery and a path to unattended execution.

## Current behavior

`pnpm ce supabase:course:sync-airtable --id <recordId>` fetches one Airtable
record, checks its ready flag, creates or finds its term, then inserts or updates
the Supabase course. It currently matches existing courses by `(term_id,
title)`.

## Plan

### 1. Add a durable Airtable identity to Supabase courses

1. Add nullable `airtable_record_id` to `public.course` and a unique partial
   index for non-null values. Update `docs/supabase/schema.md` and the
   `CourseRow`/`CourseInsert` types.
2. Before applying the constraint, inspect existing rows and backfill the
   Airtable ID only where a `(term_id, title)` match is unambiguous. Resolve
   ambiguous legacy matches manually; do not guess.
3. Change sync matching to use `airtable_record_id`. Keep title and term as
   ordinary mutable fields so Airtable edits update the same Supabase row.
4. For a legacy row with no source ID, retain the current safe fallback: adopt
   exactly one matching `(term_id, title)` row, fail on multiple matches, and
   attach the Airtable ID during the update.

### 2. Enforce that a synced record belongs to the next term

1. Derive the next term's canonical Supabase term row from the current date
   using the shared season/month ranges.
2. Compare the Airtable record's `year` and `term` with that expected term
   before any Supabase write. Reject records for other terms with an error
   showing the expected and actual term.
3. Keep the existing mapping from Airtable `title` and full description
   (falling back to short/news description) to the course row.

### 3. Make term creation safe to repeat and concurrent

1. Check for duplicate `term.name` values in Supabase and resolve them before
   adding a unique constraint on `public.term.name`.
2. Change term resolution to use an atomic insert/upsert on `name`; if the
   upsert's conflict behavior returns no row, fetch the row by name.
3. Verify repeated and concurrent sync attempts resolve to the same term ID.

### 4. Add ready-course batch discovery

1. Add `pnpm ce supabase:course:sync-ready` to fetch ready Airtable records for
   the upcoming term and invoke the existing one-record sync sequentially.
2. Reuse the existing Airtable connection and ready-record query functions;
   avoid creating a second Airtable integration path.
3. Return per-record `created`/`updated` results and collect failures while
   continuing through the batch. Exit nonzero and summarize failures at the
   end so partial completion is visible and safe to retry.
4. Keep the one-record command available for targeted retries and diagnosis.

### 5. Add isolated integration coverage

1. Use only the dedicated Airtable test base/table and a non-production
   Supabase project for integration tests.
2. Cover ready-record discovery, next-term rejection, term resolution,
   first-time insert, repeat sync/update by Airtable ID, and batch retry after a
   per-record failure.
3. Assert test setup fails fast if configured IDs point at production.
4. Keep unit tests for mapping, readiness, identity matching, and batch failure
   handling deterministic with mocked services.

### 6. Decide unattended scheduling separately

The repository does not currently define a deployment host or scheduler. First
ship and operate `sync-ready` as an explicit command. Once the CE admin chooses
where automation should run, add a scheduled invocation (or Airtable event
trigger) with documented credentials, logs, retry policy, and duplicate-run
protection. Do not add a scheduler before that runtime decision is made.

## Dependencies and order

1. Schema migration and identity backfill (Step 1).
2. Term uniqueness and atomic resolution (Step 3); required before concurrent
   batch operation.
3. Next-term validation (Step 2).
4. Batch discovery and reporting (Step 4).
5. Isolated integration coverage (Step 5).
6. Scheduler only after deployment target is selected (Step 6).

## Acceptance criteria

- A ready Airtable record for the upcoming term creates exactly one associated
  Supabase course and term.
- Re-running after Airtable title/description edits updates the same course
  row, identified by Airtable record ID.
- Non-ready records and records for a different term are rejected before any
  Supabase write.
- Concurrent runs cannot create duplicate term or course rows.
- Batch sync discovers eligible ready records, reports each outcome, and can
  be rerun safely after partial failure.
- Automated integration tests use disposable test services and never write to
  production.
- Unattended scheduling has a separately documented host, trigger, and
  operational retry/monitoring behavior before it is enabled.
