// `environment.ts` computes its exported flags once, from `process.env.NODE_ENV`,
// at module-load time. To exercise every NODE_ENV value we reset the module
// registry and re-import between assertions rather than relying on a single
// import evaluated at file-load time.
async function loadEnvironment() {
	vi.resetModules();
	return await import('../environment.js');
}

describe('environment', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		if (originalNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}
		vi.resetModules();
	});

	describe('enforceSecureDefaults (login/MFA rate limiting)', () => {
		// Invariant under test (TC-F008D4D2's root cause): rate limiting must
		// default to the SECURE behavior for any deployment posture except an
		// explicit, intentional opt-out — never silently fail open just because
		// an operator didn't set NODE_ENV=production. NODE_ENV=production is only
		// ever set by the official Docker image; a self-hosted instance started
		// any other way (npm global install, systemd, PM2, source build) leaves
		// NODE_ENV unset.
		it('defaults to hardened (true) when NODE_ENV is unset', async () => {
			delete process.env.NODE_ENV;

			const { enforceSecureDefaults } = await loadEnvironment();

			expect(enforceSecureDefaults).toBe(true);
		});

		it('defaults to hardened (true) when NODE_ENV is "production"', async () => {
			process.env.NODE_ENV = 'production';

			const { enforceSecureDefaults } = await loadEnvironment();

			expect(enforceSecureDefaults).toBe(true);
		});

		it('defaults to hardened (true) for an arbitrary/unrecognized NODE_ENV value', async () => {
			process.env.NODE_ENV = 'staging';

			const { enforceSecureDefaults } = await loadEnvironment();

			expect(enforceSecureDefaults).toBe(true);
		});

		it('relaxes (false) only for the explicit local-dev opt-out, NODE_ENV=development', async () => {
			process.env.NODE_ENV = 'development';

			const { enforceSecureDefaults } = await loadEnvironment();

			expect(enforceSecureDefaults).toBe(false);
		});

		it('relaxes (false) for the test runner, NODE_ENV=test', async () => {
			process.env.NODE_ENV = 'test';

			const { enforceSecureDefaults } = await loadEnvironment();

			expect(enforceSecureDefaults).toBe(false);
		});
	});

	describe('exposeStackTraceInErrorResponse (API error response bodies)', () => {
		// Invariant under test (TC-0E914ACE's root cause): a stack trace must
		// never reach an API error response body just because NODE_ENV is unset —
		// only an explicit local-dev opt-in (NODE_ENV=development) allows it.
		// Unlike `enforceSecureDefaults`, this stays hardened during automated
		// test runs too (NODE_ENV=test) — there's no equivalent need to relax it.
		it('defaults to hardened (false) when NODE_ENV is unset', async () => {
			delete process.env.NODE_ENV;

			const { exposeStackTraceInErrorResponse } = await loadEnvironment();

			expect(exposeStackTraceInErrorResponse).toBe(false);
		});

		it('defaults to hardened (false) when NODE_ENV is "production"', async () => {
			process.env.NODE_ENV = 'production';

			const { exposeStackTraceInErrorResponse } = await loadEnvironment();

			expect(exposeStackTraceInErrorResponse).toBe(false);
		});

		it('stays hardened (false) for the test runner, NODE_ENV=test', async () => {
			process.env.NODE_ENV = 'test';

			const { exposeStackTraceInErrorResponse } = await loadEnvironment();

			expect(exposeStackTraceInErrorResponse).toBe(false);
		});

		it('relaxes (true) only for the explicit local-dev opt-in, NODE_ENV=development', async () => {
			process.env.NODE_ENV = 'development';

			const { exposeStackTraceInErrorResponse } = await loadEnvironment();

			expect(exposeStackTraceInErrorResponse).toBe(true);
		});
	});
});
