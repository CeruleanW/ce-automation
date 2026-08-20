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
