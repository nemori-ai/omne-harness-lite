import type {
  ModelPoolInstance,
  ModelExecutionRequest,
  PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
declare const pool: ModelPoolInstance
declare const request: ModelExecutionRequest<PlannedSemantics, object>
const started = pool.execute(request)
if ('invocation' in started) {
  const stopped: Promise<void> = started.invocation.stopped
  started.invocation.abort()
  void stopped
}
// @ts-expect-error The execution pool has no Session recovery inputs.
pool.recovery
// @ts-expect-error The execution pool does not resolve credentials.
pool.credentials
// @ts-expect-error The execution pool does not select or own transport registry entries.
pool.transport
// @ts-expect-error Physical observation cannot enter a Session.
pool.executionSource.enter
