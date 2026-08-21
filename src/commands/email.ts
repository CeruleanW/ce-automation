import { parseArgs } from "node:util";
import type { CommandMap } from "../lib/command.ts";
import { runApiIntegrator } from "../lib/shell.ts";
import { createEmail } from "../orchestrators/email-create.ts";
import { now } from "../config.ts";

export const commands = {
  "email:create": {
    description:
      "Render an announcement email for a course (pass --id <recordId>)",
    source: "Airtable CE Class base + inline template",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: { id: { type: "string" } },
      });
      const id = values["id"];
      if (!id) throw new Error("Missing required --id <recordId>");
      return createEmail(id, { runApiIntegrator, now });
    },
  },
} as const satisfies CommandMap;
