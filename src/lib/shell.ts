import { spawn } from "node:child_process";
import { getIntegratorDir } from "../config.ts";
import { ApiIntegratorError, ApiIntegratorParseError } from "./errors.ts";

export interface RunnerConfig {
  runApiIntegrator: (cmd: string, args?: string[]) => Promise<unknown>;
  now: () => Date;
}

export async function runApiIntegrator(
  cmd: string,
  args: string[] = [],
): Promise<unknown> {
  const integratorDir = getIntegratorDir();
  const child = spawn("pnpm", ["--dir", integratorDir, "cli", cmd, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("exit", (code: number | null) => resolve(code));
    child.on("error", (err: Error) => {
      stderr += err.message;
      resolve(1);
    });
  });

  if (exitCode !== 0) {
    const lastLine = stderr.trim().split("\n").pop() ?? "";
    throw new ApiIntegratorError(cmd, args, exitCode ?? -1, lastLine);
  }

  return parseStdout(cmd, stdout);
}

function parseStdout(cmd: string, stdout: string): unknown {
  // Strip leading non-JSON bytes (pnpm banners, run-prefix lines).
  const start = stdout.search(/[{[]/);
  if (start === -1) {
    throw new ApiIntegratorParseError(cmd, stdout.slice(-2048));
  }
  const trimmed = stdout.slice(start).trimEnd();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new ApiIntegratorParseError(cmd, trimmed.slice(-2048));
  }
}
