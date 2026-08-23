/**
 * Pre-flight gate for any ce-automation path that shells out to the gws
 * binary (Op 5 email send, `gws:exec` passthroughs). `gws auth status`
 * exits 0 even when unauthenticated, so the JSON fields — not the exit
 * code — decide the result. See `docs/gws-authentication.md`.
 *
 * The {@link checkGwsAuth} function is the real implementation (spawns the
 * gws binary); orchestrators receive it via {@link RunnerConfig.checkGwsAuth}
 * so unit tests inject a mock and never spawn a real process.
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

export interface AuthStatus {
  auth_method?: string;
  credential_source?: string;
  storage?: string;
}

export class GwsAuthError extends Error {
  constructor(detail: string) {
    super(`${detail}\n${REMEDIATION}`);
    this.name = "GwsAuthError";
  }
}

/**
 * Spawn `gws auth status`, parse the JSON, and resolve when gws is
 * authenticated (`auth_method === "oauth"` and `storage !== "none"`).
 * Rejects with {@link GwsAuthError} (carrying remediation hints) when the
 * binary is missing, the output is unparseable, or gws is not authenticated.
 * Resolves with the parsed {@link AuthStatus} so callers (e.g. the
 * `check:gws` script) can print the credential source on success.
 */
export function checkGwsAuth(): Promise<AuthStatus> {
  return new Promise((resolve, reject) => {
    const child = spawn("gws", ["auth", "status"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => {
      reject(
        new GwsAuthError(
          "gws binary not found. Install: npm install -g @googleworkspace/cli",
        ),
      );
    });
    child.on("exit", () => {
      let status: AuthStatus;
      try {
        status = JSON.parse(stdout) as AuthStatus;
      } catch {
        reject(
          new GwsAuthError(
            `gws auth status returned unparseable output:\n${stdout.slice(0, 500)}`,
          ),
        );
        return;
      }
      if (status.storage === "none" || status.auth_method !== "oauth") {
        reject(
          new GwsAuthError(
            `gws auth status: auth_method=${status.auth_method ?? "?"} storage=${status.storage ?? "?"} credential_source=${status.credential_source ?? "?"}`,
          ),
        );
        return;
      }
      resolve(status);
    });
  });
}
