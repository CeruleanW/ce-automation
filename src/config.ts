import process from "node:process";

const DEFAULT_INTEGRATOR_DIR = "/ai-projects/api-integrator";

export function getIntegratorDir(): string {
  return process.env["API_INTEGRATOR_DIR"] || DEFAULT_INTEGRATOR_DIR;
}

export function isDryRun(): boolean {
  return process.env["CE_DRY_RUN"] === "true";
}

export function getNowOverride(): Date | undefined {
  const v = process.env["CE_NOW_OVERRIDE"];
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function now(): Date {
  return getNowOverride() ?? new Date();
}

/**
 * Split a comma-separated recipient string into a clean address list:
 * split on `,`, trim whitespace, drop empty tokens. Used by both
 * `getEmailRecipients()` (env default) and the `--to` flag override path
 * in the email-send orchestrator (per ADR-0005).
 */
export function parseRecipientList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Default recipient list for `ce email:send` (Op 5) from
 * `CE_EMAIL_RECIPIENTS` in the environment. Per ADR-0005.
 */
export function getEmailRecipients(): string[] {
  return parseRecipientList(process.env["CE_EMAIL_RECIPIENTS"] ?? "");
}
