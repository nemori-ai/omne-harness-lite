// The four faces of one created runtime. Every public operation passes the access guard first.
// `invoke` admits the input and opens the execution (U0 to E0, #502 1.3): it reserves the one
// execution slot, resolves the evaluator of the bound definition, returns the handle at E1, and
// leaves the Loop to run on until the runtime is idle again. `observe` shows the state of the
// instance as it changes. The other bodies are not implemented yet: after `allowed` each answers a
// named `unavailable` that names the #502 stage that brings it. That is a stage-temporary answer,
// never a success or a made-up result.
//
// The slot and the observed state never disagree: `observe` shows the state that `stateOf` derives
// from the slot, and every slot change goes through `occupy`. A run that stopped keeps the slot
// occupied, and the next invoke answers busy (S-14 of #558). The
// registration handle only receives a projection: a report that throws is dropped, because `report`
// returns void and the contract gives its failure no channel (待拥有者); the slot and `observe` stay
// authoritative.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Access,
  AgentAccessOperation,
  AgentAccessTarget,
  AgentExecutionHandle,
  AgentExecutionId,
  AgentInstanceId,
  AgentObservation,
  AgentOperationId,
  AgentState,
  EventPage,
  ExecutionAttachmentId,
  Failure,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AccessGuard } from './access.ts'
import type {
  AgentConfiguration,
  AgentDependencies,
  AgentProvider,
  AgentRuntimeBinding,
} from './construction.ts'
import { canonical } from './canonical.ts'
import { createExecutionCoordinator } from './loop/coordinator.ts'

const OWNER = '@omne-harness/agent'

/** The #502 stage that implements each operation body; see the parent card "阶段与子任务". */
type Stage = 'stage 3' | 'stage 5' | 'unassigned'

/**
 * Stage-temporary (#502): the answer of an operation whose body does not exist yet. It says what is
 * missing; it is not a contract failure of the operation. `unassigned`: the stage table of #502
 * names no stage for it yet.
 */
function notImplemented(operation: string, stage: Stage): Failure {
  return {
    kind: 'unavailable',
    owner: OWNER,
    diagnostic:
      stage === 'unassigned'
        ? `${operation} is not implemented yet; #502 assigns it no stage`
        : `${operation} is not implemented until #502 ${stage}`,
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
 * The one execution slot (SPEC "受理与单执行槽"). `reserved`: an invoke holds it until `open` has
 * answered. When `open` answered commit-unknown, `unresolved` is the R0 item: the operation whose
 * `open` nobody knows yet, and the reservation stays until a retry of that operation finds it with
 * `query`. `running`: the Loop runs until E9 frees the slot. A run that stopped still holds it.
 */
type Slot =
  | Readonly<{ kind: 'free' }>
  | Readonly<{
      kind: 'reserved'
      execution: AgentExecutionId
      unresolved: AgentOperationId | null
    }>
  | Readonly<{
      kind: 'running'
      execution: AgentExecutionId
      attachment: ExecutionAttachmentId
    }>

/** The last invoke that this runtime accepted, and the text of its input (SPEC 804). */
type Accepted = Readonly<{
  operation: AgentOperationId
  execution: AgentExecutionId
  input: string
}>

type InvokeInput<P> = Parameters<AgentProvider<P>['runtime']['invoke']>[0]

/** The input of an invoke that the same operation must repeat to get the original handle back. */
function inputText<P>(input: InvokeInput<P>): string {
  return canonical({ execution: input.execution, initial: input.initial, grant: input.grant })
}

export type ProviderEntry<P, B extends ContentBlock> = Readonly<{
  binding: AgentRuntimeBinding
  configuration: Pick<AgentConfiguration, 'reconciliationDelayMs'>
  guard: AccessGuard<P>
  dependencies: AgentDependencies<P, B>
}>

export function createProvider<P, B extends ContentBlock>(
  entry: ProviderEntry<P, B>,
): AgentProvider<P> {
  const { binding, guard, dependencies } = entry
  const instance: AgentInstanceId = binding.instance
  const onInstance: AgentAccessTarget = { kind: 'instance', instance }
  // SPEC "主体资格核验": the execution target is the logical execution alone, without the instance.
  const onExecution = (execution: AgentExecutionId): AgentAccessTarget => ({
    kind: 'execution',
    execution,
  })

  let slot: Slot = { kind: 'free' }
  let current: AgentState = { kind: 'idle', instance }
  const listeners = new Set<() => void>()

  /**
   * The state that `observe` shows for a slot: only an execution that exists (S-14 of #558). A
   * reservation, an unresolved `open` included, still shows idle.
   */
  function stateOf(held: Slot): AgentState {
    switch (held.kind) {
      case 'free':
      case 'reserved':
        return { kind: 'idle', instance }
      case 'running':
        return {
          kind: 'occupied',
          instance,
          execution: held.execution,
          executionAttachment: held.attachment,
        }
      default: {
        const _exhaustive: never = held
        return _exhaustive
      }
    }
  }

  /** The one way the slot changes: observations wake, then the registration handle is told. */
  function occupy(next: Slot): void {
    slot = next
    const state = stateOf(next)
    if (JSON.stringify(state) === JSON.stringify(current)) return
    current = state
    // A woken observation removes itself; a Set iteration skips nothing when that happens.
    for (const wake of listeners) wake()
    try {
      dependencies.registration?.report({ state })
    } catch {
      // Dropped: see the header. The slot and `observe` already hold the new state.
    }
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
        submit: input => guarded(input, 'submit', target, 'unassigned'),
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

  let accepted: Accepted | null = null

  /**
   * U0 to E1 for an invoke that holds the reservation, then the Loop in the background. SPEC
   * "创建、登记与复用": invoke waits for the reliable acceptance only, not for the Loop. A failure
   * before E1 puts the slot `back`: free for a new invoke, the R0 item again for its retry, because
   * the `open` of that item may have committed.
   */
  async function admit(
    input: InvokeInput<P>,
    back: Slot,
  ): Promise<Outcome<AgentExecutionHandle<P>, Failure>> {
    const { execution, operation } = input
    const release = () => occupy({ kind: 'free' })
    const giveBack = () => occupy(back)
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const resolved = await dependencies.adoptions.resolve({
      ...access,
      adoption: binding.definition,
    })
    if ('failure' in resolved) {
      giveBack()
      return resolved
    }
    // E3, P0, M4 and F2 pass through without extensions; running one is #502 stage 3.
    if (resolved.ok.extensions.length > 0) {
      giveBack()
      return fail(notImplemented('an adopted loop extension', 'stage 3'))
    }
    const coordinator = createExecutionCoordinator({
      ports: dependencies,
      binding,
      evaluator: resolved.ok.evaluator,
      access,
      execution,
      operation,
      initial: input.initial,
      grant: input.grant,
      idle: release,
    })
    const opened = await coordinator.accept()
    if ('failure' in opened) {
      const { node, failure } = opened.failure
      // SPEC "受理与单执行槽": only an `open` whose outcome is unknown keeps the reservation, as the
      // R0 item of this operation. A commit-unknown at Q2 comes before `open`; no execution exists,
      // so the slot is given back. Both name the operation of the invoke: retrying it is the query.
      if (failure.kind !== 'commit-unknown') {
        giveBack()
        return fail(failure)
      }
      if (node === 'E0') occupy({ kind: 'reserved', execution, unresolved: operation })
      else giveBack()
      return fail({ kind: 'commit-unknown', operation })
    }
    accepted = { operation, execution, input: inputText(input) }
    const attachment = opened.ok.executionAttachment
    occupy({ kind: 'running', execution, attachment })
    // drive catches node failures and defects. A stopped run keeps its occupied slot.
    const drive = async () => {
      const controller = new AbortController()
      try {
        for (;;) {
          await coordinator.runExecution()
          const wake = await coordinator.waitForWake({
            reconciliationDelayMs: entry.configuration.reconciliationDelayMs,
            signal: controller.signal,
          })
          if ('failure' in wake || wake.ok !== 'ready') return
        }
      } finally {
        controller.abort()
      }
    }
    void drive().catch(() => {
      // Node 24 ends the process on an unhandled rejection; discard it and keep the slot occupied.
    })
    return succeed(handleOf(execution))
  }

  /**
   * SPEC "查询的四种结论与持久拒绝": only `recordControl` can be refused durably. A `rejected`
   * conclusion for the operation of an invoke is a violation by the Journal provider: the slot is
   * neither free nor busy nor admitted, and a held reservation stays.
   */
  function rejectedOpen(operation: InvokeInput<P>['operation']): Failure {
    return {
      kind: 'unavailable',
      owner: 'agentJournal',
      diagnostic: `query answered rejected for the open operation ${operation}`,
    }
  }

  /**
   * The retry of the R0 item: `query` the original operation first. Committed: the same `open`
   * gives the original receipt back and the run goes on at E1. Excluded: the operation is admitted
   * anew under the same identity. Unknown or a failed query: the reservation stays.
   */
  async function retryUnresolved(
    input: InvokeInput<P>,
    held: Extract<Slot, { kind: 'reserved' }>,
  ): Promise<Outcome<AgentExecutionHandle<P>, Failure>> {
    occupy({ ...held, unresolved: null })
    const found = await dependencies.journal.query({
      principal: input.principal,
      tenant: input.tenant,
      execution: held.execution,
      operation: input.operation,
    })
    if ('failure' in found) {
      occupy(held)
      return found
    }
    switch (found.ok.kind) {
      case 'unknown':
        occupy(held)
        return fail({ kind: 'commit-unknown', operation: input.operation })
      case 'rejected':
        occupy(held)
        return fail(rejectedOpen(input.operation))
      case 'excluded':
        return admit(input, { kind: 'free' })
      case 'committed':
        return admit(input, held)
    }
  }

  /** A held slot cannot hide an earlier admission (SPEC 804 and mechanisms.md). */
  async function findAccepted(
    input: InvokeInput<P>,
  ): Promise<Outcome<AgentExecutionHandle<P>, Failure>> {
    const found = await dependencies.journal.query(input)
    if ('failure' in found) {
      // SPEC 61 hides absence as denied; after the access guard, this means a new invoke meets a held slot (SPEC 646).
      return found.failure.kind === 'denied' ? fail({ kind: 'busy' }) : found
    }
    switch (found.ok.kind) {
      case 'unknown':
        return fail({ kind: 'commit-unknown', operation: input.operation })
      case 'excluded':
        return fail({ kind: 'busy' })
      case 'rejected':
        return fail(rejectedOpen(input.operation))
      case 'committed':
        break
    }
    const resolved = await dependencies.adoptions.resolve({
      principal: input.principal,
      tenant: input.tenant,
      adoption: binding.definition,
    })
    if ('failure' in resolved) return resolved
    const coordinator = createExecutionCoordinator({
      ports: dependencies,
      binding,
      evaluator: resolved.ok.evaluator,
      access: { principal: input.principal, tenant: input.tenant },
      execution: input.execution,
      operation: input.operation,
      initial: input.initial,
      grant: input.grant,
      idle: () => {},
    })
    const opened = await coordinator.accept()
    if ('failure' in opened) {
      const { failure } = opened.failure
      return fail(
        failure.kind === 'commit-unknown'
          ? { kind: 'commit-unknown', operation: input.operation }
          : failure,
      )
    }
    return succeed(handleOf(input.execution))
  }

  // SPEC 804: matching operation, execution and input return the original handle.
  // This holds during the run, after a stop and after the end. SPEC 774: another input conflicts
  // while its original execution holds the slot. Otherwise the Journal checks the input.
  function answerRemembered(
    input: InvokeInput<P>,
  ): Outcome<AgentExecutionHandle<P>, Failure> | undefined {
    if (accepted?.operation !== input.operation || accepted.execution !== input.execution)
      return undefined
    if (accepted.input === inputText(input)) return succeed(handleOf(accepted.execution))
    if (slot.kind !== 'free' && slot.execution === accepted.execution)
      return fail({ kind: 'conflict', operation: input.operation })
    return undefined
  }

  const invoke: AgentProvider<P>['runtime']['invoke'] = async input => {
    const passed = await guard(input, 'invoke', onInstance)
    if ('failure' in passed) return passed
    const remembered = answerRemembered(input)
    if (remembered !== undefined) return remembered
    if (
      slot.kind === 'reserved' &&
      slot.unresolved === input.operation &&
      slot.execution === input.execution
    )
      return retryUnresolved(input, slot)
    // SPEC 646: a new invoke while the slot is held answers busy; it is never queued.
    if (slot.kind !== 'free')
      return slot.execution === input.execution ? fail({ kind: 'busy' }) : findAccepted(input)
    occupy({ kind: 'reserved', execution: input.execution, unresolved: null })
    return admit(input, { kind: 'free' })
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
