// The four faces of one created runtime. Every public operation passes the access guard first. The
// operation bodies are not implemented yet: after `allowed` each answers a named `unavailable` that
// names the #502 stage that brings it. That is a stage-temporary answer, never a success or a
// made-up result. `observe` is the exception: the runtime is idle, so it shows that state.
import type {
  AgentAccessOperation,
  AgentAccessTarget,
  AgentExecutionId,
  AgentInstanceId,
  AgentObservation,
  Failure,
} from '@omne-harness/agent-contract'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { AccessGuard } from './access.ts'
import type { AgentProvider } from './construction.ts'

const OWNER = '@omne-harness/agent'

/** The #502 stage that implements each operation body; see the parent card "阶段与子任务". */
type Stage = 1 | 5

/**
 * Stage-temporary (#502): the answer of an operation whose body does not exist yet. It says what is
 * missing; it is not a contract failure of the operation.
 */
function notImplemented(operation: AgentAccessOperation, stage: Stage): Failure {
  return {
    kind: 'unavailable',
    owner: OWNER,
    diagnostic: `${operation} is not implemented until #502 stage ${stage}`,
  }
}

/**
 * The ended reason of an observation whose guard failed. 待拥有者: `AgentObservation` has no reason
 * for `invalid` (an Access without tenant), so that case ends as `denied`, fail closed, until the
 * contract owner names a channel. Any other failure ends as `unavailable`.
 */
function endedReason(failure: Failure): Extract<AgentObservation, { kind: 'ended' }>['reason'] {
  switch (failure.kind) {
    case 'denied':
    case 'invalid':
      return 'denied'
    default:
      return 'unavailable'
  }
}

/** Resolves when the signal aborts. A live observation waits here for the reader to close it. */
function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

export function createProvider<P>(
  instance: AgentInstanceId,
  guard: AccessGuard<P>,
): AgentProvider<P> {
  const onInstance: AgentAccessTarget = { kind: 'instance', instance }
  const onExecution = (execution: AgentExecutionId): AgentAccessTarget => ({
    kind: 'execution',
    instance,
    execution,
  })

  /** The guard, then the stage-temporary body. */
  async function guarded(
    input: Parameters<AccessGuard<P>>[0],
    operation: AgentAccessOperation,
    target: AgentAccessTarget,
    stage: Stage,
  ): Promise<Outcome<never, Failure>> {
    const passed = await guard(input, operation, target)
    if ('failure' in passed) return passed
    return fail(notImplemented(operation, stage))
  }

  /**
   * The state projection of this instance. Nothing can leave idle before invoke exists (#502 stage
   * 1), so one idle projection is the whole live state; the sequence ends `closed` when the signal
   * aborts. The generator yields on demand and keeps no buffer, so observerBufferBytes has nothing
   * to bound yet.
   */
  async function* observe(
    input: Parameters<AgentProvider<P>['observation']['observe']>[0],
  ): AsyncGenerator<AgentObservation, void, undefined> {
    const passed = await guard(input, 'observe', onInstance)
    if ('failure' in passed) {
      yield { kind: 'ended', reason: endedReason(passed.failure) }
      return
    }
    if (!input.signal.aborted) {
      yield { kind: 'state', value: { kind: 'idle', instance } }
      await aborted(input.signal)
    }
    yield { kind: 'ended', reason: 'closed' }
  }

  return {
    runtime: {
      instance,
      invoke: input => guarded(input, 'invoke', onInstance, 1),
      resume: input => guarded(input, 'resume', onExecution(input.execution), 5),
    },
    observation: { instance, observe },
    recovery: {
      query: input => guarded(input, 'query', onExecution(input.execution), 5),
      load: input => guarded(input, 'load', onExecution(input.execution), 5),
      reconcile: input => guarded(input, 'reconcile', onExecution(input.execution), 5),
      detach: input => guarded(input, 'detach', onExecution(input.execution), 5),
    },
    control: {
      quiesce: input => guarded(input, 'quiesce', onInstance, 5),
    },
  }
}
