import type { Response } from 'express';
import { mock } from 'vitest-mock-extended';

// The mocked booleans below represent what `@n8n/backend-common`'s flags
// actually compute to for a given NODE_ENV, independent of which flag
// `response-helper.ts` currently consults for the stacktrace decision — so
// this test is a faithful red (on the pre-fix code, which read `inDevelopment`)
// -> green (on the fixed code, which reads `exposeStackTraceInErrorResponse`)
// transition, rather than one coupled to the implementation's internal flag name.
const state = vi.hoisted(() => ({ inDevelopment: true, exposeStackTraceInErrorResponse: false }));

vi.mock('@n8n/backend-common', async () => {
	const actual = await vi.importActual<typeof import('@n8n/backend-common')>('@n8n/backend-common');
	return {
		...actual,
		get inDevelopment() {
			return state.inDevelopment;
		},
		get exposeStackTraceInErrorResponse() {
			return state.exposeStackTraceInErrorResponse;
		},
	};
});

import { sendErrorResponse } from '@/response-helper';

describe('sendErrorResponse stacktrace exposure', () => {
	let mockResponse: Response;

	beforeEach(() => {
		mockResponse = mock<Response>({
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
		});
	});

	// Invariant under test (TC-0E914ACE): the auth API must never reveal internal
	// server file paths / stack traces to an unauthenticated caller on a deployment
	// where NODE_ENV was never set to 'production' — the common case for any
	// self-hosted instance not started from the official Docker image. `inDevelopment:
	// true` is what a real unset-NODE_ENV process computed before this fix (causing
	// the leak); `exposeStackTraceInErrorResponse: false` is what it computes after.
	it('does not include a stacktrace field on the unset-NODE_ENV deployment posture', () => {
		state.inDevelopment = true;
		state.exposeStackTraceInErrorResponse = false;

		const error = new Error('Wrong username or password. Do you have caps lock on?');
		sendErrorResponse(mockResponse, error);

		expect(mockResponse.status).toHaveBeenCalledWith(500);
		const body = vi.mocked(mockResponse.json).mock.calls[0][0] as Record<string, unknown>;
		expect(body).not.toHaveProperty('stacktrace');
	});

	// Preserves the local dev workflow: an explicit NODE_ENV=development opt-in
	// (wired up by n8n's own dev scripts, e.g. packages/cli/nodemon.json) computes
	// `inDevelopment: true` / `exposeStackTraceInErrorResponse: true` both before
	// and after this fix, and must still surface a readable stack trace.
	it('still includes a stacktrace when running under the explicit local-dev opt-in', () => {
		state.inDevelopment = true;
		state.exposeStackTraceInErrorResponse = true;

		const error = new Error('Some internal error');
		sendErrorResponse(mockResponse, error);

		const body = vi.mocked(mockResponse.json).mock.calls[0][0] as Record<string, unknown>;
		expect(body.stacktrace).toBe(error.stack);
	});
});
