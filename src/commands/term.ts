import type { CommandMap } from "../lib/command.ts";
import { runApiIntegrator } from "../lib/shell.ts";

export const commands = {
  "term:ensure": {
    description:
      "Insert the current term into the Supabase term table if it does not exist",
    run: async () => runApiIntegrator("supabase:ensure-current-term"),
  },
} as const satisfies CommandMap;
