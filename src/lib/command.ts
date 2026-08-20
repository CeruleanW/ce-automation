export interface Command {
  description: string;
  source?: string;
  run: (args: string[]) => Promise<unknown>;
}

export type CommandMap = Record<string, Command>;
