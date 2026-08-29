import { spawn } from "node:child_process";
import { getIntegratorDir } from "../config.ts";
import { ApiIntegratorError, ApiIntegratorParseError } from "./errors.ts";
import type { AuthStatus } from "./gws-auth.ts";

export interface RunnerConfig {
  runApiIntegrator: (cmd: string, args?: string[]) => Promise<unknown>;
  now: () => Date;
  /**
   * Pre-flight gws auth gate. Orchestrators that call `gws:exec` invoke
   * this before the real send so a missing-login failure surfaces with
   * remediation hints instead of a confusing 401. The real implementation
   * (spawns `gws auth status`) is supplied by the command layer; unit
   * tests inject a mock. See `docs/gws-authentication.md`.
   */
  checkGwsAuth: () => Promise<AuthStatus>;
}

export async function runApiIntegrator(
  cmd: string,
  args: string[] = [],
): Promise<unknown> {
  const integratorDir = getIntegratorDir();
  // Run `pnpm run cli` with cwd set to the integrator dir (equivalent to
  // `cd $API_INTEGRATOR_DIR && pnpm run cli ...`). Explicit `run` avoids
  // pnpm's implicit command/exec fallback: with a bare `pnpm cli`, a
  // checkout that predates api-integrator's `cli` script fails with the
  // cryptic ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL instead of "Missing script".
  // (The earlier `pnpm --dir <path>` form also broke on pnpm 11, which
  // exec'd the directory path itself — EACCES.)
  const child = spawn("pnpm", ["run", "cli", cmd, ...args], {
    cwd: integratorDir,
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
    throw new ApiIntegratorError(cmd, args, exitCode ?? -1, stderr, stdout);
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
