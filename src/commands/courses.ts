import { parseArgs } from "node:util";
import type { CommandMap } from "../lib/command.ts";
import { runApiIntegrator } from "../lib/shell.ts";

export const commands = {
  "courses:ready": {
    description: "List ready CE course records (ready-to-be-process=true)",
    source: "Airtable CE Class base (ready courses)",
    run: async () => runApiIntegrator("airtable:ready-courses"),
  },
  "courses:to-be-published": {
    description:
      "List ready AND unpublished CE course records (form-link blank)",
    source: "Airtable CE Class base (ready & unpublished)",
    run: async () => runApiIntegrator("airtable:to-be-published"),
  },
  "courses:fetch": {
    description:
      "Fetch a single course record by Airtable id (pass --id <recordId>)",
    source: "Airtable CE Class base (single record)",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: { id: { type: "string" } },
      });
      const id = values["id"];
      if (!id) throw new Error("Missing required --id <recordId>");
      return runApiIntegrator("airtable:fetch-record", ["--id", id]);
    },
  },
  "courses:list": {
    description: "List all CE course records (--titles to show only titles)",
    source: "Airtable CE Class base (all records)",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: { titles: { type: "boolean", default: false } },
      });
      return values.titles
        ? runApiIntegrator("airtable:fetch-all", ["--titles"])
        : runApiIntegrator("airtable:fetch-all");
    },
  },
} as const satisfies CommandMap;
