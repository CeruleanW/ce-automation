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
    throw new ApiIntegratorError(cmd, args, exitCode ?? -1, stderr.trim());
  }

  return parseStdout(cmd, stdout);
}

function parseStdout(cmd: string, stdout: string): unknown {
  // Collect every position where a JSON document could start.
  const positions: number[] = [];
  for (let i = 0; i < stdout.length; i++) {
    const ch = stdout[i];
    if (ch === "{" || ch === "[") {
      positions.push(i);
    }
  }

  // Try parsing from each candidate, last to first. api-integrator's CLI may
  // emit debug output (e.g. a Composio connection object printed via
  // console.log) before the actual JSON.stringify(result) payload; the real
  // result is typically the last valid JSON document in stdout.
  for (let i = positions.length - 1; i >= 0; i--) {
    const start = positions[i];
    if (start === undefined) continue;
    const trimmed = stdout.slice(start).trimEnd();
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      continue;
    }
  }

  throw new ApiIntegratorParseError(cmd, stdout.slice(-2048));
}
