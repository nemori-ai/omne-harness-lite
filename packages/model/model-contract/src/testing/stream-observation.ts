import type { Access, TenantId } from '@omne-harness/legal-identity'
import {
  decodeStreamPosition,
  encodeStreamCursor,
  judgeStreamRef,
  type StreamCursor,
  type StreamFrame,
  type StreamRef,
  type StreamReferenceFailure,
} from '@omne-harness/stream-arrival'
import type { ModelStreamDelta, ModelStreamObservation, ModelStreamSnapshot } from '../index.ts'
import { diffModelStream } from '../model-stream-values.ts'
import { createAccessRules, type ScriptedAccessDecision } from './access.ts'
import { misuse } from './error.ts'
import { modelStreamCodec } from './stream-codec.ts'
import { frozenCopy, tenantText } from './values.ts'

export type ScriptedStreamObservationOptions = Readonly<{
  capacity?: number
}>

export type ScriptedStreamObservation<P> = Readonly<{
  observation: ModelStreamObservation<P>
  publish(input: Readonly<{ tenant: TenantId; snapshot: ModelStreamSnapshot }>): StreamCursor
  advance(input: Readonly<{ tenant: TenantId; snapshot: ModelStreamSnapshot }>): StreamCursor
  end(
    input: Readonly<{
      tenant: TenantId
      ref: StreamRef
      reason: 'source-closed' | 'stale-stream'
    }>,
  ): void
  setAccess(access: Access<P>, decision: ScriptedAccessDecision): void
  openObservations(ref: StreamRef, tenant: TenantId): number
}>

type Frame = StreamFrame<ModelStreamSnapshot, ModelStreamDelta>
type Body = Extract<Frame, { kind: 'snapshot' | 'delta' }>
type Ended = Exclude<Extract<Frame, { kind: 'ended' }>, { reason: 'producer-ended' }>
type EndReason = Ended['reason']
type Terminal = Ended | Readonly<{ kind: 'gap'; after: StreamCursor | null; reason: 'buffer' }>
type Request<P> = Parameters<ModelStreamObservation<P>['observe']>[0]

type Stream<P> = {
  readonly ref: StreamRef
  position: number
  cursor: StreamCursor
  snapshot: ModelStreamSnapshot
  ended: EndReason | null
  readonly observers: Set<Observer<P>>
}

type Phase =
  | Readonly<{ kind: 'new' }>
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'terminal'; frame: Terminal }>
  | Readonly<{ kind: 'closed' }>

type Observer<P> = {
  readonly request: Request<P>
  stream: Stream<P> | null
  phase: Phase
  queue: Body[]
  lastDelivered: StreamCursor | null
  readonly pending: ((result: IteratorResult<Frame>) => void)[]
  readonly onAbort: () => void
}

function ended(reason: EndReason): Ended {
  return { kind: 'ended', reason }
}

function endBeforeControl(failure: StreamReferenceFailure): Ended | null {
  switch (failure.kind) {
    case 'invalid-tenant':
      return ended('denied')
    case 'invalid-envelope':
      return ended('stale-stream')
    case 'wrong-producer':
    case 'malformed':
      return null
  }
}

function streamKey(tenant: TenantId, ref: StreamRef): string {
  return JSON.stringify([tenantText(tenant), ref])
}

function cursorOf(ref: StreamRef, position: number): StreamCursor {
  const decoded = decodeStreamPosition(String(position))
  if ('failure' in decoded) throw misuse('the stream position cannot be encoded')
  const cursor = encodeStreamCursor({ ref, position: decoded.ok })
  if ('failure' in cursor) throw misuse('the stream cursor cannot be encoded')
  return cursor.ok
}

export function createScriptedStreamObservation<P>(
  options: ScriptedStreamObservationOptions = {},
): ScriptedStreamObservation<P> {
  const capacity = options.capacity ?? null
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1))
    throw misuse('capacity must be a positive integer')
  const streams = new Map<string, Stream<P>>()
  const rules = createAccessRules<P>()

  function confirmedRef(tenant: TenantId, snapshot: ModelStreamSnapshot): StreamRef {
    const judged = judgeStreamRef({ value: snapshot.ref, tenant }, modelStreamCodec)
    if ('failure' in judged || judged.ok !== snapshot.ref)
      throw misuse('the snapshot reference is not a canonical Model stream of this tenant')
    return judged.ok
  }

  function qualify(observer: Observer<P>): Ended | null {
    const judged = judgeStreamRef(
      { value: observer.request.ref, tenant: observer.request.access.tenant },
      modelStreamCodec,
    )
    if ('failure' in judged) {
      const early = endBeforeControl(judged.failure)
      if (early !== null) return early
    }
    const decision = rules.decide(observer.request.access)
    if (decision !== 'allow') return ended(decision === 'deny' ? 'denied' : 'unavailable')
    return 'failure' in judged ? ended('stale-stream') : endOfStream(observer, judged.ok)
  }

  function disclose(observer: Observer<P>, terminal: Terminal): Terminal {
    const failure = qualify(observer)
    if (
      failure !== null &&
      (failure.reason === 'denied' ||
        failure.reason === 'unavailable' ||
        failure.reason === 'stale-stream')
    )
      return failure
    return terminal
  }

  function endOfStream(observer: Observer<P>, ref: StreamRef): Ended | null {
    const stream = streams.get(streamKey(observer.request.access.tenant, ref))
    if (stream === undefined) return ended('stale-stream')
    if (stream.ended !== null) return ended(stream.ended)
    observer.stream = stream
    return null
  }

  function detach(observer: Observer<P>): void {
    observer.queue = []
    observer.stream?.observers.delete(observer)
  }

  function terminate(observer: Observer<P>, frame: Terminal): void {
    detach(observer)
    observer.phase = { kind: 'terminal', frame }
  }

  function close(observer: Observer<P>): void {
    detach(observer)
    observer.phase = { kind: 'closed' }
    observer.request.signal.removeEventListener('abort', observer.onAbort)
    for (const resolve of observer.pending.splice(0)) resolve({ done: true, value: undefined })
  }

  function flush(observer: Observer<P>): void {
    while (observer.pending.length > 0) {
      const { phase } = observer
      if (phase.kind === 'terminal') {
        const frame = disclose(observer, phase.frame)
        observer.pending.shift()?.({ done: false, value: frozenCopy(frame) })
        close(observer)
        return
      }
      const frame = observer.queue.shift()
      if (frame === undefined) return
      observer.lastDelivered = frame.cursor
      observer.pending.shift()?.({ done: false, value: frozenCopy(frame) })
    }
  }

  function enqueue(observer: Observer<P>, frame: Body): void {
    if (capacity !== null && observer.queue.length + 1 > capacity) {
      terminate(observer, { kind: 'gap', after: observer.lastDelivered, reason: 'buffer' })
      return
    }
    observer.queue.push(frame)
  }

  function begin(observer: Observer<P>): void {
    const failure = qualify(observer)
    if (failure !== null) {
      terminate(observer, failure)
      return
    }
    const stream = observer.stream
    if (stream === null) throw new Error('a qualified observer has no stream')
    enqueue(observer, { kind: 'snapshot', cursor: stream.cursor, value: stream.snapshot })
    observer.phase = { kind: 'open' }
    stream.observers.add(observer)
  }

  function refresh(): void {
    for (const stream of streams.values())
      for (const observer of stream.observers) {
        const failure = qualify(observer)
        if (failure !== null) terminate(observer, failure)
        flush(observer)
      }
  }

  const observation: ModelStreamObservation<P> = {
    observe(request) {
      return {
        [Symbol.asyncIterator]() {
          const observer: Observer<P> = {
            request: {
              ref: request.ref,
              access: { tenant: request.access.tenant, principal: request.access.principal },
              signal: request.signal,
            },
            stream: null,
            phase: { kind: 'new' },
            queue: [],
            lastDelivered: null,
            pending: [],
            onAbort() {
              terminate(observer, ended('observer-closed'))
              flush(observer)
            },
          }
          return {
            next() {
              if (observer.phase.kind === 'closed')
                return Promise.resolve({ done: true, value: undefined } as const)
              return new Promise<IteratorResult<Frame>>(resolve => {
                observer.pending.push(resolve)
                if (observer.phase.kind === 'new') {
                  observer.request.signal.addEventListener('abort', observer.onAbort)
                  if (observer.request.signal.aborted) observer.onAbort()
                  else begin(observer)
                }
                flush(observer)
              })
            },
            return() {
              close(observer)
              return Promise.resolve({ done: true, value: undefined } as const)
            },
          }
        },
      }
    },
  }

  return {
    observation,
    publish({ tenant, snapshot }) {
      const ref = confirmedRef(tenant, snapshot)
      if (streams.has(streamKey(tenant, ref))) throw misuse('the stream is already published')
      const checked = diffModelStream({ tenant, before: snapshot, after: snapshot })
      if ('failure' in checked)
        throw misuse(`the snapshot is not a valid projection: ${JSON.stringify(checked.failure)}`)
      const position = 1
      const stream: Stream<P> = {
        ref,
        position,
        cursor: cursorOf(ref, position),
        snapshot: frozenCopy(snapshot),
        ended: null,
        observers: new Set(),
      }
      streams.set(streamKey(tenant, ref), stream)
      return stream.cursor
    },
    advance({ tenant, snapshot }) {
      const ref = confirmedRef(tenant, snapshot)
      const stream = streams.get(streamKey(tenant, ref))
      if (stream === undefined) throw misuse('the stream is not published')
      if (stream.ended !== null) throw misuse('the stream has ended')
      const delta = diffModelStream({ tenant, before: stream.snapshot, after: snapshot })
      if ('failure' in delta)
        throw misuse(`the snapshot does not follow the stream: ${JSON.stringify(delta.failure)}`)
      const from = stream.cursor
      stream.position += 1
      stream.cursor = cursorOf(ref, stream.position)
      stream.snapshot = frozenCopy(snapshot)
      for (const observer of stream.observers) {
        enqueue(observer, { kind: 'delta', from, cursor: stream.cursor, value: delta.ok })
        flush(observer)
      }
      return stream.cursor
    },
    end({ tenant, ref, reason }) {
      const stream = streams.get(streamKey(tenant, ref))
      if (stream === undefined) throw misuse('the stream is not published')
      if (stream.ended !== null) throw misuse('the stream has ended')
      stream.ended = reason
      for (const observer of stream.observers) {
        terminate(observer, ended(reason))
        flush(observer)
      }
    },
    setAccess(access, decision) {
      rules.set(access, decision)
      refresh()
    },
    openObservations(ref, tenant) {
      return streams.get(streamKey(tenant, ref))?.observers.size ?? 0
    },
  }
}
