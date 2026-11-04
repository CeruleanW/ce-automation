import { parseArgs } from "node:util";
import type { CommandMap } from "../lib/command.ts";
import { runApiIntegrator } from "../lib/shell.ts";

export const commands = {
  "feedback:publish": {
    description:
      "Create a feedback form for a course (pass --id <recordId> --yes)",
    source: "Airtable + Google Drive + Google Forms (feedback form publish)",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: {
          id: { type: "string" },
          yes: { type: "boolean", default: false },
        },
      });
      const id = values["id"];
      if (!id) throw new Error("Missing required --id <recordId>");
      if (!values.yes) {
        throw new Error(
          "Creating a Google Form makes external changes; rerun with --yes after reviewing the course.",
        );
      }
      return runApiIntegrator("feedback:publish", ["--id", id, "--yes"]);
    },
  },
} as const satisfies CommandMap;
