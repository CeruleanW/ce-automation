import { parseArgs } from "node:util";
import type { CommandMap } from "../lib/command.ts";
import { runApiIntegrator } from "../lib/shell.ts";
import { createEmail } from "../orchestrators/email-create.ts";
import { sendEmail } from "../orchestrators/email-send.ts";
import { isDryRun, now } from "../config.ts";

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
  "email:send": {
    description:
      "Send the announcement email for a course (pass --id <recordId>; optional --to <addr1,addr2,...> and --force)",
    source: "Airtable CE Class base + gws Gmail send (Op 5, per ADR-0005)",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: {
          id: { type: "string" },
          to: { type: "string" },
          force: { type: "boolean", default: false },
        },
      });
      const id = values["id"];
      if (!id) throw new Error("Missing required --id <recordId>");
      const to = values["to"];
      return sendEmail(
        id,
        { runApiIntegrator, now },
        {
          ...(to !== undefined && { to }),
          force: values["force"] === true,
          dryRun: isDryRun(),
        },
      );
    },
  },
} as const satisfies CommandMap;
