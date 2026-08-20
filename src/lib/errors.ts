export class ApiIntegratorError extends Error {
  public readonly cmd: string;
  public readonly args: string[];
  public readonly exitCode: number;
  public readonly stderr: string;

  constructor(cmd: string, args: string[], exitCode: number, stderr: string) {
    super(`${cmd} exited ${exitCode}: ${stderr}`);
    this.name = "ApiIntegratorError";
    this.cmd = cmd;
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export class ApiIntegratorParseError extends Error {
  public readonly cmd: string;
  public readonly stdoutTail: string;

  constructor(cmd: string, stdoutTail: string) {
    super(`${cmd} returned unparseable output: ...${stdoutTail}`);
    this.name = "ApiIntegratorParseError";
    this.cmd = cmd;
    this.stdoutTail = stdoutTail;
  }
}

export class BlockedOpError extends Error {
  public readonly command: string;
  public readonly adr: string;

  constructor(command: string, adr: string) {
    super(`${command} is blocked — see ${adr}`);
    this.name = "BlockedOpError";
    this.command = command;
    this.adr = adr;
  }
}
