import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import type { CommandMap } from "../lib/command.ts";
import {
  checkGwsAuth,
  hasGwsClient,
  readGwsAuthStatus,
  GwsClientError,
  type AuthStatus,
} from "../lib/gws-auth.ts";

const DEFAULT_SCOPES = "drive,gmail,sheets,forms";

export const commands = {
  "auth:gws": {
    description:
      "Authenticate the gws CLI end-to-end (pre-checks OAuth client, opens browser for consent, verifies). Run once per machine.",
    source: "Google Workspace CLI (gws auth login + gws auth status)",
    run: async (args: string[]) => {
      const { values } = parseArgs({
        args,
        options: {
          scopes: { type: "string", default: DEFAULT_SCOPES },
        },
      });
      const scopes = values["scopes"] ?? DEFAULT_SCOPES;

      const preStatus = await readGwsAuthStatus();
      if (!hasGwsClient(preStatus)) {
        throw new GwsClientError();
      }

      const alreadyAuthed =
        preStatus.auth_method === "oauth" && preStatus.storage !== "none";
      let skippedLogin = false;
      if (alreadyAuthed) {
        skippedLogin = true;
      } else {
        const loginExit = await runInteractive("gws", [
          "auth",
          "login",
          "-s",
          scopes,
        ]);
        if (loginExit !== 0) {
          throw new Error(`gws auth login exited ${loginExit}`);
        }
      }

      const status: AuthStatus = skippedLogin
        ? preStatus
        : await checkGwsAuth();
      return {
        authenticated: true,
        authMethod: status.auth_method,
        credentialSource: status.credential_source,
        scopes,
        loginSkipped: skippedLogin,
      };
    },
  },
} as const satisfies CommandMap;

function runInteractive(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", (err) => reject(err));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
