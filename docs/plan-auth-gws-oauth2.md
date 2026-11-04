# Plan: Preserve Existing gws OAuth2 Sessions

## Goal

Prevent `ce auth:gws` from opening an unnecessary browser-login flow when `gws auth status` reports a valid `oauth2` session.

## Steps

1. Update `src/commands/auth.ts` so the already-authenticated check accepts the valid OAuth method reported by the installed gws CLI (`oauth2`) when `storage` is not `none`.
2. Add a unit test for `auth:gws` that supplies an `oauth2` authenticated status and verifies that interactive login is not spawned and `loginSkipped` is `true`.
3. Keep the existing post-login `checkGwsAuth` verification intact for statuses that require login.
4. Update `docs/features.md` and `docs/setup.md` to describe `oauth2` as the already-authenticated status value once the implementation is corrected.
5. Run `pnpm test:vitest --run`, `pnpm typecheck`, and `pnpm format:check`.

## Acceptance Criteria

- A status with `auth_method: "oauth2"` and `storage` other than `none` does not invoke `gws auth login`.
- `ce auth:gws` returns `loginSkipped: true` for that status.
- Unauthenticated or unusable statuses still invoke login and retain the current post-login validation.
- Documentation and tests reflect the corrected behavior.
