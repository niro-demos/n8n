// The mocked booleans below represent what `@n8n/backend-common`'s flags
// actually compute to when NODE_ENV is unset — the common case for any
// self-hosted n8n instance not started from the official Docker image (the
// only place that sets NODE_ENV=production). `inProduction: false` is what
// the pre-fix gate read (silently disabling rate limiting); `enforceSecureDefaults:
// true` is what the fixed gate reads (enabling it by default). Mocking both
// together makes this a faithful red -> green test across the fix, rather than
// one coupled to the implementation's internal flag name.
const state = vi.hoisted(() => ({ inProduction: false, enforceSecureDefaults: true }));

vi.mock('@n8n/backend-common', async () => {
	const actual = await vi.importActual<typeof import('@n8n/backend-common')>('@n8n/backend-common');
	return {
		...actual,
		get inProduction() {
			return state.inProduction;
		},
		get enforceSecureDefaults() {
			return state.enforceSecureDefaults;
		},
	};
});

import { Get, RestController, ControllerRegistryMetadata } from '@n8n/decorators';
import type { GlobalConfig } from '@n8n/config';
import { Container } from '@n8n/di';
import express, { json } from 'express';
import request from 'supertest';
import { mock } from 'vitest-mock-extended';

import type { AuthService } from '@/auth/auth.service';
import { ControllerRegistry } from '@/controller.registry';
import type { License } from '@/license';
import type { LastActiveAtService } from '@/services/last-active-at.service';
import { RateLimitService } from '@/services/rate-limit.service';

describe('ControllerRegistry IP-based rate limiting on the unset-NODE_ENV deployment posture', () => {
	const license = mock<License>();
	const authService = mock<AuthService>();
	const globalConfig = mock<GlobalConfig>({ endpoints: { rest: 'rest' } });
	const metadata = Container.get(ControllerRegistryMetadata);
	const lastActiveAtService = mock<LastActiveAtService>();
	const authMiddleware = vi.fn().mockImplementation(async (_req, _res, next) => next());
	let app: express.Express;

	@RestController('/security-defaults-test')
	// @ts-expect-error tsc complains about unused class
	class TestController {
		@Get('/login-like', { ipRateLimit: { limit: 5, windowMs: 60_000 } })
		loginLike() {
			return { ok: true };
		}
	}

	beforeEach(() => {
		vi.resetAllMocks();
		state.inProduction = false;
		state.enforceSecureDefaults = true;

		app = express();
		app.use(json());
		authMiddleware.mockImplementation(async (_req, _res, next) => next());
		authService.createAuthMiddleware.mockImplementation(() => authMiddleware);
		lastActiveAtService.middleware.mockImplementation(async (_req, _res, next) => next());

		new ControllerRegistry(
			license,
			authService,
			globalConfig,
			metadata,
			lastActiveAtService,
			new RateLimitService(),
		).activate(app);
	});

	// Invariant under test (TC-F008D4D2): repeated failed sign-in attempts must be
	// throttled even when the process was never told NODE_ENV=production — the
	// default posture for self-hosted deployments outside the official Docker image.
	it('rate-limits a login-like endpoint by default, without requiring NODE_ENV=production', async () => {
		for (let i = 0; i < 5; i++) {
			await request(app).get('/rest/security-defaults-test/login-like').expect(200);
		}

		await request(app).get('/rest/security-defaults-test/login-like').expect(429);
	});
});
