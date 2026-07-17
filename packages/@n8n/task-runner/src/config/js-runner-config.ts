import { Config, Env } from '@n8n/config';

@Config
export class JsRunnerConfig {
	@Env('NODE_FUNCTION_ALLOW_BUILTIN')
	allowedBuiltInModules: string = '';

	@Env('NODE_FUNCTION_ALLOW_EXTERNAL')
	allowedExternalModules: string = '';

	@Env('N8N_RUNNERS_INSECURE_MODE')
	insecureMode: boolean = false;

	/**
	 * Wall-clock ceiling in seconds on the *synchronous* portion of a single
	 * Code node execution, enforced via V8's own vm timeout
	 * (`vm.runInContext`'s `timeout` option). That timeout can interrupt
	 * non-yielding synchronous code (e.g. `while (true) {}`) outright via
	 * V8's `TerminateExecution`, independent of whether the runner process is
	 * otherwise responsive - so it bounds how long one tenant's CPU-bound
	 * script can occupy the runner's single execution thread, ahead of and
	 * independent of the broker's (much slower) heartbeat-based liveness
	 * check tearing down the whole runner process.
	 *
	 * This is distinct from `N8N_RUNNERS_TASK_TIMEOUT`, which bounds the full
	 * task including any awaited I/O (e.g. HTTP requests made from the Code
	 * node) and is left unchanged, so legitimate long-running async Code node
	 * executions aren't disrupted. The lower of the two values always
	 * applies. Must be greater than 0.
	 */
	@Env('N8N_RUNNERS_MAX_SYNC_EXECUTION_TIMEOUT')
	maxSyncExecutionTimeout: number = 10;
}
