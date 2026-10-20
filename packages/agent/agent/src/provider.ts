// The four faces of one created runtime. Every public operation passes the access guard first.
// `invoke` runs the normal path of the Loop (#502 1.2): it reserves the one execution slot, resolves
// the evaluator of the bound definition, admits the input and opens the execution, returns the
// handle, and leaves the Loop to run on until the runtime is idle again. `observe` shows the state of
// the instance as it changes. The other bodies are not implemented yet: after `allowed` each answers
// a named `unavailable` that names the #502 stage that brings it. That is a stage-temporary answer,
// never a success or a made-up result.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Access,
  AgentAccessOperation,
  AgentAccessTarget,
  AgentExecutionHandle,
  AgentExecutionId,
  AgentInstanceId,
  AgentObservation,
  AgentState,
  EventPage,
  Failure,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AccessGuard } from './access.ts'
import type { AgentDependencies, AgentProvider, AgentRuntimeBinding } from './construction.ts'
import { createExecutionCoordinator, type Halted } from './loop/coordinator.ts'

const OWNER = '@omne-harness/agent'

/** The #502 stage that implements each operation body; see the parent card "阶段与子任务". */
type Stage = '1.3' | 'stage 3' | 'stage 5'

/**
 * Stage-temporary (#502): the answer of an operation whose body does not exist yet. It says what is
 * missing; it is not a contract failure of the operation.
 */
function notImplemented(operation: string, stage: Stage): Failure {
  return {
    kind: 'unavailable',
    owner: OWNER,
    diagnostic: `${operation} is not implemented until #502 ${stage}`,
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

/** Resolves when the signal aborts or `wake` is called, whichever comes first. */
function woken(signal: AbortSignal, listeners: Set<() => void>): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const done = () => {
      signal.removeEventListener('abort', done)
      listeners.delete(done)
      resolve()
    }
    listeners.add(done)
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * The one execution slot. `reserved` holds it from invoke until `open` has answered; `occupied`
 * holds it until E9. A run that stopped keeps the slot: its execution is neither ended nor handed
 * over, so the runtime does not claim to be idle (see `halted`).
 */
type Slot =
  | Readonly<{ kind: 'free' }>
  | Readonly<{ kind: 'reserved'; execution: AgentExecutionId }>
  | Readonly<{ kind: 'occupied'; execution: AgentExecutionId; halted: Halted | null }>

export type ProviderEntry<P, B extends ContentBlock> = Readonly<{
  binding: AgentRuntimeBinding
  guard: AccessGuard<P>
  dependencies: AgentDependencies<P, B>
}>

export function createProvider<P, B extends ContentBlock>(
  entry: ProviderEntry<P, B>,
): AgentProvider<P> {
  const { binding, guard, dependencies } = entry
  const instance: AgentInstanceId = binding.instance
  const onInstance: AgentAccessTarget = { kind: 'instance', instance }
  const onExecution = (execution: AgentExecutionId): AgentAccessTarget => ({
    kind: 'execution',
    instance,
    execution,
  })

  let slot: Slot = { kind: 'free' }
  let current: AgentState = { kind: 'idle', instance }
  const listeners = new Set<() => void>()

  /** A new state of the instance: the observations wake and the registration handle is told. */
  function report(state: AgentState): void {
    current = state
    // A woken observation removes itself; a Set iteration skips nothing when that happens.
    for (const wake of listeners) wake()
    dependencies.registration?.report({ state })
  }

  /** The guard, then the stage-temporary body. */
  async function guarded(
    input: Access<P>,
    operation: AgentAccessOperation,
    target: AgentAccessTarget,
    stage: Stage,
  ): Promise<Outcome<never, Failure>> {
    const passed = await guard(input, operation, target)
    if ('failure' in passed) return passed
    return fail(notImplemented(operation, stage))
  }

  /**
   * The state projection of this instance, as it changes. It keeps no buffer: a slow reader sees
   * the latest state, not every one in between, so observerBufferBytes has nothing to bound yet.
   * The sequence ends `closed` when the signal aborts.
   */
  async function* observe(
    input: Parameters<AgentProvider<P>['observation']['observe']>[0],
  ): AsyncGenerator<AgentObservation, void, undefined> {
    const passed = await guard(input, 'observe', onInstance)
    if ('failure' in passed) {
      yield { kind: 'ended', reason: endedReason(passed.failure) }
      return
    }
    let shown: AgentState | null = null
    while (!input.signal.aborted) {
      if (shown !== current) {
        shown = current
        yield { kind: 'state', value: current }
        continue
      }
      await woken(input.signal, listeners)
    }
    yield { kind: 'ended', reason: 'closed' }
  }

  /** The handle of one execution. Reading its events is guarded like every public operation. */
  function handleOf(execution: AgentExecutionId): AgentExecutionHandle<P> {
    const target = onExecution(execution)
    const foreign: Failure = {
      kind: 'invalid',
      field: 'execution',
      reason: 'not the execution of this handle',
    }
    return {
      execution,
      input: {
        submit: input => guarded(input, 'submit', target, 'stage 5'),
      },
      control: {
        control: input => guarded(input, 'control', target, 'stage 5'),
      },
      output: {
        async read(input) {
          const passed = await guard(input, 'read', target)
          if ('failure' in passed) return passed
          if (input.execution !== execution) return fail(foreign)
          return dependencies.journal.output.read(input)
        },
        async *events(input): AsyncGenerator<Outcome<EventPage, Failure>, void, undefined> {
          const passed = await guard(input, 'events', target)
          if ('failure' in passed) {
            yield passed
            return
          }
          if (input.execution !== execution) {
            yield fail(foreign)
            return
          }
          yield* dependencies.journal.output.events(input)
        },
        acknowledge: input => guarded(input, 'acknowledge', target, 'stage 5'),
      },
    }
  }

  const invoke: AgentProvider<P>['runtime']['invoke'] = async input => {
    const passed = await guard(input, 'invoke', onInstance)
    if ('failure' in passed) return passed
    // A concurrent invoke answers busy in #502 1.3; until then it is refused, never queued.
    if (slot.kind !== 'free') return fail(notImplemented('a second concurrent invoke', '1.3'))
    const { execution } = input
    slot = { kind: 'reserved', execution }
    const release = () => {
      slot = { kind: 'free' }
    }
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const resolved = await dependencies.adoptions.resolve({
      ...access,
      adoption: binding.definition,
    })
    if ('failure' in resolved) {
      release()
      return resolved
    }
    // E3, P0, M4 and F2 pass through without extensions; running one is #502 stage 3.
    if (resolved.ok.extensions.length > 0) {
      release()
      return fail(notImplemented('an adopted loop extension', 'stage 3'))
    }
    const coordinator = createExecutionCoordinator({
      ports: dependencies,
      binding,
      evaluator: resolved.ok.evaluator,
      access,
      execution,
      operation: input.operation,
      initial: input.initial,
      grant: input.grant,
      idle: () => {
        release()
        report({ kind: 'idle', instance })
      },
    })
    const accepted = await coordinator.accept()
    if ('failure' in accepted) {
      // SPEC "受理与单执行槽": an unknown receipt keeps the reservation; only an `open` that surely
      // did not commit gives the slot back. Finding the original operation is R0 (#502 1.9).
      if (accepted.failure.failure.kind !== 'commit-unknown') release()
      return fail(accepted.failure.failure)
    }
    slot = { kind: 'occupied', execution, halted: null }
    report({
      kind: 'occupied',
      instance,
      execution,
      executionAttachment: accepted.ok.executionAttachment,
    })
    // SPEC "创建、登记与复用": invoke waits for the reliable acceptance only, not for the Loop. A run
    // that stops keeps the slot occupied with the place and reason of the stop.
    void coordinator.runExecution().then(ran => {
      if ('failure' in ran) slot = { kind: 'occupied', execution, halted: ran.failure }
    })
    return succeed(handleOf(execution))
  }

  return {
    runtime: {
      instance,
      invoke,
      resume: input => guarded(input, 'resume', onExecution(input.execution), 'stage 5'),
    },
    observation: { instance, observe },
    recovery: {
      query: input => guarded(input, 'query', onExecution(input.execution), 'stage 5'),
      load: input => guarded(input, 'load', onExecution(input.execution), 'stage 5'),
      reconcile: input => guarded(input, 'reconcile', onExecution(input.execution), 'stage 5'),
      detach: input => guarded(input, 'detach', onExecution(input.execution), 'stage 5'),
    },
    control: {
      quiesce: input => guarded(input, 'quiesce', onInstance, 'stage 5'),
    },
  }
}
