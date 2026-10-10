import { createParameterJudge, type ParameterJudge } from '@omne-harness-lite/tool-definition'
import { randomUUID } from 'node:crypto'
import { copyJsonValue, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { compareInteger, type CheckedPrefix } from '@omne-harness-lite/session-log'
import { StorageUnavailable, type StorageUnit } from '@omne-harness-lite/storage'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import type {
  ContextBinding,
  ContextReader,
  RuntimeContextOperations,
} from '@omne-harness-lite/runtime-context'
import type { AccessOperation, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import {
  accept,
  closeOut,
  snapshot,
  start,
  type AssemblyState,
} from '@omne-harness-lite/stream-assembly'
import type { ToolAdmissionOperations } from '@omne-harness-lite/tool-admission'
import type {
  ExecutionObserver,
  ExecutionSnapshot,
  ToolJournalHistory,
  ExecutionRead,
  ExecutionRef,
  ExecutionSubmission,
  ExecutionTerminal,
  InvokeTool,
  RuntimeAccess,
  SelectedTool,
  SubmissionResult,
  ToolImplementationLease,
  ToolImplementationOperations,
  ToolRuntimeOperations,
  ToolResultWriter,
  ToolOriginalIssueSupport,
  ToolJournalPayload,
  ToolExecutionRecords,
  PreparedToolExecution,
  ToolSubmitResult,
} from '@omne-harness-lite/tool-execution-runtime'
import type {
  ExecutionEnvironmentOperations,
  EnvironmentFacilities,
} from '@omne-harness-lite/execution-environments'
import { createToolOriginalIssue } from './original-issue.ts'
import { createExecutionEnvironment } from './execution-environment.ts'
import { createExecutionContextReader } from './execution-context.ts'
import { createExecutionObserver } from './execution-observer.ts'
import type { PreparedTerminal } from './execution-result.ts'
import { createTerminalCommitter } from './execution-terminal.ts'
import {
  capturePreparedExecution,
  verifyPreparedExecution,
  samePreparedExecution,
} from './prepared-submission.ts'
import { jsonObject, sameJson } from './json-values.ts'
import type { RuntimeJournal, RuntimeJournalFailure } from './execution-journal.ts'
import { submissionIdentity } from './submission.ts'

type Journal = RuntimeJournal
function transition(
  value: ToolJournalPayload,
): value is Parameters<ToolExecutionRecords['stageTransitionIn']>[2][number] {
  return (
    value.kind !== 'execution_intended' &&
    value.kind !== 'execution_started' &&
    value.kind !== 'delivery_confirmed'
  )
}
class NativeRecordCommitFailure extends Error {
  constructor(readonly reason: RuntimeJournalFailure['reason']) {
    super(reason)
  }
}
interface OwnedExecution {
  readonly request: ExecutionSubmission
  readonly ref: ExecutionRef
  readonly acceptedAt: string
  readonly chain: JsonValue
  readonly pass: string
  readonly controller: AbortController
  readonly environmentClosed: AbortController
  environment?: ReturnType<typeof createExecutionEnvironment>
  readonly lease?: ToolImplementationLease
  readonly selected?: SelectedTool
  readonly notExecutable?: 'unparseable' | 'no_such_entry'
  readonly unavailable?: string
  assembly: AssemblyState
  entered: boolean
  released: boolean
  result?: ExecutionTerminal
  task?: Promise<void>
  ending: Promise<unknown>
  writer?: ToolResultWriter
  frameBytes: number
  original?: ReturnType<typeof createToolOriginalIssue>
  readonly stopped: Promise<void>
  readonly resolveStopped: () => void
  readonly rejectStopped: (error: unknown) => void
  finished: boolean
}
function ownRef(supplied: unknown): ExecutionRef | undefined {
  const copied = copyJsonValue(supplied)
  if ('failed' in copied || !jsonObject(copied.ok) || Object.keys(copied.ok).length !== 3) return
  const tenant = parseTenantId(copied.ok.tenant),
    session = parseOpaqueIdentifier(copied.ok.session, 'SessionRef'),
    callId = parseOpaqueIdentifier(copied.ok.callId, 'CallId')
  return 'ok' in tenant && 'ok' in session && 'ok' in callId
    ? { tenant: tenant.ok, session: session.ok, callId: callId.ok }
    : undefined
}
const keyOf = (ref: ExecutionRef) =>
  JSON.stringify([ref.tenant.organization, ref.tenant.account, ref.session, ref.callId])
const scopeOf = (ref: ExecutionRef) => ({ tenant: ref.tenant, session: ref.session })
const rejected = (
  reason: Extract<ExecutionRead, { kind: 'rejected' }>['reason'],
): ExecutionRead => ({ kind: 'rejected', reason })

function executionSnapshot(ref: ExecutionRef, history: ToolJournalHistory): ExecutionSnapshot {
  const intent = history.intent.value
  return {
    ref,
    origin: intent.origin,
    ...(intent.selected ? { selected: intent.selected } : {}),
    ...(history.environment ? { adoptedEnvironment: history.environment.value.adoption } : {}),
    adoptedContext: history.contextReads.flatMap(record => record.value.values),
    resources: [...history.resources.values()].map(resource => {
      const observation = resource.observations.at(-1)?.value
      return {
        resource: resource.planned.value.resource,
        permission: resource.permitted ? ('permitted' as const) : ('planned' as const),
        ownership: resource.adopted ? ('environment' as const) : ('call' as const),
        ...(observation
          ? {
              observation: {
                status: observation.status,
                at: observation.at,
                ...(observation.evidence === undefined ? {} : { evidence: observation.evidence }),
              },
            }
          : {}),
      }
    }),
    state: history.terminal
      ? {
          phase: 'ended',
          terminal: history.terminal.value.terminal,
          account: history.terminal.value.account,
        }
      : history.waiting
        ? {
            phase: 'waiting',
            waitIndex: history.waiting.value.waitIndex,
            request: history.waiting.value.request,
          }
        : history.started
          ? { phase: 'running', startedAt: history.started.value.at }
          : { phase: 'queued' },
  }
}

/** Private execution owner. Construction ports stay inside the provider; none are plugin config. */
export function createExecutionOwner(input: {
  readonly parameters?: ParameterJudge

  readonly journal: Journal
  readonly tenant: TenantId
  readonly originalIssue: ToolOriginalIssueSupport
  readonly authorization: SessionAccessOperations
  readonly admission: () => ToolAdmissionOperations | undefined
  readonly implementations: ToolImplementationOperations
  readonly context: {
    bind(
      ...args: Parameters<RuntimeContextOperations['bind']>
    ): Promise<
      | Extract<ContextBinding, { kind: 'rejected' }>
      | { readonly kind: 'bound'; readonly reader: ContextReader }
    >
  }
  readonly environments?: Pick<ExecutionEnvironmentOperations, 'resolvePlacement' | 'acquire'>
  readonly invoke: InvokeTool
  readonly clock: Clock
  readonly attempts: number
  readonly frameQueueBytes?: number
  readonly retry?: (attempt: number) => Promise<void>
  /** Called after confirmed intent and before entry. A bound receipt writer survives later user revocation. */
  readonly bindWriter?: (
    request: ExecutionSubmission,
    selected?: SelectedTool,
  ) => Promise<ToolResultWriter | 'unavailable'>
  /** Prepare original result bytes and the frozen A basis, without running delivery extensions. */
  readonly prepareDelivery: (request: {
    readonly ref: ExecutionRef
    readonly origin: ExecutionSubmission['origin']
    readonly terminal: ExecutionTerminal
    readonly chain: JsonValue
    readonly pass: string
    readonly writer?: ToolResultWriter
  }) => Promise<PreparedTerminal | 'unavailable'>
}) {
  const parameters = input.parameters ?? createParameterJudge()
  const originalGeneration = randomUUID()
  const preparedRequests = new Map<
    string,
    Exclude<ReturnType<typeof capturePreparedExecution>, SubmissionResult>
  >()
  const owned = new Map<string, OwnedExecution>(),
    submissions = new Map<string, Promise<unknown>>(),
    listeners = new Map<string, Set<() => void>>(),
    tasks = new Set<Promise<unknown>>(),
    faults = new Set<unknown>(),
    observers = new Set<ExecutionObserver>()
  let open = true,
    closing: Promise<void> | undefined
  const journal: Journal = Object.freeze({ ...input.journal, read: readJournal, commit })
  const terminal = createTerminalCommitter({ ...input, journal })
  async function readJournal(
    scope: Parameters<Journal['read']>[0],
    call: string,
  ): ReturnType<Journal['read']> {
    const ref = ownRef({ ...scope, callId: call })
    if (!ref) return { kind: 'rejected', reason: 'invalidInput' }
    const original = owned.get(keyOf(ref))?.original
    const support = input.originalIssue
    if (!original || !support) return input.journal.read(scope, call)
    return track(readOwnedJournal(scope, call, original, support))
  }
  async function readOwnedJournal(
    scope: Parameters<Journal['read']>[0],
    call: string,
    original: ReturnType<typeof createToolOriginalIssue>,
    support: ToolOriginalIssueSupport,
  ): ReturnType<Journal['read']> {
    const status = await original.recordStatus()
    if (status === 'absent') return input.journal.read(scope, call)
    if (status === 'unconfirmed') return { kind: 'rejected', reason: 'unavailable' }
    return readOriginalRecords(original, support)
  }
  async function readOriginalRecords(
    original: ReturnType<typeof createToolOriginalIssue>,
    support: ToolOriginalIssueSupport,
  ): ReturnType<Journal['read']> {
    if (!journal.isCurrent()) return { kind: 'rejected', reason: 'unavailable' }
    try {
      const result = await support.storage.atomic(unit => original.records.readCurrentIn(unit))
      if (!journal.isCurrent() || result.kind !== 'found')
        return { kind: 'rejected', reason: 'unavailable' }
      return {
        kind: 'view',
        prefix: {
          scope: { tenant: result.source.tenant, session: result.source.session },
          ownerGeneration: journal.generation,
          tail: result.source.tail,
          entries: result.entries,
        },
        executions: new Map([[original.participant.identity.ref.callId, result.history]]),
      }
    } catch (error) {
      if (error instanceof StorageUnavailable) return { kind: 'rejected', reason: 'unavailable' }
      throw error
    }
  }
  function captureRecordCommit(
    request: Parameters<Journal['commit']>[0],
    original: ReturnType<typeof createToolOriginalIssue>,
  ) {
    const captured = copyJsonValue(request)
    if ('failed' in captured) return { kind: 'rejected', reason: 'invalidInput' } as const
    const fixed = captured.ok as unknown as typeof request
    if (
      !sameJson(fixed.ref, original.participant.identity.ref) ||
      !sameJson(fixed.origin, original.participant.identity.origin)
    )
      return { kind: 'rejected', reason: 'invalidInput' } as const
    if (fixed.expected.ownerGeneration !== journal.generation || !journal.isCurrent())
      return { kind: 'rejected', reason: 'unavailable' } as const
    return { kind: 'captured', value: fixed } as const
  }
  async function stageNativeRecords(
    support: ToolOriginalIssueSupport,
    original: ReturnType<typeof createToolOriginalIssue>,
    fixed: Parameters<Journal['commit']>[0],
  ) {
    await support.storage.atomic(async unit => {
      const source = await support.log.sourceIn(unit, support.access, scopeOf(fixed.ref))
      if ('failure' in source) throw new NativeRecordCommitFailure('unavailable')
      if (compareInteger(source.source.tail, fixed.expected.tail) !== 0)
        throw new NativeRecordCommitFailure('tailChanged')
      const values = await terminalValuesIn(
        unit,
        support,
        original,
        fixed.values.filter(transition),
      )
      const result = await original.records.stageTransitionIn(unit, original.job, values)
      if (result.kind !== 'staged' && result.kind !== 'recognized')
        throw new NativeRecordCommitFailure(result.kind === 'conflict' ? 'conflict' : 'unavailable')
    })
  }
  async function terminalValuesIn(
    unit: StorageUnit,
    support: ToolOriginalIssueSupport,
    original: ReturnType<typeof createToolOriginalIssue>,
    values: Parameters<ToolExecutionRecords['stageTransitionIn']>[2],
  ) {
    if (!values.some(value => value.kind === 'execution_ended')) return values
    const classification = await support.classifyTerminalIn(unit, original.participant.identity)
    if (classification.kind !== 'classified') throw new NativeRecordCommitFailure('unavailable')
    return values.map(value => {
      if (value.kind !== 'execution_ended') return value
      const { late: _late, ...account } = value.account
      return {
        ...value,
        account: { ...account, ...(classification.late ? { late: true as const } : {}) },
      }
    })
  }
  async function commit(request: Parameters<Journal['commit']>[0]): ReturnType<Journal['commit']> {
    const original = owned.get(keyOf(request.ref))?.original
    const support = input.originalIssue
    if (!original || !support || request.values.some(value => !transition(value)))
      return input.journal.commit(request)
    const captured = captureRecordCommit(request, original)
    if (captured.kind === 'rejected') return captured
    const fixed = captured.value
    try {
      await stageNativeRecords(support, original, fixed)
      return journal.read(scopeOf(fixed.ref), fixed.ref.callId)
    } catch (error) {
      if (error instanceof NativeRecordCommitFailure)
        return { kind: 'rejected', reason: error.reason }
      if (error instanceof StorageUnavailable) return { kind: 'rejected', reason: 'unavailable' }
      throw error
    }
  }
  function notify(ref: ExecutionRef) {
    for (const wake of listeners.get(keyOf(ref)) ?? []) wake()
  }
  async function release(job: OwnedExecution): Promise<boolean> {
    if (!job.released) {
      job.released = true
      job.lease?.release()
    }
    return (await job.environment?.release()) !== 'pending'
  }
  function track<T>(task: Promise<T>): Promise<T> {
    tasks.add(task)
    void task.then(
      () => tasks.delete(task),
      error => {
        tasks.delete(task)
        faults.add(error)
      },
    )
    return task
  }
  async function authorize(access: RuntimeAccess, ref: ExecutionRef, operation: AccessOperation) {
    const decision = await input.authorization.authorize(access, scopeOf(ref), operation)
    return decision.kind === 'authorized'
      ? undefined
      : decision.reason === 'notAuthorized' || decision.reason === 'invalidInput'
        ? ('notAuthorized' as const)
        : ('runtimeUnavailable' as const)
  }
  async function read(access: RuntimeAccess, ref: ExecutionRef): Promise<ExecutionRead> {
    if (!open) return rejected('ownerStopped')
    try {
      const before = await authorize(access, ref, 'tool.read')
      if (before) return rejected(before)
      const view = await journal.read(scopeOf(ref), ref.callId)
      const after = await authorize(access, ref, 'tool.read')
      if (!open) return rejected('ownerStopped')
      if (after) return rejected(after)
      if (view.kind !== 'view') return rejected('runtimeUnavailable')
      const history = view.executions.get(ref.callId)
      if (!history) return rejected('notFound')
      return { kind: 'found', snapshot: executionSnapshot(ref, history) }
    } catch {
      return rejected(open ? 'runtimeUnavailable' : 'ownerStopped')
    }
  }
  function end(job: OwnedExecution, result: ExecutionTerminal) {
    job.environmentClosed.abort('execution_closing')
    const task = job.ending.then(async () => {
      const current = await journal.read(scopeOf(job.ref), job.ref.callId)
      if (current.kind !== 'view') return 'unavailable' as const
      if (current.executions.get(job.ref.callId)?.terminal) return 'alreadyEnded' as const
      const delivery = await input.prepareDelivery({
        ref: job.ref,
        origin: job.request.origin,
        terminal: result,
        chain: job.chain,
        pass: job.pass,
        ...(job.writer ? { writer: job.writer } : {}),
      })
      if (delivery === 'unavailable') return 'unavailable' as const
      const ended = accept(job.assembly, {
        t: 'finish',
        reason: result.outcome === 'interrupted' ? 'interrupted' : 'end',
      })
      if ('ok' in ended) job.assembly = ended.ok
      const settled = closeOut(job.assembly)
      const frames =
        'ok' in settled && 'frames' in settled.ok.account ? settled.ok.account.frames : 'unknown'
      const view = await journal.read(scopeOf(job.ref), job.ref.callId)
      const startedAt =
        view.kind === 'view' ? view.executions.get(job.ref.callId)?.started?.value.at : undefined
      const committed = await terminal({
        ref: job.ref,
        origin: job.request.origin,
        terminal: delivery.terminal,
        delivery: delivery.delivery,
        startedAt: startedAt ?? job.acceptedAt,
        frames,
      })
      notify(job.ref)
      return committed
    })
    job.ending = task.then(
      () => undefined,
      () => undefined,
    )
    return track(task)
  }
  function unsupportedDependencies(selected: SelectedTool): boolean {
    const definition = selected.definition
    return (
      Object.keys(definition.settings ?? {}).some(
        name => name !== 'targetEnvironment' && name !== 'backgroundThreshold',
      ) ||
      (definition.settings?.targetEnvironment !== undefined && !input.environments) ||
      (definition.needs?.attachmentStorage !== undefined && !input.bindWriter) ||
      (definition.needs?.externalServices?.length ?? 0) > 0
    )
  }
  function selectInvocation(job: OwnedExecution) {
    if (
      job.notExecutable ||
      job.unavailable ||
      !job.lease ||
      !job.selected ||
      job.request.call.unparseable
    ) {
      const terminal: ExecutionTerminal =
        job.notExecutable === 'unparseable'
          ? { outcome: 'failed', code: 'unparseable' }
          : { outcome: 'unavailable', reason: job.unavailable ?? 'no_such_entry' }
      return { kind: 'rejected', terminal } as const
    }
    return {
      kind: 'selected',
      selected: job.selected,
      lease: job.lease,
      args: job.request.call.arguments,
    } as const
  }
  async function invocationSelection(job: OwnedExecution) {
    if (!(await prepareOriginalEntry(job))) return
    // A declaration is not a resolved dependency.
    if (job.selected && unsupportedDependencies(job.selected)) {
      await end(job, { outcome: 'unavailable', reason: 'execution_dependencies_unavailable' })
      return
    }
    const selection = selectInvocation(job)
    if (selection.kind === 'rejected') {
      await end(job, selection.terminal)
      return
    }
    return selection
  }
  async function bindInvocation(
    job: OwnedExecution,
    selected: SelectedTool,
  ): Promise<ContextReader | undefined> {
    const bound = await input.context.bind(job.request.access, job.request.scope, 'tool')
    if (bound.kind !== 'bound') {
      await end(job, { outcome: 'unavailable', reason: 'context_unavailable' })
      return
    }
    if (input.bindWriter && !job.writer) {
      const writer = await input.bindWriter(job.request, selected)
      if (writer === 'unavailable') {
        await end(job, { outcome: 'unavailable', reason: 'result_storage_unavailable' })
        return
      }
      job.writer = writer
    }
    return bound.reader
  }
  async function confirmStart(job: OwnedExecution): Promise<boolean> {
    if (job.environmentClosed.signal.aborted) return false
    const view = await journal.read(job.request.scope, job.ref.callId)
    if (view.kind !== 'view') return false
    const history = view.executions.get(job.ref.callId)
    if (!history?.started || history.terminal || job.environmentClosed.signal.aborted) return false
    notify(job.ref)
    return true
  }
  async function observeImplementation(job: OwnedExecution, lease: ToolImplementationLease) {
    const invalidated = lease.implementation.invalidated
    const invalidate = async () => {
      const outcome = await end(job, {
        outcome: 'unavailable',
        reason: 'implementation_invalidated',
      })
      if (outcome !== 'unavailable') job.controller.abort('implementation_invalidated')
    }
    if (invalidated?.aborted) {
      await invalidate()
      return 'invalidated' as const
    }
    if (invalidated) {
      const listener = () => {
        void track(invalidate())
      }
      invalidated.addEventListener('abort', listener, { once: true })
      return () => invalidated.removeEventListener('abort', listener)
    }
  }
  async function prepareEnvironment(job: OwnedExecution, selected: SelectedTool) {
    if (selected.definition.settings?.targetEnvironment === undefined)
      return { kind: 'notApplicable' } as const
    {
      if (!input.environments) {
        await end(job, { outcome: 'unavailable', reason: 'environment:unavailable' })
        return
      }
      job.environment ??= createExecutionEnvironment({
        ref: job.ref,
        origin: job.request.origin,
        selected,
        access: job.request.access,
        environments: input.environments,
        journal,
        closed: job.environmentClosed.signal,
        clock: input.clock,
        attempts: input.attempts,
        ...(input.retry ? { retry: input.retry } : {}),
        invalidate(reason) {
          if (job.environmentClosed.signal.aborted) return
          void track(
            end(job, { outcome: 'unavailable', reason: `environment:${reason}` }).then(outcome => {
              if (outcome !== 'unavailable') job.controller.abort(reason)
            }),
          )
        },
      })
      const prepared = await job.environment.prepare()
      if (prepared.kind === 'retained') return
      if (prepared.kind === 'rejected') {
        await end(job, { outcome: 'unavailable', reason: prepared.reason })
        return
      }
      return prepared
    }
  }
  async function invokeOriginal(
    job: OwnedExecution,
    selected: SelectedTool,
    lease: ToolImplementationLease,
    reader: ContextReader,
    args: JsonValue,
    environment?: EnvironmentFacilities,
  ): Promise<void> {
    job.entered = true
    const context = createExecutionContextReader({
      ref: job.ref,
      origin: job.request.origin,
      reader,
      journal,
      isOpen: () => open && !job.controller.signal.aborted,
      attempts: input.attempts,
    })
    const result = await input.invoke(
      {
        definition: selected.definition,
        args,
        executor: lease.implementation.executor,
      },
      {
        context,
        ...(environment ? { environment } : {}),
        ...(job.writer && selected.definition.needs?.attachmentStorage
          ? { attachments: { putAttachment: job.writer.putAttachment.bind(job.writer) } }
          : {}),
        signal: job.controller.signal,
        wait: async () => ({ kind: 'rejected', reason: 'unavailable' }),
        costs: { report: async () => 'unavailable' },
        frames: {
          emit(frame) {
            if (job.controller.signal.aborted || !open) return { kind: 'dropped', why: 'closed' }
            try {
              const captured = copyJsonValue(frame)
              if ('failed' in captured) return { kind: 'dropped', why: 'invalid' }
              const bytes = Buffer.byteLength(JSON.stringify(captured.ok))
              if (
                input.frameQueueBytes !== undefined &&
                bytes > input.frameQueueBytes - job.frameBytes
              ) {
                const trimmed = accept(job.assembly, {
                  t: 'trim',
                  reason: 'quota_exhausted',
                  omittedBytes: bytes,
                })
                if ('ok' in trimmed) job.assembly = trimmed.ok
                notify(job.ref)
                return { kind: 'dropped', why: 'capacity' }
              }
              const result = accept(job.assembly, captured.ok)
              if ('rejected' in result) return { kind: 'dropped', why: result.rejected }
              job.assembly = result.ok
              job.frameBytes += bytes
              notify(job.ref)
              return { kind: 'accepted' }
            } catch {
              return { kind: 'dropped', why: 'invalid' }
            }
          },
        },
      },
    )
    const ending: ExecutionTerminal =
      result.kind === 'failed'
        ? { outcome: 'failed', code: result.code }
        : typeof result.result !== 'string' && result.result.isError === true
          ? { outcome: 'failed', code: 'business_failure', result: result.result }
          : { outcome: 'completed', result: result.result }
    const captured = copyJsonValue(ending)
    if ('failed' in captured) throw new Error('invoker returned an uncapturable terminal')
    job.result = captured.ok as unknown as ExecutionTerminal
    await end(job, job.result)
  }
  async function releaseCompletedExecution(job: OwnedExecution): Promise<void> {
    // A lost start or adoption receipt retains both original dependencies until recognition or termination.
    const view = await journal.read(job.request.scope, job.ref.callId)
    if (view.kind === 'view' && view.executions.get(job.ref.callId)?.terminal)
      job.finished = await release(job)
  }
  async function prepareOriginalEntry(job: OwnedExecution): Promise<boolean> {
    const gate = await job.original!.launch()
    if (gate === 'finishUnconfirmed')
      await end(job, { outcome: 'unavailable', reason: 'original_consume_unconfirmed' })
    return gate === 'launch'
  }
  async function run(job: OwnedExecution): Promise<void> {
    let removeInvalidation: (() => void) | undefined
    try {
      if (job.result) {
        await end(job, job.result)
        return
      }
      const selected = await invocationSelection(job)
      if (!selected) return
      const reader = await bindInvocation(job, selected.selected)
      if (!reader || !(await confirmStart(job))) return
      const observation = await observeImplementation(job, selected.lease)
      if (observation === 'invalidated') return
      removeInvalidation = observation
      const environment = await prepareEnvironment(job, selected.selected)
      if (!environment) return
      // Every owner control path closes this permanent gate before aborting the author.
      if (job.environmentClosed.signal.aborted || job.entered) return
      await invokeOriginal(
        job,
        selected.selected,
        selected.lease,
        reader,
        selected.args,
        environment.kind === 'ready' ? environment.facilities : undefined,
      )
    } finally {
      removeInvalidation?.()
      await releaseCompletedExecution(job)
    }
  }
  function launch(job: OwnedExecution) {
    if (job.task || (job.entered && !job.result)) return
    const task = track(run(job))
    job.task = task
    void task.then(
      () => {
        if (job.task === task) delete job.task
        if (job.finished) job.resolveStopped()
      },
      error => {
        if (job.task === task) delete job.task
        job.rejectStopped(error)
      },
    )
    // Reentry may finish a retained terminal or recognize a lost start receipt. It never invokes twice.
  }
  async function captureExecutionBasis(ref: ExecutionRef) {
    const now = await input.clock.now(),
      assembly = start({ kind: 'tool_execution', callId: ref.callId })
    if (now === 'unavailable' || 'rejected' in assembly || !open)
      return { kind: 'rejected', reason: open ? 'runtimeUnavailable' : 'ownerStopped' } as const
    return { kind: 'basis' as const, acceptedAt: instantToRfc3339(now), assembly: assembly.ok }
  }
  function ownCandidate(
    decision: Pick<
      Exclude<ReturnType<typeof capturePreparedExecution>, SubmissionResult>,
      'request' | 'selected' | 'notExecutable'
    >,
    ref: ExecutionRef,
    basis: Extract<Awaited<ReturnType<typeof captureExecutionBasis>>, { kind: 'basis' }>,
    chain: { readonly chain: JsonValue; readonly pass: string },
  ): OwnedExecution {
    const request = decision.request
    const acquired = decision.selected
      ? input.implementations.acquire(decision.selected)
      : undefined
    const lease = acquired && 'implementation' in acquired ? acquired : undefined
    let resolveStopped!: () => void, rejectStopped!: (error: unknown) => void
    const stopped = new Promise<void>((resolve, reject) => {
      resolveStopped = resolve
      rejectStopped = reject
    })
    void stopped.catch(() => {})
    const job: OwnedExecution = {
      stopped,
      resolveStopped,
      rejectStopped,
      finished: false,
      request,
      ref,
      acceptedAt: basis.acceptedAt,
      chain: chain.chain,
      pass: chain.pass,
      controller: new AbortController(),
      environmentClosed: new AbortController(),
      assembly: basis.assembly,
      entered: false,
      released: false,
      ending: Promise.resolve(),
      frameBytes: 0,
      ...(lease ? { lease } : {}),
      ...(decision.selected ? { selected: decision.selected } : {}),
      ...(decision.notExecutable ? { notExecutable: decision.notExecutable } : {}),
      ...(acquired && 'kind' in acquired ? { unavailable: acquired.kind } : {}),
    }
    return job
  }
  async function admitOriginalJob(job: OwnedExecution): Promise<SubmissionResult> {
    if (!(await job.original!.admit())) return { kind: 'rejected', reason: 'runtimeUnavailable' }
    launch(job)
    return { kind: 'recorded', execution: job.ref }
  }
  async function commitIntent(
    job: OwnedExecution,
    expected: Pick<CheckedPrefix, 'scope' | 'ownerGeneration' | 'tail'>,
  ) {
    const value: Extract<ToolJournalPayload, { kind: 'execution_intended' }> = {
      kind: 'execution_intended',
      revision: 1,
      ref: job.ref,
      origin: job.request.origin,
      ...(job.selected ? { selected: job.selected } : {}),
      input: {
        format: 'tool-input/1',
        submission: submissionIdentity(job.request),
        acceptedAt: job.acceptedAt,
        chain: job.chain,
        pass: job.pass,
        ...(job.notExecutable ? { notExecutable: job.notExecutable } : {}),
      } as unknown as JsonValue,
    }
    job.original = createToolOriginalIssue({
      support: input.originalIssue,
      clock: input.clock,
      generation: originalGeneration,
      expected,
      value,
      stopped: job.stopped,
      isOpen: () => open && input.journal.isCurrent(),
      isRetained: () => !job.finished && input.journal.isCurrent(),
    })
    return admitOriginalJob(job)
  }
  function enqueueSubmission<T extends ToolSubmitResult>(
    request: ExecutionSubmission,
    operation: () => Promise<T>,
  ) {
    const key = JSON.stringify([
      request.scope.tenant.organization,
      request.scope.tenant.account,
      request.scope.session,
    ])
    const task = track(
      (submissions.get(key) ?? Promise.resolve()).then(async () => {
        try {
          return await operation()
        } catch (error) {
          faults.add(error)
          return {
            kind: 'rejected' as const,
            reason: open ? ('runtimeUnavailable' as const) : ('ownerStopped' as const),
          }
        }
      }),
    )
    const complete = task.then(
      () => undefined,
      () => undefined,
    )
    submissions.set(key, complete)
    void complete.then(() => {
      if (submissions.get(key) === complete) submissions.delete(key)
    })
    return task
  }
  function preparedRejection(request: ExecutionSubmission): SubmissionResult | undefined {
    if (!tenantIdEquals(input.tenant, request.scope.tenant))
      return { kind: 'rejected', reason: 'notAuthorized' }
    if (!input.journal.isCurrent()) return { kind: 'rejected', reason: 'runtimeUnavailable' }
  }
  async function admitPrepared(
    captured: Exclude<ReturnType<typeof capturePreparedExecution>, SubmissionResult>,
  ): Promise<ToolSubmitResult> {
    const { request } = captured
    const ref = { ...request.scope, callId: request.call.callId }
    const invalid = preparedRejection(request)
    if (invalid) return invalid
    const denied = await authorize(request.access, ref, 'tool.submit')
    if (denied) return { kind: 'rejected', reason: denied }
    const previous = owned.get(keyOf(ref))
    if (previous) {
      const saved = preparedRequests.get(keyOf(ref))
      if (!samePreparedExecution(saved, captured))
        return { kind: 'rejected', reason: 'callConflict' }
      const result = await admitOriginalJob(previous)
      return result.kind === 'recorded' ? { ...result, kind: 'recognized' } : result
    }
    const admissionFailure = await verifyPreparedExecution(captured, input.admission)
    if (admissionFailure) return admissionFailure
    const basis = await captureExecutionBasis(ref)
    if (basis.kind !== 'basis') return basis
    const after = await authorize(request.access, ref, 'tool.submit')
    if (after) return { kind: 'rejected', reason: after }
    return stagePrepared(captured, basis)
  }
  async function stagePrepared(
    captured: Exclude<ReturnType<typeof capturePreparedExecution>, SubmissionResult>,
    basis: Extract<Awaited<ReturnType<typeof captureExecutionBasis>>, { kind: 'basis' }>,
  ): Promise<ToolSubmitResult> {
    const { request, source, chain } = captured
    const ref = { ...request.scope, callId: request.call.callId }
    const job = ownCandidate(captured, ref, basis, chain)
    owned.set(keyOf(ref), job)
    preparedRequests.set(keyOf(ref), captured)
    const committed = await commitIntent(job, {
      scope: request.scope,
      ownerGeneration: journal.generation,
      tail: source.tail,
    })
    return committed
  }
  async function preparedOutcome(
    ref: ExecutionRef,
    result: ToolSubmitResult,
  ): Promise<ToolSubmitResult> {
    if (result.kind !== 'rejected' || result.reason !== 'runtimeUnavailable') return result
    const original = owned.get(keyOf(ref))?.original
    if (!original || (await original.recordStatus()) === 'absent') return result
    return { kind: 'unknownCommit', original: ref }
  }
  async function closeExecution(job: OwnedExecution): Promise<void> {
    if (job.original && !(await job.original.canClose()))
      throw new Error('execution owner retains unconfirmed original admission')
    const view = await journal.read(job.request.scope, job.ref.callId)
    if (view.kind !== 'view') throw new Error('execution owner retains unresolved writes')
    if (view.executions.has(job.ref.callId)) {
      const result = await end(job, { outcome: 'failed', code: 'abnormal_interruption' })
      if (result === 'unavailable') throw new Error('execution owner retains a terminal obligation')
    }
    job.controller.abort('owner_closed')
  }
  const operations = Object.freeze({
    async acquire(access, supplied) {
      const ref = ownRef(supplied)
      if (!ref) return { kind: 'rejected', reason: 'notAuthorized' }
      const current = await read(access, ref)
      if (current.kind === 'rejected') return current
      const key = keyOf(ref)
      const observer = createExecutionObserver({
        read: () => read(access, ref),
        isOpen: () => open,
        onRelease: () => {
          observers.delete(observer)
        },
        frames: async () => {
          const current = await read(access, ref)
          if (current.kind === 'rejected') return current
          const job = owned.get(key)
          return job
            ? { kind: 'snapshot', value: snapshot(job.assembly) }
            : { kind: 'rejected', reason: 'runtimeUnavailable' }
        },
        subscribe(wake) {
          const current = listeners.get(key) ?? new Set()
          listeners.set(key, current)
          current.add(wake)
          return () => {
            current.delete(wake)
            if (current.size === 0) listeners.delete(key)
          }
        },
      })
      observers.add(observer)
      return { kind: 'acquired', observer }
    },
    async stop(access, supplied, reason) {
      const ref = ownRef(supplied)
      if (!ref || typeof reason !== 'string' || reason.length === 0) return 'unavailable'
      if (!open) return 'unavailable'
      try {
        const before = await authorize(access, ref, 'tool.stop')
        if (before) return before === 'notAuthorized' ? before : 'unavailable'
        const view = await journal.read(scopeOf(ref), ref.callId)
        const after = await authorize(access, ref, 'tool.stop')
        if (after || !open) return after === 'notAuthorized' ? after : 'unavailable'
        if (view.kind !== 'view') return 'unavailable'
        const history = view.executions.get(ref.callId)
        if (!history) return 'notFound'
        if (history.terminal) return 'alreadyEnded'
        const job = owned.get(keyOf(ref))
        if (!job) return 'unavailable'
        const result = await end(job, { outcome: 'interrupted', reason })
        if (result === 'unavailable') return result
        job.controller.abort(reason)
        return result === 'recorded' ? 'stopped' : 'alreadyEnded'
      } catch {
        return 'unavailable'
      }
    },
    // Real wait/answer ingress belongs to the later waiting increment. No answer is falsely accepted here.
    async answer(..._args: Parameters<ToolRuntimeOperations['answer']>) {
      return open ? 'unavailable' : 'ownerStopped'
    },
  } satisfies ToolRuntimeOperations)
  return Object.freeze({
    operations,
    submitPrepared(supplied: PreparedToolExecution): Promise<ToolSubmitResult> {
      let captured: ReturnType<typeof capturePreparedExecution>
      try {
        captured = capturePreparedExecution(supplied, parameters)
      } catch {
        return Promise.resolve({ kind: 'rejected', reason: 'invalidInput' })
      }
      if ('reason' in captured) return Promise.resolve(captured)
      const ref = { ...captured.request.scope, callId: captured.request.call.callId }
      return enqueueSubmission(captured.request, () => admitPrepared(captured)).then(result =>
        preparedOutcome(ref, result),
      )
    },
    async idle() {
      await Promise.all([...tasks])
      if (faults.size) throw new AggregateError([...faults], 'execution owner task failed')
    },
    close(): Promise<void> {
      if (closing) return closing
      open = false
      for (const job of owned.values()) job.environmentClosed.abort('owner_closed')
      for (const observer of observers) observer.release()
      for (const wakes of listeners.values()) for (const wake of wakes) wake()
      const task = (async () => {
        for (const job of owned.values()) await closeExecution(job)
        await Promise.all([...tasks])
        for (const job of owned.values()) {
          if (!(await release(job)))
            throw new Error('execution owner retains an environment cleanup obligation')
        }
        if (faults.size) throw new AggregateError([...faults], 'execution owner task failed')
        await input.journal.close()
        owned.forEach(job => job.resolveStopped())
      })()
      closing = task
      void task.catch(() => {
        closing = undefined
      })
      return task
    },
  })
}
