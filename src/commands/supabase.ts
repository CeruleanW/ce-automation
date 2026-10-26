import type { CommandMap } from "../lib/command.ts";
import { runApiIntegrator } from "../lib/shell.ts";

const passthrough = (command: string) => async (args: string[]) =>
  runApiIntegrator(command, args);

export const commands = {
  "supabase:course:get": {
    description: "Fetch a Supabase course by id (pass --id <uuid>)",
    source: "Supabase course table",
    run: passthrough("supabase:course:get"),
  },
  "supabase:course:list": {
    description: "List Supabase courses for a term (pass --term-id <uuid>)",
    source: "Supabase course table",
    run: passthrough("supabase:course:list"),
  },
  "supabase:course:insert": {
    description:
      "Insert a Supabase course (pass --title and optional course fields)",
    source: "Supabase course table",
    run: passthrough("supabase:course:insert"),
  },
  "supabase:course:upsert": {
    description:
      "Insert or replace a Supabase course by id (pass --title and optional course fields)",
    source: "Supabase course table",
    run: passthrough("supabase:course:upsert"),
  },
  "supabase:course:sync-airtable": {
    description:
      "Sync a ready Airtable course to Supabase (pass --id <Airtable record id>)",
    source: "Airtable → Supabase course sync",
    run: passthrough("supabase:course:sync-airtable"),
  },
  "supabase:news:get": {
    description: "Fetch a Supabase news row by id (pass --id <uuid>)",
    source: "Supabase news table",
    run: passthrough("supabase:news:get"),
  },
  "supabase:news:list": {
    description: "List Supabase news rows, newest first",
    source: "Supabase news table",
    run: passthrough("supabase:news:list"),
  },
  "supabase:news:insert": {
    description: "Insert a Supabase news row (pass --content and --date)",
    source: "Supabase news table",
    run: passthrough("supabase:news:insert"),
  },
  "supabase:news:upsert": {
    description:
      "Insert or replace a Supabase news row by id (pass --content and --date)",
    source: "Supabase news table",
    run: passthrough("supabase:news:upsert"),
  },
} as const satisfies CommandMap;
