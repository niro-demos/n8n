const { NODE_ENV } = process.env;

export const inTest = NODE_ENV === 'test';
export const inProduction = NODE_ENV === 'production';
export const inDevelopment = !NODE_ENV || NODE_ENV === 'development';

/**
 * Whether the process should apply login/MFA rate limiting
 * (`controller.registry.ts`).
 *
 * Unlike `inProduction`, this does NOT require NODE_ENV to be explicitly set
 * to 'production' in order to be secure — it defaults to hardened (limiting
 * on) for any NODE_ENV value except an explicit, intentional opt-out:
 * `development` (set by n8n's own dev scripts, e.g. `packages/cli/nodemon.json`)
 * or `test` (set by the test runner — many integration tests deliberately
 * exercise repeated failed-attempt flows against the same in-memory limiter
 * and would otherwise 429). This matters because NODE_ENV=production is only
 * ever set by the official Docker image (`docker/images/n8n/Dockerfile`) —
 * a self-hosted instance started any other way (npm global install, systemd,
 * PM2, source build) leaves NODE_ENV unset, and under `inProduction` alone
 * that silently disabled rate limiting.
 */
export const enforceSecureDefaults = NODE_ENV !== 'development' && NODE_ENV !== 'test';

/**
 * Whether a caught error's stack trace may be attached to an API error
 * response body (`response-helper.ts`). True only for an explicit local-dev
 * opt-in (`NODE_ENV=development`, set by n8n's own dev scripts) — never
 * simply because NODE_ENV is unset, which is the common self-hosted posture
 * outside the official Docker image, and never during automated test runs
 * (`NODE_ENV=test`), where a full server stack trace must not leak into a
 * response body either. Unlike `enforceSecureDefaults`, this stays hardened
 * during tests too since there's no equivalent need to relax it there.
 */
export const exposeStackTraceInErrorResponse = NODE_ENV === 'development';
