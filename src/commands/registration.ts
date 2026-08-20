import { parseArgs } from "node:util";
import type { CommandMap } from "../lib/command.ts";
import { runApiIntegrator } from "../lib/shell.ts";

export const commands = {
  "registration:publish-all": {
    description:
      "Publish registration forms for all ready, unpublished CE Class records",
    source:
      "Airtable + Google Drive + Google Forms (registration publish, all)",
    run: async () => {
      await runApiIntegrator("registration:publish-all");
      return undefined;
    },
  },
  "registration:publish": {
    description:
      "Publish registration form for a single record (pass --id <recordId>)",
    source:
      "Airtable + Google Drive + Google Forms (registration publish, single)",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: { id: { type: "string" } },
      });
      const id = values["id"];
      if (!id) throw new Error("Missing required --id <recordId>");
      return runApiIntegrator("registration:publish", ["--id", id]);
    },
  },
} as const satisfies CommandMap;
