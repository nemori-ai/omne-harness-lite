// The observation double: an in-memory `ModelStreamObservation` whose streams the test publishes
// and advances by hand. Each stream is keyed by its `StreamRef`; the public position advances on
// every confirmed snapshot, state-only changes included. Frames follow the common observation
// contract of stream-arrival: a snapshot first, then one delta per confirmed change, then one
// terminal frame, an end or a buffer gap. Nothing here is persistent and nothing proves a real
// producer.
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
import { frozenCopy } from './values.ts'

export type ScriptedStreamObservationOptions = Readonly<{
  /**
   * How many frames one observer may leave untaken. A frame beyond it removes the subscription,
   * drops the untaken frames and ends the observer with a buffer gap after its last taken frame.
   */
  capacity?: number
}>

export type ScriptedStreamObservation<P> = Readonly<{
  observation: ModelStreamObservation<P>
  /** The first confirmed snapshot of a new stream; returns the cursor of the stream's position. */
  publish(input: Readonly<{ tenant: TenantId; snapshot: ModelStreamSnapshot }>): StreamCursor
  /** The next confirmed snapshot of the stream named by `snapshot.ref`; open observers get a delta. */
  advance(input: Readonly<{ tenant: TenantId; snapshot: ModelStreamSnapshot }>): StreamCursor
  /** The stream ends: open observers end with `reason`, and a later observe ends the same way. */
  end(input: Readonly<{ ref: StreamRef; reason: 'source-closed' | 'stale-stream' }>): void
  /** The control plane for `observe`; an access that was never set is denied. */
  setAccess(access: Access<P>, decision: ScriptedAccessDecision): void
  /** How many observations of the stream are open: begun and neither ended nor closed. */
  openObservations(ref: StreamRef): number
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

/** One observation. `status` is its life: not begun, subscribed, holding its terminal, or closed. */
type Observer<P> = {
  readonly request: Request<P>
  /** The stream the request names, once a qualification found it. */
  stream: Stream<P> | null
  status: 'new' | 'open' | 'terminal' | 'closed'
  queue: Body[]
  /** The cursor of the last snapshot or delta handed to this observer. */
  lastDelivered: StreamCursor | null
  terminal: Terminal | null
  readonly pending: ((result: IteratorResult<Frame>) => void)[]
  readonly onAbort: () => void
}

function ended(reason: EndReason): Ended {
  return { kind: 'ended', reason }
}

/**
 * The end that a reference failure gives before the control plane is asked: an unminted or
 * foreign tenant is denied, an unreadable envelope is stale. The other kinds wait for the control
 * plane, so they do not tell a denied observer anything.
 */
function endBeforeControl(failure: StreamReferenceFailure): Ended | null {
  switch (failure.kind) {
    case 'invalid-tenant':
    case 'foreign-tenant':
      return ended('denied')
    case 'invalid-envelope':
      return ended('stale-stream')
    case 'wrong-producer':
    case 'malformed':
      return null
  }
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

  /** The canonical reference of a snapshot the test confirms, or a misuse. */
  function confirmedRef(tenant: TenantId, snapshot: ModelStreamSnapshot): StreamRef {
    const judged = judgeStreamRef({ value: snapshot.ref, tenant }, modelStreamCodec)
    if ('failure' in judged || judged.ok !== snapshot.ref)
      throw misuse('the snapshot reference is not a canonical Model stream of this tenant')
    return judged.ok
  }

  /**
   * The checks before any frame goes out, in the order of the common contract: tenant and
   * reference first, then the control plane, then the stream. Null means the frame may go.
   */
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

  /**
   * The disclosure check of a terminal frame the observer holds: denied and unavailable take its
   * place, any other end keeps it, so a later end of the stream cannot replace a held gap.
   */
  function disclose(observer: Observer<P>, terminal: Terminal): Terminal {
    const failure = qualify(observer)
    if (failure !== null && (failure.reason === 'denied' || failure.reason === 'unavailable'))
      return failure
    return terminal
  }

  /** The last check: the stream the reference names must be published and not ended. */
  function endOfStream(observer: Observer<P>, ref: StreamRef): Ended | null {
    const stream = streams.get(ref)
    if (stream === undefined) return ended('stale-stream')
    if (stream.ended !== null) return ended(stream.ended)
    observer.stream = stream
    return null
  }

  function detach(observer: Observer<P>): void {
    observer.queue = []
    observer.stream?.observers.delete(observer)
  }

  function terminate(observer: Observer<P>, terminal: Terminal): void {
    if (observer.status === 'closed' || observer.status === 'terminal') return
    detach(observer)
    observer.status = 'terminal'
    observer.terminal = terminal
  }

  function close(observer: Observer<P>): void {
    detach(observer)
    observer.status = 'closed'
    observer.terminal = null
    observer.request.signal.removeEventListener('abort', observer.onAbort)
    for (const resolve of observer.pending.splice(0)) resolve({ done: true, value: undefined })
  }

  /** Hands queued frames to waiting readers; every actual output repeats the checks. */
  function flush(observer: Observer<P>): void {
    while (observer.pending.length > 0 && observer.status !== 'closed') {
      if (observer.status === 'open') {
        const failure = qualify(observer)
        if (failure !== null) terminate(observer, failure)
      }
      if (observer.status === 'terminal') {
        const terminal = observer.terminal
        if (terminal === null) throw new Error('a terminal observer holds no terminal frame')
        observer.pending.shift()?.({ done: false, value: frozenCopy(disclose(observer, terminal)) })
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

  /** Takes the confirmed snapshot and registers the subscription in one synchronous section. */
  function begin(observer: Observer<P>): void {
    const failure = qualify(observer)
    if (failure !== null) {
      terminate(observer, failure)
      return
    }
    const stream = observer.stream
    if (stream === null) throw new Error('a qualified observer has no stream')
    enqueue(observer, { kind: 'snapshot', cursor: stream.cursor, value: stream.snapshot })
    if (observer.terminal === null) {
      observer.status = 'open'
      stream.observers.add(observer)
    }
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
            status: 'new',
            queue: [],
            lastDelivered: null,
            terminal: null,
            pending: [],
            onAbort() {
              if (observer.status === 'closed') return
              terminate(observer, ended('observer-closed'))
              flush(observer)
            },
          }
          return {
            next() {
              if (observer.status === 'closed')
                return Promise.resolve({ done: true, value: undefined } as const)
              return new Promise<IteratorResult<Frame>>(resolve => {
                observer.pending.push(resolve)
                if (observer.status === 'new') {
                  observer.request.signal.addEventListener('abort', observer.onAbort, {
                    once: true,
                  })
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
      if (streams.has(ref)) throw misuse('the stream is already published')
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
      streams.set(ref, stream)
      return stream.cursor
    },
    advance({ tenant, snapshot }) {
      const ref = confirmedRef(tenant, snapshot)
      const stream = streams.get(ref)
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
    end({ ref, reason }) {
      const stream = streams.get(ref)
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
    openObservations(ref) {
      return streams.get(ref)?.observers.size ?? 0
    },
  }
}
