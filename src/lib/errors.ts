export class ApiIntegratorError extends Error {
  public readonly cmd: string;
  public readonly args: string[];
  public readonly exitCode: number;
  public readonly stderr: string;
  public readonly stdout: string;

  constructor(
    cmd: string,
    args: string[],
    exitCode: number,
    stderr: string,
    stdout = "",
  ) {
    const parts = [stderr.trim(), stdout.trim()].filter(Boolean);
    const body = parts.join(" | ") || "(no output)";
    const trimmed = body.length > 2000 ? `…${body.slice(-2000)}` : body;
    super(`${cmd} exited ${exitCode}:\n${trimmed}`);
    this.name = "ApiIntegratorError";
    this.cmd = cmd;
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
    this.stdout = stdout;
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

/**
 * Thrown by the email-send orchestrator (Op 5) when neither `--to` nor
 * `CE_EMAIL_RECIPIENTS` resolves any address. Never silently sends to
 * nobody, never silently sends to a hardcoded address. Per ADR-0005.
 */
export class MissingRecipientsError extends Error {
  constructor() {
    super(
      "No email recipients: pass --to <addr1,addr2,...> or set CE_EMAIL_RECIPIENTS in .env",
    );
    this.name = "MissingRecipientsError";
  }
}

/**
 * Thrown by the email-send orchestrator (Op 5) when the course record has
 * no `start-date`, so the send deadline cannot be computed. Per
 * `docs/workflows.md` Op 5 timing rule.
 */
export class MissingStartDateError extends Error {
  public readonly recordId: string;

  constructor(recordId: string) {
    super(
      `Course ${recordId} has no start-date; cannot compute email send deadline`,
    );
    this.name = "MissingStartDateError";
    this.recordId = recordId;
  }
}
