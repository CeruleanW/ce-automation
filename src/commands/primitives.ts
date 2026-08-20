import { parseArgs } from "node:util";
import type { CommandMap } from "../lib/command.ts";
import { runApiIntegrator } from "../lib/shell.ts";

export const commands = {
  "drive:find-folder": {
    description:
      "Find a Google Drive folder by name (pass --name <folderName>)",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: { name: { type: "string" } },
      });
      const name = values["name"];
      if (!name) throw new Error("Missing required --name <folderName>");
      return runApiIntegrator("drive:find-folder", ["--name", name]);
    },
  },
  "drive:duplicate": {
    description: "Duplicate a Drive file (pass --file-id <id>)",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: { "file-id": { type: "string" } },
      });
      const fileId = values["file-id"];
      if (!fileId) throw new Error("Missing required --file-id <id>");
      return runApiIntegrator("drive:duplicate", ["--file-id", fileId]);
    },
  },
  "forms:auth": {
    description:
      "Authenticate the Google Forms Composio connection (opens browser for OAuth)",
    run: async () => runApiIntegrator("forms:auth"),
  },
  "forms:status": {
    description: "Show Google Forms Composio connection status (read-only)",
    run: async () => runApiIntegrator("forms:status"),
  },
  "gws:exec": {
    description: "Run a raw gws CLI command (pass remaining args)",
    run: async (args: string[]) => {
      if (args.length === 0)
        throw new Error("Provide the gws command as arguments");
      return runApiIntegrator("gws:exec", args);
    },
  },
  "obsidian:exec": {
    description: "Run a raw Obsidian CLI command (pass remaining args)",
    run: async (args: string[]) => {
      if (args.length === 0)
        throw new Error("Provide the Obsidian command as arguments");
      return runApiIntegrator("obsidian:exec", args);
    },
  },
} as const satisfies CommandMap;
