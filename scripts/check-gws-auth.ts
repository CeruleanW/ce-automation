/**
 * Standalone pre-flight gate (`pnpm check:gws`). Thin wrapper over
 * {@link checkGwsAuth} from `src/lib/gws-auth.ts` — the real logic lives
 * there so the `email:send` orchestrator can run the same check inline.
 * Exits non-zero with remediation hints when gws is unauthenticated.
 *
 * See `docs/gws-authentication.md`.
 */
import { checkGwsAuth, GwsAuthError } from "../src/lib/gws-auth.ts";

try {
  const status = await checkGwsAuth();
  console.log(
    `gws authenticated (auth_method=${status.auth_method}, credential_source=${status.credential_source})`,
  );
  process.exitCode = 0;
} catch (err) {
  if (err instanceof GwsAuthError) {
    console.error(err.message);
  } else {
    console.error(String(err));
  }
  process.exitCode = 1;
}
