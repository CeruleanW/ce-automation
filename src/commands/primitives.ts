import { parseArgs } from "node:util";
import type { CommandMap } from "../lib/command.ts";
import {
  currentTermFolderName,
  nextTermFolderName,
} from "../lib/clock.ts";
import { runApiIntegrator } from "../lib/shell.ts";

export const commands = {
  "drive:find-folder": {
    description:
      "Find a Google Drive folder by name (pass --name <folderName>)",
    source: "Google Drive (folder search)",
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
  "drive:current-term-folder": {
    description: "Find the Google Drive folder for the current term",
    source: "Google Drive (current term folder search)",
    run: async () => {
      const name = currentTermFolderName();
      const result = await runApiIntegrator("drive:find-folder", [
        "--name",
        name,
      ]);
      return { name, result };
    },
  },
  "drive:next-term-folder": {
    description: "Find the Google Drive folder for the next term",
    source: "Google Drive (next term folder search)",
    run: async () => {
      const name = nextTermFolderName();
      const result = await runApiIntegrator("drive:find-folder", [
        "--name",
        name,
      ]);
      return { name, result };
    },
  },
  "drive:duplicate": {
    description: "Duplicate a Drive file (pass --file-id <id>)",
    source: "Google Drive (file duplicate)",
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
    source: "Composio Google Forms auth",
    run: async () => runApiIntegrator("forms:auth"),
  },
  "forms:status": {
    description: "Show Google Forms Composio connection status (read-only)",
    source: "Composio Google Forms connection",
    run: async () => runApiIntegrator("forms:status"),
  },
  "gws:exec": {
    description: "Run a raw gws CLI command (pass remaining args)",
    source: "Google Workspace CLI",
    run: async (args: string[]) => {
      if (args.length === 0)
        throw new Error("Provide the gws command as arguments");
      return runApiIntegrator("gws:exec", args);
    },
  },
  "obsidian:exec": {
    description: "Run a raw Obsidian CLI command (pass remaining args)",
    source: "Obsidian CLI",
    run: async (args: string[]) => {
      if (args.length === 0)
        throw new Error("Provide the Obsidian command as arguments");
      return runApiIntegrator("obsidian:exec", args);
    },
  },
} as const satisfies CommandMap;
