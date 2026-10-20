import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  type CallAccess,
  type FactBatch,
  type ToolFailure,
  type ToolInstanceId,
  type ToolLiveExecution,
  type ToolOperationId,
  type ToolRecovery,
  type ToolStartRecord,
  type ToolTask,
} from '@omne-harness/tool-contract'
import { tenantKey } from './boundary.ts'
import type { ToolDependencies } from './construction.ts'
import type { createBindingInvoker } from './driver-binding.ts'
import type { DriverStop } from './driver.ts'
import { factTaskOperation } from './evidence.ts'
import { isExcludedFailure } from './ledger-exclusion.ts'

type Step<P> = CallAccess<P> & Readonly<{ instance: ToolInstanceId; signal: AbortSignal }>
type Result = DriverStop | Readonly<{ kind: 'continue'; progressed: boolean }>
type Ready<B extends ContentBlock> =
  | Readonly<{ kind: 'batch'; batch: FactBatch<B> }>
  | Readonly<{ kind: 'ended' }>
  | Readonly<{ kind: 'failed' }>
type SessionKey = Readonly<{ call: string; start: ToolOperationId }>
type Session<P, B extends ContentBlock> = {
  controller: AbortController
  signal: AbortSignal
  detach: () => void
  iterator: AsyncIterator<FactBatch<B>>
  next: Promise<void> | null
  ready: Ready<B> | null
  closing: Promise<void> | null
  resume: Step<P> | null
}

const idle: DriverStop = { kind: 'idle' }
const aborted = (): DriverStop => ({ kind: 'blocked', diagnostic: 'the run was aborted' })
const sourceFailure = (): ToolFailure => ({
  kind: 'unavailable',
  dependency: 'tool-facts',
  diagnostic: 'the original facts source is unavailable',
})
const sourceVerdict = (failure: ToolFailure): ToolFailure =>
  failure.kind === 'unavailable' ? sourceFailure() : failure
const unavailable = (): Outcome<never, ToolFailure> => fail(sourceFailure())

export function createFactDriver<P, B extends ContentBlock, E>(
  { commands }: Pick<ToolDependencies<P, B, E>, 'commands'>,
  binding: ReturnType<typeof createBindingInvoker<P, B, E>>,
  wake: (step: Step<P>, delayed: boolean) => void,
) {
  const sessions = new Map<string, Map<ToolOperationId, Session<P, B>>>()
  const callKey = (step: CallAccess<P>) => JSON.stringify([tenantKey(step.tenant), step.call])
  const keyOf = (step: CallAccess<P>, start: ToolStartRecord): SessionKey => ({
    call: callKey(step),
    start: start.operation,
  })

  const signalsForRun = (step: Step<P>): readonly AbortSignal[] => {
    const active = [...(sessions.get(callKey(step))?.values() ?? [])]
      .filter(session => session.closing === null)
      .map(session => session.signal)
    return [...new Set([step.signal, ...active])]
  }

  const close = (key: SessionKey, session: Session<P, B>): void => {
    if (session.closing !== null) return
    session.detach()
    session.controller.abort()
    session.ready = null
    const returned = Promise.resolve()
      .then(() => session.iterator.return?.())
      .then(
        () => undefined,
        () => undefined,
      )
    session.closing = Promise.all([session.next, returned]).then(() => {
      const streams = sessions.get(key.call)
      if (streams?.get(key.start) === session) {
        streams.delete(key.start)
        if (streams.size === 0) sessions.delete(key.call)
      }
      const resume = session.resume
      if (resume !== null && !resume.signal.aborted) wake(resume, false)
    })
  }

  const listen = (key: SessionKey, session: Session<P, B>, step: Step<P>): void => {
    session.detach()
    session.signal = step.signal
    const abort = () => close(key, session)
    session.detach = () => step.signal.removeEventListener('abort', abort)
    if (step.signal.aborted) {
      close(key, session)
      return
    }
    step.signal.addEventListener('abort', abort, { once: true })
    if (step.signal.aborted) {
      session.detach()
      close(key, session)
    }
  }

  const read = (session: Session<P, B>, step: Step<P>): void => {
    if (
      step.signal.aborted ||
      session.closing !== null ||
      session.next !== null ||
      session.ready !== null
    )
      return
    session.next = Promise.resolve()
      .then(() => {
        if (step.signal.aborted || session.controller.signal.aborted) return null
        return session.iterator.next()
      })
      .then(
        result => {
          if (session.closing !== null || session.controller.signal.aborted || result === null)
            return
          session.ready = result.done ? { kind: 'ended' } : { kind: 'batch', batch: result.value }
          if (!session.signal.aborted) wake({ ...step, signal: session.signal }, false)
        },
        () => {
          if (session.closing !== null || session.controller.signal.aborted) return
          session.ready = { kind: 'failed' }
          if (!session.signal.aborted) wake({ ...step, signal: session.signal }, false)
        },
      )
      .then(() => {
        session.next = null
      })
  }

  const liveOf = async (
    step: Step<P>,
    start: ToolStartRecord,
  ): Promise<Outcome<ToolLiveExecution<B>, ToolFailure>> => {
    const live = binding.live(step, start)
    if (live !== undefined) return { ok: live }
    try {
      const recovered = await binding.recover(step, start)
      if ('failure' in recovered) return fail(sourceVerdict(recovered.failure))
      if (step.signal.aborted) return unavailable()
      const inspected = await recovered.ok.inspectStart(start)
      if ('failure' in inspected) return fail(sourceVerdict(inspected.failure))
      if (inspected.ok.kind === 'live') return { ok: inspected.ok.execution }
      if (inspected.ok.kind === 'settled')
        return fail({
          kind: 'unsupported',
          adoption: start.executor,
          reason: 'settled-start-facts-recovery-needs-original-batch-and-cursor',
        })
      return unavailable()
    } catch {
      return unavailable()
    }
  }

  const receive = async (
    step: Step<P>,
    recovery: ToolRecovery<B>,
    cancelled: () => boolean,
  ): Promise<Result> => {
    const start = recovery.start
    if (start === null) return { kind: 'blocked', diagnostic: 'a facts task has no original start' }
    if (cancelled()) return aborted()
    const key = keyOf(step, start)
    let session = sessions.get(key.call)?.get(key.start)
    if (session !== undefined && session.closing !== null) {
      session.resume = step
      return idle
    }
    if (session === undefined) {
      const live = await liveOf(step, start)
      if (cancelled()) return aborted()
      if ('failure' in live) return { kind: 'failed', failure: live.failure }
      const controller = new AbortController()
      try {
        const cursor =
          recovery.streams.find(stream => stream.start.operation === start.operation)?.cursor ??
          null
        const iterator = live.ok
          .facts({ after: cursor, signal: controller.signal })
          [Symbol.asyncIterator]()
        session = {
          controller,
          signal: step.signal,
          detach: () => undefined,
          iterator,
          next: null,
          ready: null,
          closing: null,
          resume: null,
        }
        const streams = sessions.get(key.call) ?? new Map<ToolOperationId, Session<P, B>>()
        streams.set(key.start, session)
        sessions.set(key.call, streams)
        listen(key, session, step)
      } catch {
        controller.abort()
        return { kind: 'failed', failure: sourceFailure() }
      }
    }
    if (cancelled()) return aborted()
    const ready = session.ready
    if (ready === null) {
      read(session, step)
      return idle
    }
    if (ready.kind !== 'batch') {
      session.resume = null
      close(key, session)
      void session.closing?.then(() => {
        if (!session.signal.aborted && !step.signal.aborted)
          wake({ ...step, signal: session.signal }, true)
      })
      return idle
    }
    const received = await commands.receiveFacts({
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      start,
      batch: ready.batch,
    })
    if ('failure' in received) {
      if (
        received.failure.kind !== 'unavailable' &&
        received.failure.kind !== 'commit-unknown' &&
        received.failure.kind !== 'stale-revision'
      )
        close(key, session)
      return { kind: 'failed', failure: received.failure }
    }
    session.ready = null
    return { kind: 'continue', progressed: true }
  }

  const acknowledge = async (
    step: Step<P>,
    task: Extract<ToolTask, { kind: 'fact-ack' }>,
    cancelled: () => boolean,
  ): Promise<Result> => {
    if (cancelled()) return aborted()
    try {
      const live = binding.live(step, task.start)
      const recovered = live === undefined ? await binding.recover(step, task.start) : { ok: live }
      if (cancelled()) return aborted()
      if ('failure' in recovered)
        return { kind: 'failed', failure: sourceVerdict(recovered.failure) }
      const confirmed = await recovered.ok.acknowledge(task.receipt)
      if (cancelled()) return aborted()
      if ('failure' in confirmed)
        return { kind: 'failed', failure: sourceVerdict(confirmed.failure) }
      const operation = factTaskOperation('fact-ack', {
        kind: 'record-fact-acknowledgement',
        start: task.start,
        receipt: task.receipt,
      })
      const recorded = await commands.recordFactAcknowledgement({
        principal: step.principal,
        tenant: step.tenant,
        call: step.call,
        operation,
        receipt: task.receipt,
        sourceReceipt: confirmed.ok,
      })
      if ('ok' in recorded) return { kind: 'continue', progressed: true }
      if (
        recorded.failure.kind === 'commit-unknown' ||
        recorded.failure.kind === 'stale-revision' ||
        isExcludedFailure(recorded.failure)
      )
        return { kind: 'continue', progressed: false }
      return { kind: 'failed', failure: recorded.failure }
    } catch {
      return { kind: 'failed', failure: sourceFailure() }
    }
  }

  return { receive, acknowledge, signalsForRun }
}
