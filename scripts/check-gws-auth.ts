/**
 * Pre-flight gate for automated ce-automation runs that depend on the gws
 * binary (Op 5 email send, gws:exec passthroughs). Parses `gws auth status`
 * JSON — the command exits 0 even when unauthenticated, so the JSON fields,
 * not the exit code, decide the result. See docs/gws-authentication.md.
 */
import { spawn } from "node:child_process";

const REMEDIATION = [
  "gws is not authenticated. Fix with:",
  "  1. Provide an OAuth client: gws auth setup, or save client_secret.json",
  "     to ~/.config/gws/, or set GOOGLE_WORKSPACE_CLI_CLIENT_ID/SECRET.",
  "  2. Run: gws auth login -s drive,gmail,sheets,forms   (opens browser)",
  "Headless/CI alternative: set GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE to a",
  "credentials JSON provisioned via `gws auth export` on a browser machine.",
  "See docs/gws-authentication.md.",
].join("\n");

interface AuthStatus {
  auth_method?: string;
  credential_source?: string;
  storage?: string;
}

function main(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("gws", ["auth", "status"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => {
      console.error("gws binary not found. Install: npm install -g @googleworkspace/cli");
      resolve(1);
    });
    child.on("exit", () => {
      let status: AuthStatus;
      try {
        status = JSON.parse(stdout) as AuthStatus;
      } catch {
        console.error(`gws auth status returned unparseable output:\n${stdout.slice(0, 500)}`);
        resolve(1);
        return;
      }
      if (status.storage === "none" || status.auth_method !== "oauth") {
        console.error(
          `gws auth status: auth_method=${status.auth_method ?? "?"} storage=${status.storage ?? "?"} credential_source=${status.credential_source ?? "?"}`,
        );
        console.error(REMEDIATION);
        resolve(1);
        return;
      }
      console.log(
        `gws authenticated (auth_method=${status.auth_method}, credential_source=${status.credential_source})`,
      );
      resolve(0);
    });
  });
}

process.exitCode = await main();
