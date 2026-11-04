import { parseArgs } from "node:util";
import type { CommandMap } from "../lib/command.ts";
import { runApiIntegrator } from "../lib/shell.ts";
import { updateWebsite } from "../orchestrators/website-update.ts";

export const commands = {
  "website:update": {
    description: "Sync a ready course to the website (pass --id <recordId>)",
    source: "Airtable → website Supabase course and news sync",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: { id: { type: "string" } },
      });
      const id = values["id"];
      if (!id) throw new Error("Missing required --id <recordId>");
      return updateWebsite(id, { runApiIntegrator });
    },
  },
} as const satisfies CommandMap;
