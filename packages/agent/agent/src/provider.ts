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
  CommandReceipt,
  DurableEvidence,
  EventPage,
  ExecutionAttachmentId,
  ExecutionState,
  Failure,
  FailureCandidate,
  QuiesceResult,
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
import { maxRunStepsOf } from './configuration.ts'
import {
  createExecutionCoordinator,
  createResumedCoordinator,
  type ExecutionCoordinator,
  type ExecutionDrive,
  type ExecutionEntry,
  type Halted,
  type ResumeEntry,
} from './loop/coordinator.ts'
import { nestedInbox } from './nested-inbox.ts'
import { agentEvidence } from './loop/identities.ts'
import { reconciliationPacer } from './loop/reconciliation.ts'
import { createControlWriter, releaseForeground } from './control.ts'
import type { AgentMeasurer } from './measure.ts'
import type {
  AgentRunEndedFailedReceiver,
  AgentRunFailedReceiver,
  AgentRunWaitingReceiver,
} from './run-failure.ts'
import { submitInput } from './submit.ts'
import { askPlanned, handOverAsked, settlePlanned, type Held } from './planned-handover.ts'

const OWNER = '@omne-harness/agent'

type Stage = 'stage 3' | 'stage 5'

function notImplemented(operation: string, stage: Stage): Failure {
  return {
    kind: 'unavailable',
    owner: OWNER,
    diagnostic: `${operation} is not implemented until #502 ${stage}`,
  }
}

function endedReason(failure: Failure): Extract<AgentObservation, { kind: 'ended' }>['reason'] {
  switch (failure.kind) {
    case 'denied':
    case 'invalid':
      return 'denied'
    default:
      return 'unavailable'
  }
}

function thrownText(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error)
  } catch {
    return 'a thrown value that has no text'
  }
}

const UNENDING = new AbortController().signal

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

type Slot =
  | Readonly<{ kind: 'free' }>
  | Readonly<{
      kind: 'reserved'
      execution: AgentExecutionId
      acceptance: Readonly<{
        operation: AgentOperationId
        input: string
        coordinator: ExecutionCoordinator
      }> | null
    }>
  | Readonly<{
      kind: 'running'
      execution: AgentExecutionId
      attachment: ExecutionAttachmentId
    }>
  | Readonly<{
      kind: 'failed'
      execution: AgentExecutionId
      attachment: ExecutionAttachmentId
      node: string | null
      failure: Failure
    }>

type Accepted = Readonly<{
  operation: AgentOperationId
  execution: AgentExecutionId
  input: string
}>

type InvokeInput<P> = Parameters<AgentProvider<P>['runtime']['invoke']>[0]

type Quiescing = {
  readonly operation: AgentOperationId
  readonly reason: DurableEvidence
  readonly reasonText: string
  drained: QuiesceResult | null
  step: Promise<Outcome<QuiesceResult, Failure>> | null
}

/** `poked`: something the run must look at arrived in memory, so the next wake runs a pass. */
type Driving = Held

/** A stop an extension asked for is a control request: the same qualification check, the same write. */
function cancelCommand<P>(input: Parameters<NonNullable<ExecutionEntry<P>['requestCancel']>>[0]) {
  const { reason, ...target } = input
  return { ...target, command: { kind: 'cancel' as const, reason } }
}

function stateOf(instance: AgentInstanceId, held: Slot): AgentState {
  switch (held.kind) {
    case 'free':
      return { kind: 'idle', instance }
    case 'reserved':
      return { kind: 'reserved', instance }
    case 'running':
    case 'failed':
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

function drainingRefusal(operation: 'invoke' | 'resume'): Failure {
  return {
    kind: 'unavailable',
    owner: OWNER,
    diagnostic: `the runtime is draining after quiesce; a new ${operation} is not accepted`,
  }
}

function rejectedOpen(operation: AgentOperationId): Failure {
  return {
    kind: 'unavailable',
    owner: 'agentJournal',
    diagnostic: `query answered rejected for the open operation ${operation}`,
  }
}

function withdrawalFailure(diagnostic: string): Failure {
  return { kind: 'unavailable', owner: 'agentRegistration', diagnostic }
}

function inputText<P>(input: InvokeInput<P>): string {
  return canonical({ execution: input.execution, initial: input.initial, grant: input.grant })
}

export type ProviderEntry<P, B extends ContentBlock> = Readonly<{
  binding: AgentRuntimeBinding
  configuration: Pick<
    AgentConfiguration,
    | 'reconciliationDelaysMs'
    | 'toolConcurrency'
    | 'jointCommits'
    | 'maxRunSteps'
    | 'compactionProvider'
  >
  guard: AccessGuard<P>
  dependencies: AgentDependencies<P, B>
  measurer: AgentMeasurer
  failed: AgentRunFailedReceiver | undefined
  endedFailed: AgentRunEndedFailedReceiver | undefined
  waiting: AgentRunWaitingReceiver | undefined
}>

/** Tells the receiver of this provider that a run waits; a receiver that throws is not the run's fault. */
function waitingReport<P, B extends ContentBlock>(
  entry: ProviderEntry<P, B>,
  execution: AgentExecutionId,
): NonNullable<ResumeEntry<P>['waiting']> {
  const { tenant, instance } = entry.binding
  return (step, node, { owner, diagnostic }) => {
    try {
      entry.waiting?.({
        kind: 'run-waiting',
        tenant,
        instance,
        execution,
        step,
        node,
        owner,
        diagnostic,
      })
    } catch {}
  }
}

/** The parts of a coordinator that every execution of this provider shares. */
function coordinatorBase<P, B extends ContentBlock>(entry: ProviderEntry<P, B>) {
  return {
    ports: entry.dependencies,
    binding: entry.binding,
    jointCommits: entry.configuration.jointCommits,
    compactionProvider: entry.configuration.compactionProvider,
  }
}

/** An operation of a later stage: checked like any other, then refused as not implemented. */
function notYet<P>(guard: AccessGuard<P>) {
  return async (
    input: Access<P>,
    operation: AgentAccessOperation,
    target: AgentAccessTarget,
    stage: Stage,
  ): Promise<Outcome<never, Failure>> => {
    const passed = await guard(input, operation, target)
    if ('failure' in passed) return passed
    return fail(notImplemented(operation, stage))
  }
}

export function createProvider<P, B extends ContentBlock>(
  entry: ProviderEntry<P, B>,
): AgentProvider<P> {
  const { binding, guard, dependencies, measurer } = entry
  const instance: AgentInstanceId = binding.instance
  const onInstance: AgentAccessTarget = { kind: 'instance', instance }
  const onExecution = (execution: AgentExecutionId): AgentAccessTarget => ({
    kind: 'execution',
    execution,
  })

  const guarded = notYet(guard)
  const writeControl = createControlWriter(dependencies)
  const requestCancel: NonNullable<ExecutionEntry<P>['requestCancel']> = async input => {
    const passed = await guard(input, 'control', onExecution(input.execution))
    return 'failure' in passed ? passed : writeControl(cancelCommand(input))
  }
  let slot: Slot = { kind: 'free' }
  let driving: Driving | null = null
  const handoverAsked = () => driving !== null && driving.planned !== null
  let current: AgentState = { kind: 'idle', instance }
  const listeners = new Set<() => void>()

  let quiescing: Quiescing | null = null
  // Quiesce calls still at their access check count as draining: the runtime drains before the
  // first await of quiesce. A refused call that leaves no accepted quiesce lifts it again.
  let checking = 0
  let retired = false
  const draining = () => quiescing !== null || checking > 0

  function occupy(next: Slot): void {
    slot = next
    for (const wake of listeners) wake()
    const state = stateOf(instance, next)
    if (JSON.stringify(state) === JSON.stringify(current)) return
    current = state
    try {
      dependencies.registration?.report({ state })
    } catch {}
  }

  async function* observe(
    input: Parameters<AgentProvider<P>['observation']['observe']>[0],
  ): AsyncGenerator<AgentObservation, void, undefined> {
    const passed = await guard(input, 'observe', onInstance)
    if ('failure' in passed) {
      yield { kind: 'ended', reason: endedReason(passed.failure) }
      return
    }
    let shown: AgentState | null = null
    while (!input.signal.aborted && !retired) {
      if (shown !== current) {
        shown = current
        yield { kind: 'state', value: current }
        continue
      }
      await woken(input.signal, listeners)
    }
    yield { kind: 'ended', reason: retired ? 'retired' : 'closed' }
  }

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
        async submit(input) {
          const passed = await guard(input, 'submit', target)
          if ('failure' in passed) return passed
          if (input.execution !== execution) return fail(foreign)
          const answer = await submitInput(dependencies, input)
          if ('ok' in answer) hint(execution)
          return releaseForeground(dependencies, input, answer)
        },
      },
      control: {
        async control(input) {
          const passed = await guard(input, 'control', target)
          if ('failure' in passed) return passed
          if (input.execution !== execution) return fail(foreign)
          if (input.command.kind === 'suspend') return fail(notImplemented('suspend', 'stage 5'))
          return writeControl(input)
        },
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

  function hint(execution: AgentExecutionId): void {
    if (slot.kind === 'running' && slot.execution === execution) driving?.wait?.abort()
  }

  const nested = nestedInbox(
    execution => slot.kind === 'running' && slot.execution === execution,
    execution => (driving === null ? undefined : ((driving.poked = true), hint(execution))),
  )

  function failRun(
    execution: AgentExecutionId,
    attachment: ExecutionAttachmentId,
    node: string | null,
    failure: Failure,
  ): void {
    if (slot.kind !== 'running' || slot.execution !== execution) return
    occupy({ kind: 'failed', execution, attachment, node, failure })
    try {
      entry.failed?.({
        kind: 'run-failed',
        tenant: binding.tenant,
        instance,
        execution,
        node,
        failure,
      })
    } catch {}
  }

  function endedRun(
    execution: AgentExecutionId,
    state: Extract<ExecutionState, { kind: 'ended' }>,
    candidate: FailureCandidate | null,
  ): void {
    if (state.conclusion.kind !== 'fail') return
    try {
      entry.endedFailed?.({
        kind: 'run-ended-failed',
        tenant: binding.tenant,
        instance,
        execution,
        cause: state.conclusion.cause,
        failure:
          candidate === null
            ? null
            : {
                kind: candidate.kind,
                step: candidate.step,
                fault: candidate.kind === 'no-reply' ? (candidate.fault ?? null) : null,
              },
      })
    } catch {}
  }

  async function admit(
    input: InvokeInput<P>,
    back: Slot,
  ): Promise<Outcome<AgentExecutionHandle<P>, Failure>> {
    const { execution, operation } = input
    const release = () => occupy({ kind: 'free' })
    const giveBack = () => occupy(back)
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const adopted = await coordinatorEntry(access, execution, release)
    if ('failure' in adopted) {
      giveBack()
      return adopted
    }
    const coordinator = createExecutionCoordinator({
      ...adopted.ok,
      operation,
      initial: input.initial,
      grant: input.grant,
    })
    return acceptOriginal(input, back, coordinator)
  }

  async function coordinatorEntry(
    access: Access<P>,
    execution: AgentExecutionId,
    idle: () => void,
  ): Promise<Outcome<ResumeEntry<P>, Failure>> {
    const resolved = await dependencies.adoptions.resolve({
      ...access,
      adoption: binding.definition,
    })
    if ('failure' in resolved) return resolved
    return succeed({
      ...coordinatorBase(entry),
      evaluator: resolved.ok.evaluator,
      extensions: resolved.ok.extensions,
      requestCancel,
      access,
      execution,
      idle,
      handoverAsked,
      ended: (state, candidate) => endedRun(execution, state, candidate),
      waiting: waitingReport(entry, execution),
      toolConcurrency: entry.configuration.toolConcurrency,
      nested: { pending: () => nested.pending(execution) },
      maxRunSteps: maxRunStepsOf(entry.configuration),
    })
  }

  function startDrive(
    execution: AgentExecutionId,
    attachment: ExecutionAttachmentId,
    coordinator: ExecutionDrive,
  ): void {
    const own: Driving = { wait: null, poked: false, asked: null, planned: null }
    driving = own
    let ended: Failure = { kind: 'terminal' }
    const pacer = reconciliationPacer(entry.configuration.reconciliationDelaysMs)
    const handOver = () =>
      handOverAsked(own, coordinator, () => {
        if (slot.kind === 'running' && slot.execution === execution) occupy({ kind: 'free' })
        ended = { kind: 'stale-advance' }
      })
    const drive = async (): Promise<Halted | null> => {
      try {
        for (;;) {
          const ran = await measurer.segment(
            'run',
            execution,
            () => coordinator.runExecution(),
            answer => 'failure' in answer,
          )
          for (;;) {
            if (await handOver()) return null
            if (own.poked) break
            const controller = new AbortController()
            own.wait = controller
            const wake = await coordinator
              .waitForWake({ pacer, signal: controller.signal })
              .finally(() => {
                own.wait = null
                controller.abort()
              })
            if ('failure' in wake) return wake.failure
            if (wake.ok === 'stopped') return 'failure' in ran ? ran.failure : null
            if (wake.ok === 'ready') break
          }
          own.poked = false
        }
      } finally {
        own.asked?.settle(false)
        own.asked = null
        settlePlanned(own, fail(ended))
        if (driving === own) driving = null
        nested.stopped(execution)
      }
    }
    const stopped = (halted: Halted | null) => {
      if (halted !== null) failRun(execution, attachment, halted.node, halted.failure)
    }
    void drive().then(stopped, (error: unknown) =>
      failRun(execution, attachment, null, {
        kind: 'unavailable',
        owner: OWNER,
        diagnostic: `the drive threw: ${thrownText(error)}`,
      }),
    )
  }

  async function acceptOriginal(
    input: InvokeInput<P>,
    back: Slot,
    coordinator: ExecutionCoordinator,
    confirmedOpen?: CommandReceipt,
  ): Promise<Outcome<AgentExecutionHandle<P>, Failure>> {
    const { execution, operation } = input
    const giveBack = () => occupy(back)
    const opened = await measurer.segment(
      'accept',
      execution,
      () => coordinator.accept(confirmedOpen),
      answer => 'failure' in answer,
    )
    if ('failure' in opened) {
      const { node, failure } = opened.failure
      if (failure.kind !== 'commit-unknown') {
        giveBack()
        return fail(failure)
      }
      if (node === 'E0')
        occupy({
          kind: 'reserved',
          execution,
          acceptance: { operation, input: inputText(input), coordinator },
        })
      else giveBack()
      return fail({ kind: 'commit-unknown', operation })
    }
    if (opened.ok.instance !== instance) {
      giveBack()
      return succeed(handleOf(execution))
    }
    accepted = { operation, execution, input: inputText(input) }
    const attachment = opened.ok.executionAttachment
    occupy({ kind: 'running', execution, attachment })
    startDrive(execution, attachment, coordinator)
    return succeed(handleOf(execution))
  }

  async function retryUnresolved(
    input: InvokeInput<P>,
    held: Extract<Slot, { kind: 'reserved' }>,
  ): Promise<Outcome<AgentExecutionHandle<P>, Failure>> {
    const original = held.acceptance
    if (original === null) return fail({ kind: 'busy' })
    if (original.input !== inputText(input))
      return fail({ kind: 'conflict', operation: input.operation })
    occupy({ ...held, acceptance: null })
    const found = await dependencies.journal
      .query({
        principal: input.principal,
        tenant: input.tenant,
        execution: held.execution,
        operation: input.operation,
      })
      .catch(() => fail({ kind: 'commit-unknown' as const, operation: input.operation }))
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
        occupy(held)
        return fail({ kind: 'conflict', operation: input.operation })
      case 'committed':
        return acceptOriginal(input, held, original.coordinator, found.ok.receipt)
    }
  }

  async function findAccepted(
    input: InvokeInput<P>,
  ): Promise<Outcome<AgentExecutionHandle<P>, Failure>> {
    const found = await dependencies.journal.query(input)
    if ('failure' in found) {
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
      ...coordinatorBase(entry),
      evaluator: resolved.ok.evaluator,
      extensions: resolved.ok.extensions,
      requestCancel,
      access: { principal: input.principal, tenant: input.tenant },
      execution: input.execution,
      operation: input.operation,
      initial: input.initial,
      grant: input.grant,
      idle: () => {},
      handoverAsked,
      maxRunSteps: maxRunStepsOf(entry.configuration),
    })
    const opened = await measurer.segment(
      'accept',
      input.execution,
      () => coordinator.accept(),
      answer => 'failure' in answer,
    )
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
    if (draining()) return fail(drainingRefusal('invoke'))
    if (
      slot.kind === 'reserved' &&
      slot.acceptance?.operation === input.operation &&
      slot.execution === input.execution
    )
      return retryUnresolved(input, slot)
    if (slot.kind !== 'free')
      return slot.execution === input.execution ? fail({ kind: 'busy' }) : findAccepted(input)
    occupy({ kind: 'reserved', execution: input.execution, acceptance: null })
    return admit(input, { kind: 'free' })
  }

  const resume: AgentProvider<P>['runtime']['resume'] = async input => {
    const passed = await guard(input, 'resume', onExecution(input.execution))
    if ('failure' in passed) return passed
    if (draining()) return fail(drainingRefusal('resume'))
    if (slot.kind !== 'free') return fail({ kind: 'busy' })
    const { execution } = input
    occupy({ kind: 'reserved', execution, acceptance: null })
    const release = () => occupy({ kind: 'free' })
    const access: Access<P> = { principal: input.principal, tenant: input.tenant }
    const adopted = await coordinatorEntry(access, execution, release)
    if ('failure' in adopted) {
      release()
      return adopted
    }
    const coordinator = createResumedCoordinator(adopted.ok)
    const resumed = await coordinator.resume({
      operation: input.operation,
      recovery: input.recovery,
      grant: input.grant,
    })
    if ('failure' in resumed) {
      release()
      return fail(resumed.failure.failure)
    }
    const attachment = resumed.ok.executionAttachment
    occupy({ kind: 'running', execution, attachment })
    startDrive(execution, attachment, coordinator)
    return succeed(handleOf(execution))
  }

  function askHandover(held: Quiescing): Promise<boolean> {
    const own = driving
    if (own === null || own.asked !== null) return Promise.resolve(false)
    return new Promise(settle => {
      own.asked = { operation: held.operation, reason: held.reason, settle }
      own.wait?.abort()
    })
  }

  function quiesceResult(
    held: Quiescing,
    kind: QuiesceResult['kind'],
    remaining: QuiesceResult['remaining'],
  ): QuiesceResult {
    return {
      kind,
      remaining,
      evidence: agentEvidence(`quiesce/${instance}/${held.operation}`, {
        kind,
        remaining,
        reason: held.reason,
      }),
    }
  }

  async function withdrawRegistration(
    held: Quiescing,
    access: Access<P>,
  ): Promise<Outcome<null, Failure>> {
    const handle = dependencies.registration
    if (handle === null) return succeed(null)
    let answer: Awaited<ReturnType<typeof handle.withdraw>>
    try {
      answer = await handle.withdraw({ ...access, operation: held.operation, reason: held.reason })
    } catch {
      return fail(withdrawalFailure('withdraw threw'))
    }
    if ('failure' in answer) {
      const { failure } = answer
      if (failure.kind === 'denied' || failure.kind === 'unavailable') return answer
      return fail(withdrawalFailure(`withdraw answered ${failure.kind}`))
    }
    if (answer.ok === null || answer.ok.state === 'withdrawn') return succeed(null)
    return fail(withdrawalFailure(`withdraw left the registration ${answer.ok.state}`))
  }

  async function drainStep(
    held: Quiescing,
    access: Access<P>,
  ): Promise<Outcome<QuiesceResult, Failure>> {
    while (slot.kind === 'reserved' && slot.acceptance === null) await woken(UNENDING, listeners)
    if (slot.kind === 'running') await askHandover(held)
    if (slot.kind !== 'free') return succeed(quiesceResult(held, 'unresolved', [slot.execution]))
    const withdrawn = await withdrawRegistration(held, access)
    if ('failure' in withdrawn) return withdrawn
    const drained = quiesceResult(held, 'drained', [])
    held.drained = drained
    retired = true
    for (const wake of listeners) wake()
    return succeed(drained)
  }

  function continueQuiesce(
    held: Quiescing,
    access: Access<P>,
  ): Promise<Outcome<QuiesceResult, Failure>> {
    if (held.drained !== null) return Promise.resolve(succeed(held.drained))
    if (held.step === null) {
      const step = drainStep(held, access)
      held.step = step
      const clear = () => {
        if (held.step === step) held.step = null
      }
      void step.then(clear, clear)
    }
    return held.step
  }

  const handOver: AgentProvider<P>['control']['handOver'] = async input => {
    const passed = await guard(input, 'detach', onExecution(input.execution))
    if ('failure' in passed) return passed
    const here = slot.kind === 'running' && slot.execution === input.execution
    return askPlanned(here ? driving : null, input)
  }

  const quiesce: AgentProvider<P>['control']['quiesce'] = async input => {
    checking += 1
    let passed: Awaited<ReturnType<AccessGuard<P>>>
    try {
      passed = await guard(input, 'quiesce', onInstance)
    } finally {
      checking -= 1
    }
    if ('failure' in passed) return passed
    const reasonText = canonical(input.reason)
    if (quiescing === null)
      quiescing = {
        operation: input.operation,
        reason: input.reason,
        reasonText,
        drained: null,
        step: null,
      }
    else if (quiescing.operation === input.operation && quiescing.reasonText !== reasonText)
      return fail({ kind: 'conflict', operation: input.operation })
    return continueQuiesce(quiescing, { principal: input.principal, tenant: input.tenant })
  }

  return {
    runtime: {
      instance,
      invoke,
      resume,
    },
    observation: { instance, observe },
    recovery: {
      query: input => guarded(input, 'query', onExecution(input.execution), 'stage 5'),
      load: input => guarded(input, 'load', onExecution(input.execution), 'stage 5'),
      reconcile: input => guarded(input, 'reconcile', onExecution(input.execution), 'stage 5'),
      detach: input => guarded(input, 'detach', onExecution(input.execution), 'stage 5'),
      handOver: input => guarded(input, 'detach', onExecution(input.execution), 'stage 5'),
      contact: input => guarded(input, 'load', onExecution(input.execution), 'stage 5'),
    },
    control: {
      quiesce,
      handOver,
    },
    nested: nested.guarded(input => guard(input, 'submit', onExecution(input.execution))),
  }
}
