export interface Command {
  description: string;
  run: (args: string[]) => Promise<unknown>;
}

export type CommandMap = Record<string, Command>;
