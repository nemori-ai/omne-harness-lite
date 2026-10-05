import { copyJsonValue, type JsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import type { RuntimeContextOperations } from '@omne-harness-lite/runtime-context'
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
} from '@omne-harness-lite/tool-execution-runtime'
import { createExecutionContextReader } from './execution-context.ts'
import { createExecutionObserver } from './execution-observer.ts'
import type { PreparedTerminal } from './execution-result.ts'
import { createTerminalCommitter } from './execution-terminal.ts'
import { jsonObject, sameJson } from './json-values.ts'
import type { createRuntimeJournal } from './runtime-journal.ts'
import { captureSubmission, createSubmissionAdmission, submissionIdentity } from './submission.ts'

type Journal = ReturnType<typeof createRuntimeJournal>
interface OwnedExecution {
  readonly request: ExecutionSubmission
  readonly ref: ExecutionRef
  readonly acceptedAt: string
  readonly chain: JsonValue
  readonly pass: string
  readonly controller: AbortController
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
}
function ownRef(supplied: ExecutionRef): ExecutionRef | undefined {
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

/** Private execution owner. Construction ports stay inside the provider; none are plugin config. */
export function createExecutionOwner(input: {
  readonly journal: Journal
  readonly authorization: SessionAccessOperations
  readonly admission: () => ToolAdmissionOperations | undefined
  readonly implementations: ToolImplementationOperations
  readonly context: Pick<RuntimeContextOperations, 'bind'>
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
  /** Capture the actual chain before intent. An unavailable source must not become an empty chain. */
  readonly selectChain: (
    request: ExecutionSubmission,
    selected?: SelectedTool,
  ) => Promise<{ readonly chain: JsonValue; readonly pass: string } | 'unavailable'>
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
  const owned = new Map<string, OwnedExecution>(),
    submissions = new Map<string, Promise<unknown>>(),
    listeners = new Map<string, Set<() => void>>(),
    tasks = new Set<Promise<unknown>>(),
    faults = new Set<unknown>(),
    observers = new Set<ExecutionObserver>()
  let open = true,
    closing: Promise<void> | undefined
  const terminal = createTerminalCommitter(input)
  const check = createSubmissionAdmission({ ...input, isOpen: () => open })
  function notify(ref: ExecutionRef) {
    for (const wake of listeners.get(keyOf(ref)) ?? []) wake()
  }
  function release(job: OwnedExecution) {
    if (!job.released) {
      job.released = true
      job.lease?.release()
    }
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
      const view = await input.journal.read(scopeOf(ref), ref.callId)
      const after = await authorize(access, ref, 'tool.read')
      if (!open) return rejected('ownerStopped')
      if (after) return rejected(after)
      if (view.kind !== 'view') return rejected('runtimeUnavailable')
      const history = view.executions.get(ref.callId)
      if (!history) return rejected('notFound')
      const intent = history.intent.value
      return {
        kind: 'found',
        snapshot: {
          ref,
          origin: intent.origin,
          ...(intent.selected ? { selected: intent.selected } : {}),
          adoptedContext: history.contextReads.flatMap(record => record.value.values),
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
        },
      }
    } catch {
      return rejected(open ? 'runtimeUnavailable' : 'ownerStopped')
    }
  }
  function end(job: OwnedExecution, result: ExecutionTerminal) {
    const task = job.ending.then(async () => {
      const current = await input.journal.read(scopeOf(job.ref), job.ref.callId)
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
      const view = await input.journal.read(scopeOf(job.ref), job.ref.callId)
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
  async function run(job: OwnedExecution): Promise<void> {
    let removeInvalidation: (() => void) | undefined
    try {
      if (job.result) {
        await end(job, job.result)
        return
      }
      // The current increment runs pure closures. Missing resolved dependencies must never use declaration defaults.
      if (
        job.selected &&
        (job.selected.definition.settings !== undefined ||
          (job.selected.definition.needs?.attachmentStorage !== undefined && !input.bindWriter) ||
          (job.selected.definition.needs?.externalServices?.length ?? 0) > 0)
      ) {
        await end(job, { outcome: 'unavailable', reason: 'execution_dependencies_unavailable' })
        return
      }
      if (
        job.notExecutable ||
        job.unavailable ||
        !job.lease ||
        !job.selected ||
        job.request.call.unparseable
      ) {
        await end(
          job,
          job.notExecutable === 'unparseable'
            ? { outcome: 'failed', code: 'unparseable' }
            : { outcome: 'unavailable', reason: job.unavailable ?? 'no_such_entry' },
        )
        return
      }
      const bound = await input.context.bind(job.request.access, job.request.scope, 'tool')
      if (bound.kind !== 'bound') {
        await end(job, { outcome: 'unavailable', reason: 'context_unavailable' })
        return
      }
      if (input.bindWriter && !job.writer) {
        const writer = await input.bindWriter(job.request, job.selected)
        if (writer === 'unavailable') {
          await end(job, { outcome: 'unavailable', reason: 'result_storage_unavailable' })
          return
        }
        job.writer = writer
      }
      let started = false
      for (let attempt = 0; attempt < input.attempts; attempt++) {
        const view = await input.journal.read(job.request.scope, job.ref.callId)
        if (view.kind !== 'view') return
        const history = view.executions.get(job.ref.callId)
        if (!history || history.terminal) return
        if (history.started) {
          started = true
          break
        }
        if (!open || job.controller.signal.aborted) return
        const at = input.clock.now()
        if (at === 'unavailable') return
        const committed = await input.journal.commit({
          ref: job.ref,
          origin: job.request.origin,
          expected: view.prefix,
          values: [
            { kind: 'execution_started', revision: 1, ref: job.ref, at: instantToRfc3339(at) },
          ],
        })
        if (committed.kind === 'view') {
          started = true
          notify(job.ref)
          break
        }
        if (committed.reason !== 'tailChanged') {
          notify(job.ref)
          return
        }
        await input.retry?.(attempt)
      }
      if (!started || !open || job.controller.signal.aborted || job.entered) return
      const invalidated = job.lease.implementation.invalidated
      const invalidate = async () => {
        const outcome = await end(job, {
          outcome: 'unavailable',
          reason: 'implementation_invalidated',
        })
        if (outcome !== 'unavailable') job.controller.abort('implementation_invalidated')
      }
      if (invalidated?.aborted) {
        await invalidate()
        return
      }
      if (invalidated) {
        const listener = () => {
          void track(invalidate())
        }
        invalidated.addEventListener('abort', listener, { once: true })
        removeInvalidation = () => invalidated.removeEventListener('abort', listener)
      }
      job.entered = true
      const context = createExecutionContextReader({
        ref: job.ref,
        origin: job.request.origin,
        reader: bound.reader,
        journal: input.journal,
        isOpen: () => open && !job.controller.signal.aborted,
        attempts: input.attempts,
      })
      const result = await input.invoke(
        {
          definition: job.selected.definition,
          args: job.request.call.arguments,
          executor: job.lease.implementation.executor,
        },
        {
          context,
          ...(job.writer && job.selected.definition.needs?.attachmentStorage
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
    } finally {
      removeInvalidation?.()
      // A lost start receipt retains the captured implementation until recognition or confirmed termination.
      if (job.entered) release(job)
      else {
        const view = await input.journal.read(job.request.scope, job.ref.callId)
        if (view.kind === 'view' && view.executions.get(job.ref.callId)?.terminal) release(job)
      }
    }
  }
  function launch(job: OwnedExecution) {
    if (job.task || (job.entered && !job.result)) return
    const task = track(run(job))
    job.task = task
    void task.then(
      () => {
        if (job.task === task) delete job.task
      },
      () => {
        if (job.task === task) delete job.task
      },
    )
    // Reentry may finish a retained terminal or recognize a lost start receipt. It never invokes twice.
  }
  async function submit(supplied: ExecutionSubmission): Promise<SubmissionResult> {
    for (let attempt = 0; attempt < input.attempts; attempt++) {
      const decision = await check(supplied)
      if (decision.kind === 'rejected') return decision
      const request = decision.request,
        ref: ExecutionRef = { ...request.scope, callId: request.call.callId }
      if (decision.kind === 'existing') {
        const job = owned.get(keyOf(ref))
        if (job) launch(job)
        return { kind: 'recorded', execution: ref }
      }
      const selected = await input.selectChain(request, decision.selected)
      if (selected === 'unavailable') return { kind: 'rejected', reason: 'runtimeUnavailable' }
      const captured = copyJsonValue(selected)
      if (
        'failed' in captured ||
        !jsonObject(captured.ok) ||
        Object.keys(captured.ok).length !== 2 ||
        !Object.hasOwn(captured.ok, 'chain') ||
        !('ok' in parseOpaqueIdentifier(captured.ok.pass, 'PassId'))
      )
        return { kind: 'rejected', reason: 'runtimeUnavailable' }
      const now = input.clock.now(),
        assembly = start({ kind: 'tool_execution', callId: ref.callId })
      if (now === 'unavailable' || 'rejected' in assembly || !open)
        return { kind: 'rejected', reason: open ? 'runtimeUnavailable' : 'ownerStopped' }
      const acquired = decision.selected
        ? input.implementations.acquire(decision.selected)
        : undefined
      const lease = acquired && 'implementation' in acquired ? acquired : undefined
      // Chain/context sources may await IO. Recheck current authorization and the official locator before intent.
      const rechecked = await check(request)
      if (rechecked.kind === 'rejected') {
        lease?.release()
        return rechecked
      }
      if (rechecked.kind === 'existing') {
        lease?.release()
        return { kind: 'recorded', execution: ref }
      }
      if (
        !sameJson(rechecked.view.prefix, decision.view.prefix) ||
        !sameJson(rechecked.selected ?? null, decision.selected ?? null)
      ) {
        lease?.release()
        continue
      }
      const job: OwnedExecution = {
        request,
        ref,
        acceptedAt: instantToRfc3339(now),
        chain: captured.ok.chain!,
        pass: captured.ok.pass as string,
        controller: new AbortController(),
        assembly: assembly.ok,
        entered: false,
        released: false,
        ending: Promise.resolve(),
        frameBytes: 0,
        ...(lease ? { lease } : {}),
        ...(decision.selected ? { selected: decision.selected } : {}),
        ...(decision.notExecutable ? { notExecutable: decision.notExecutable } : {}),
        ...(acquired && 'kind' in acquired ? { unavailable: acquired.kind } : {}),
      }
      // Retain continuity before an append whose receipt can be lost.
      owned.set(keyOf(ref), job)
      const committed = await input.journal.commit({
        ref,
        origin: request.origin,
        expected: decision.view.prefix,
        values: [
          {
            kind: 'execution_intended',
            revision: 1,
            ref,
            origin: request.origin,
            ...(job.selected ? { selected: job.selected } : {}),
            input: {
              format: 'tool-input/1',
              submission: submissionIdentity(request),
              acceptedAt: job.acceptedAt,
              chain: job.chain,
              pass: job.pass,
            } as unknown as JsonValue,
          },
        ],
      })
      if (committed.kind === 'view') {
        launch(job)
        return { kind: 'recorded', execution: ref }
      }
      if (committed.reason !== 'tailChanged')
        return { kind: 'rejected', reason: 'runtimeUnavailable' }
      owned.delete(keyOf(ref))
      lease?.release()
      await input.retry?.(attempt)
      // Do not upgrade the checked admission tail. A conflict restarts the complete admission guard.
    }
    return { kind: 'rejected', reason: 'runtimeUnavailable' }
  }
  const operations = Object.freeze({
    submit(supplied) {
      let captured: ReturnType<typeof captureSubmission>
      try {
        captured = captureSubmission(supplied)
      } catch {
        return Promise.resolve({ kind: 'rejected', reason: 'invalidInput' })
      }
      if ('reason' in captured) return Promise.resolve(captured)
      const request = captured,
        key = JSON.stringify([
          request.scope.tenant.organization,
          request.scope.tenant.account,
          request.scope.session,
        ])
      const task = track(
        (submissions.get(key) ?? Promise.resolve()).then(async (): Promise<SubmissionResult> => {
          try {
            return await submit(request)
          } catch (error) {
            faults.add(error)
            return { kind: 'rejected', reason: open ? 'runtimeUnavailable' : 'ownerStopped' }
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
    },
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
        const view = await input.journal.read(scopeOf(ref), ref.callId)
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
    async idle() {
      await Promise.all([...tasks])
      if (faults.size) throw new AggregateError([...faults], 'execution owner task failed')
    },
    close(): Promise<void> {
      if (closing) return closing
      open = false
      for (const observer of observers) observer.release()
      for (const wakes of listeners.values()) for (const wake of wakes) wake()
      const task = (async () => {
        for (const job of owned.values()) {
          const view = await input.journal.read(job.request.scope, job.ref.callId)
          if (view.kind !== 'view') throw new Error('execution owner retains unresolved writes')
          if (view.executions.has(job.ref.callId)) {
            const result = await end(job, { outcome: 'failed', code: 'abnormal_interruption' })
            if (result === 'unavailable')
              throw new Error('execution owner retains a terminal obligation')
          }
          job.controller.abort('owner_closed')
        }
        await Promise.all([...tasks])
        for (const job of owned.values()) release(job)
        if (faults.size) throw new AggregateError([...faults], 'execution owner task failed')
        await input.journal.close()
      })()
      closing = task
      void task.catch(() => {
        closing = undefined
      })
      return task
    },
  })
}
