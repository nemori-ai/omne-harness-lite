import type {
  LoopExtensionRunnerService,
  RunnerActionRequest,
  RunnerActionResult,
  RunnerAnyDispatchRequest,
  RunnerDispatchRequest,
  RunnerPassResult,
} from '@omne-harness-lite/loop-extension-runner'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

/** Private application closure. A delivery obligation conveys no Run or model-retry authority. */
export function createToolMaintenanceRunner(input: {
  readonly scope: SessionScope
  readonly runner: LoopExtensionRunnerService
  readonly within: <T>(scope: SessionScope, task: () => Promise<T>) => Promise<T>
}): LoopExtensionRunnerService {
  function dispatch(request: RunnerDispatchRequest, signal: AbortSignal): Promise<RunnerPassResult>
  function dispatch(request: RunnerActionRequest, signal: AbortSignal): Promise<RunnerActionResult>
  async function dispatch(
    request: RunnerAnyDispatchRequest,
    signal: AbortSignal,
  ): Promise<RunnerPassResult | RunnerActionResult> {
    if (request.manifest !== input.scope.session || request.position === 'before_action')
      return { failure: 'unavailable' }
    if (
      !(request.position === 'after_action' && request.dimension.scope === 'each') &&
      !(request.position === 'before_persist_message' && request.subject.producer === 'tool')
    )
      return { failure: 'unavailable' }
    return input.within(input.scope, () => input.runner.dispatch(request, signal))
  }
  return Object.freeze({ dispatch, replay: async () => ({ failure: 'unavailable' as const }) })
}
