import { commands as coursesCommands } from "./commands/courses.ts";
import { commands as registrationCommands } from "./commands/registration.ts";
import { commands as termCommands } from "./commands/term.ts";
import { commands as primitivesCommands } from "./commands/primitives.ts";
import { commands as emailCommands } from "./commands/email.ts";
import { commands as authCommands } from "./commands/auth.ts";
import { commands as supabaseCommands } from "./commands/supabase.ts";
import { commands as websiteCommands } from "./commands/website.ts";
import { commands as feedbackCommands } from "./commands/feedback.ts";
import type { CommandMap } from "./lib/command.ts";

const commands: CommandMap = {
  ...coursesCommands,
  ...registrationCommands,
  ...termCommands,
  ...primitivesCommands,
  ...emailCommands,
  ...authCommands,
  ...supabaseCommands,
  ...websiteCommands,
  ...feedbackCommands,
};

function printHelp(): void {
  console.log("Usage: pnpm ce <command> [options]\n");
  console.log("Commands:");
  const maxLen = Math.max(...Object.keys(commands).map((k) => k.length));
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(maxLen + 2)}${cmd.description}`);
  }
}

export async function main(argv: string[]): Promise<number> {
  const [commandName, ...rest] = argv;

  if (!commandName || commandName === "--help" || commandName === "-h") {
    printHelp();
    return 0;
  }

  const command = commands[commandName];
  if (!command) {
    console.error(`Unknown command: ${commandName}\n`);
    printHelp();
    return 1;
  }

  try {
    const result = await command.run(rest);
    if (result !== undefined) {
      if (command.source) {
        console.log(`Source: ${command.source}`);
      }
      console.log(JSON.stringify(result, null, 2));
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }
}
