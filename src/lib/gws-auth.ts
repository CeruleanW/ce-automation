/**
 * Pre-flight gate and login helper for any ce-automation path that shells
 * out to the gws binary (Op 5 email send, `gws:exec` passthroughs). `gws
 * auth status` exits 0 even when unauthenticated, so the JSON fields — not
 * the exit code — decide the result. See `docs/gws-authentication.md`.
 *
 * {@link readGwsAuthStatus} spawns `gws auth status` and always resolves
 * with the parsed JSON (rejects only on spawn/parse failure). {@link checkGwsAuth}
 * wraps it with the authenticated-state assertion used by the email:send
 * gate and the `check:gws` script. The `auth:gws` command uses both to
 * pre-check the OAuth client, run `gws auth login`, then verify.
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
  client_config?: string;
  client_config_exists?: boolean;
}

export class GwsAuthError extends Error {
  constructor(detail: string) {
    super(`${detail}\n${REMEDIATION}`);
    this.name = "GwsAuthError";
  }
}

export class GwsClientError extends Error {
  constructor() {
    super(
      [
        "No OAuth client configured for gws. Provide one via any of:",
        "  - gws auth setup                        (requires gcloud; creates a GCP project + OAuth client)",
        "  - save client_secret.json to ~/.config/gws/",
        "  - set GOOGLE_WORKSPACE_CLI_CLIENT_ID + GOOGLE_WORKSPACE_CLI_CLIENT_SECRET env vars",
        "Then re-run: pnpm ce auth:gws",
        "See docs/gws-authentication.md.",
      ].join("\n"),
    );
    this.name = "GwsClientError";
  }
}

/**
 * Spawn `gws auth status` and resolve with the parsed {@link AuthStatus}.
 * Rejects with {@link GwsAuthError} only when the gws binary is missing or
 * the stdout is not valid JSON — never for an unauthenticated state (that
 * is a valid status, just not a passing one).
 */
export function readGwsAuthStatus(): Promise<AuthStatus> {
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
      try {
        resolve(JSON.parse(stdout) as AuthStatus);
      } catch {
        reject(
          new GwsAuthError(
            `gws auth status returned unparseable output:\n${stdout.slice(0, 500)}`,
          ),
        );
      }
    });
  });
}

/**
 * Pre-flight gate: resolve when gws is authenticated
 * (`auth_method === "oauth"` and `storage !== "none"`), reject with
 * {@link GwsAuthError} (carrying remediation hints) otherwise. Orchestrators
 * receive this via {@link RunnerConfig.checkGwsAuth} so unit tests inject a
 * mock and never spawn a real process.
 */
export async function checkGwsAuth(): Promise<AuthStatus> {
  const status = await readGwsAuthStatus();
  if (status.storage === "none" || status.auth_method !== "oauth") {
    throw new GwsAuthError(
      `gws auth status: auth_method=${status.auth_method ?? "?"} storage=${status.storage ?? "?"} credential_source=${status.credential_source ?? "?"}`,
    );
  }
  return status;
}

/**
 * True when an OAuth client is available to gws (file on disk, env vars,
 * or a prior `gws auth setup`). When false, `gws auth login` will fail with
 * `401: No OAuth client configured.` — so `auth:gws` pre-checks this and
 * surfaces {@link GwsClientError} instead of letting login fail opaquely.
 */
export function hasGwsClient(status: AuthStatus): boolean {
  if (status.client_config_exists === true) return true;
  if (
    process.env["GOOGLE_WORKSPACE_CLI_CLIENT_ID"] &&
    process.env["GOOGLE_WORKSPACE_CLI_CLIENT_SECRET"]
  ) {
    return true;
  }
  return false;
}
