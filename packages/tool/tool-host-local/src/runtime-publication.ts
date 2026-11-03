import { randomUUID } from 'node:crypto'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { canonicalDigest, type ToolAccessGuard, type ToolLedgerStore } from '@omne-harness/tool'
import {
  encodeToolInvocationRef,
  type ToolExecutionRef,
  type ToolStreamSnapshot,
  type ToolStreamDelta,
  type ToolStreamEnd,
} from '@omne-harness/tool-contract'
import {
  toolStreamCallCodec,
  type CallAccess,
  type ToolHandle,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import {
  decodeStreamId,
  decodeStreamPosition,
  encodeStreamRef,
  encodeStreamCursor,
  parseStreamEnvelope,
  type StreamFrame,
  type StreamCursor,
  type StreamRef,
} from '@omne-harness/stream-arrival'

type Frame = StreamFrame<ToolStreamSnapshot, ToolStreamDelta, ToolStreamEnd>
type End = Extract<Frame, { kind: 'ended' | 'gap' }>
type Subscriber = {
  queue: { frame: Frame; bytes: number; at: number }[]
  bytes: number
  end: End | null
  cursor: StreamCursor | null
  wake: () => void
  timer: ReturnType<typeof setTimeout> | null
}

function bytes(value: unknown): number {
  const ordered = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(ordered)
    if (item !== null && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, ordered(entry)]),
      )
    return item
  }
  return Buffer.byteLength(JSON.stringify(ordered(value)))
}

export function createRuntimePublication(
  input: Readonly<{
    execution: ToolExecutionRef
    access: ToolAccessGuard<unknown>
    store: ToolLedgerStore<ToolMessageContentBlock>
    capacity: number
    bufferBytes: number
    bufferFrames: number
    residenceMs: number
  }>,
) {
  const stream = decodeStreamId(`str_${randomUUID().replaceAll('-', '')}`)
  if ('failure' in stream) throw new TypeError('Invalid generated stream identity.')
  const subscriptions = new Set<Subscriber>()
  let latest: Extract<Frame, { kind: 'snapshot' }> | null = null
  let digest = ''
  let position = 0n
  let closed = false
  let closeReason: ToolStreamEnd['reason'] = 'closed'
  let currentRef: StreamRef | null = null
  let oversized = false
  let sourceUnavailable = false
  let refreshing: Promise<void> = Promise.resolve()

  function terminate(subscriber: Subscriber, end: End): void {
    if (subscriber.end !== null) return
    subscriber.queue = []
    subscriber.bytes = 0
    subscriber.end = end
    if (subscriber.timer !== null) clearTimeout(subscriber.timer)
    subscriber.timer = null
    subscriptions.delete(subscriber)
    subscriber.wake()
  }

  function close(reason: ToolStreamEnd['reason']): void {
    if (closed) return
    closed = true
    closeReason = reason
    for (const subscriber of subscriptions)
      terminate(subscriber, {
        kind: 'ended',
        reason: 'producer-ended',
        value: { reason },
      })
  }

  function expire(subscriber: Subscriber): void {
    subscriber.timer = null
    const first = subscriber.queue[0]
    if (first === undefined || subscriber.end !== null) return
    const remaining = input.residenceMs - (performance.now() - first.at)
    if (remaining <= 0) {
      terminate(subscriber, { kind: 'gap', after: subscriber.cursor, reason: 'buffer' })
      return
    }
    subscriber.timer = setTimeout(
      () => expire(subscriber),
      Math.min(Math.ceil(remaining), 2147483647),
    )
    subscriber.timer.unref()
  }

  function enqueue(subscriber: Subscriber, frame: Frame): void {
    if (subscriber.end !== null) return
    const size = bytes(frame)
    if (
      subscriber.queue.length >= input.bufferFrames ||
      subscriber.bytes + size > input.bufferBytes
    ) {
      terminate(subscriber, { kind: 'gap', after: subscriber.cursor, reason: 'buffer' })
      return
    }
    subscriber.queue.push({ frame, bytes: size, at: performance.now() })
    subscriber.bytes += size
    if (subscriber.timer === null) expire(subscriber)
    subscriber.wake()
  }

  const handle: ToolHandle<unknown> = {
    instance: input.execution.instance,
    generation: input.execution.generation,
    stream: stream.ok,
    observation: {
      observe(request) {
        const subscriber: Subscriber = {
          queue: [],
          bytes: 0,
          end: null,
          cursor: null,
          timer: null,
          wake() {},
        }
        let admitted = false
        const admit = () => {
          admitted = true
          if (subscriber.end !== null) return
          if (subscriptions.size >= input.capacity || oversized)
            subscriber.end = { kind: 'ended', reason: 'capacity' }
          else if (latest === null) subscriber.end = { kind: 'ended', reason: 'unavailable' }
          else {
            // Snapshot and subscription registration are one synchronous transition.
            enqueue(subscriber, latest)
            subscriptions.add(subscriber)
          }
        }
        let returned = false
        let finished = false
        const returning = Promise.withResolvers<IteratorResult<Frame>>()
        const detach = () => {
          request.signal.removeEventListener('abort', abort)
          subscriptions.delete(subscriber)
          subscriber.queue = []
          subscriber.bytes = 0
          if (subscriber.timer !== null) clearTimeout(subscriber.timer)
          subscriber.timer = null
          subscriber.wake()
        }
        const abort = () => {
          subscriber.end = null
          terminate(subscriber, { kind: 'ended', reason: 'observer-closed' })
        }
        request.signal.addEventListener('abort', abort, { once: true })
        const emit = (frame: Frame): IteratorResult<Frame> => {
          if (returned || finished) return { done: true, value: undefined }
          if (frame.kind === 'ended' || frame.kind === 'gap') {
            finished = true
            detach()
          }
          if (frame.kind === 'snapshot' || frame.kind === 'delta') subscriber.cursor = frame.cursor
          return { done: false, value: frame }
        }
        const next = async (): Promise<IteratorResult<Frame>> => {
          for (;;) {
            if (returned || finished) return { done: true, value: undefined }
            if (request.signal.aborted) abort()
            if (admitted && subscriber.queue.length === 0 && subscriber.end === null)
              await new Promise<void>(resolve => {
                subscriber.wake = resolve
              })
            if (returned) return { done: true, value: undefined }
            if (
              !tenantCodec.encode(request.access.tenant).ok ||
              !tenantEquals(request.access.tenant, input.execution.tenant)
            )
              return emit({ kind: 'ended', reason: 'denied' })
            if ('failure' in parseStreamEnvelope(request.ref))
              return emit({ kind: 'ended', reason: 'stale-stream' })
            let verdict
            try {
              verdict = await input.access.qualify({
                ...request.access,
                call: input.execution.call,
                action: 'read-process',
              })
            } catch {
              return emit({ kind: 'ended', reason: 'unavailable' })
            }
            if (
              !tenantEquals(request.access.tenant, input.execution.tenant) ||
              verdict.kind === 'denied'
            ) {
              return emit({ kind: 'ended', reason: 'denied' })
            }
            if (verdict.kind !== 'allowed') {
              return emit({ kind: 'ended', reason: 'unavailable' })
            }
            if (currentRef !== null && request.ref !== currentRef)
              return emit({ kind: 'ended', reason: 'stale-stream' })
            if (closed)
              return emit(
                admitted
                  ? (subscriber.end ?? {
                      kind: 'ended',
                      reason: 'producer-ended',
                      value: { reason: closeReason },
                    })
                  : { kind: 'ended', reason: 'stale-stream' },
              )
            if (sourceUnavailable) return emit({ kind: 'ended', reason: 'unavailable' })
            if (request.signal.aborted) abort()
            if (!admitted) admit()
            const queued = subscriber.queue[0]
            if (queued !== undefined && performance.now() - queued.at >= input.residenceMs)
              terminate(subscriber, { kind: 'gap', after: subscriber.cursor, reason: 'buffer' })
            if (subscriber.end !== null) return emit(subscriber.end)
            const next = subscriber.queue.shift()
            if (next === undefined) continue
            subscriber.bytes -= next.bytes
            return emit(next.frame)
          }
        }
        let tail: Promise<unknown> = Promise.resolve()
        const iterator: AsyncIterableIterator<Frame> = {
          [Symbol.asyncIterator]() {
            return this
          },
          next() {
            const result = tail.then(() => Promise.race([next(), returning.promise]))
            tail = result.catch(() => {
              finished = true
              detach()
            })
            return result
          },
          async return() {
            returned = true
            detach()
            const done: IteratorResult<Frame> = { done: true, value: undefined }
            returning.resolve(done)
            return done
          },
        }
        return iterator
      },
    },
  }

  return {
    handle,
    refresh(
      access: CallAccess<unknown>,
      admission: Parameters<typeof encodeToolInvocationRef>[0]['admission'],
    ): Promise<void> {
      const refresh = async () => {
        if (closed) return
        const read = await input.store.read({
          kind: 'call',
          tenant: input.execution.tenant,
          call: input.execution.call,
        })
        if (closed) return
        sourceUnavailable = read.kind !== 'complete'
        if (read.kind !== 'complete') {
          for (const subscriber of subscriptions)
            terminate(subscriber, { kind: 'ended', reason: 'unavailable' })
          return
        }
        const record = read.records.find(row => row.kind === 'call')
        if (
          record?.kind !== 'call' ||
          record.call.call !== access.call ||
          record.call.admission !== admission ||
          canonicalDigest(record.call.tenant) !== canonicalDigest(access.tenant)
        ) {
          sourceUnavailable = true
          for (const subscriber of subscriptions)
            terminate(subscriber, { kind: 'ended', reason: 'unavailable' })
          return
        }
        if (canonicalDigest(record.call.execution) !== canonicalDigest(input.execution)) {
          close('stale-instance')
          return
        }
        const process = read.records
          .flatMap(row =>
            row.kind === 'process' &&
            row.process.call === access.call &&
            canonicalDigest(row.process.tenant) === canonicalDigest(access.tenant) &&
            canonicalDigest(row.process.start.execution) === canonicalDigest(input.execution)
              ? [row.process.block]
              : [],
          )
          .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
        const value: ToolStreamSnapshot = {
          state: record.call.state,
          process,
          foreground: record.call.state.foreground,
        }
        const nextDigest = canonicalDigest(value)
        if (nextDigest === digest) return
        const call = encodeToolInvocationRef({
          tenant: access.tenant,
          call: access.call,
          admission,
        })
        if ('failure' in call) return
        const ref = encodeStreamRef(
          { tenant: access.tenant, producer: 'tool', call: call.ok, stream: handle.stream },
          toolStreamCallCodec,
        )
        const offset = decodeStreamPosition(String(position++))
        if ('failure' in ref || 'failure' in offset) return
        const cursor = encodeStreamCursor({ ref: ref.ok, position: offset.ok })
        if ('failure' in cursor) return
        currentRef = ref.ok
        const previous = latest
        const next: Extract<Frame, { kind: 'snapshot' }> = {
          kind: 'snapshot',
          cursor: cursor.ok,
          value,
        }
        oversized = bytes(next) > input.bufferBytes
        latest = oversized ? null : structuredClone(next)
        digest = nextDigest
        if (oversized) {
          for (const subscriber of subscriptions)
            terminate(subscriber, { kind: 'gap', after: subscriber.cursor, reason: 'buffer' })
          return
        }
        if (previous !== null) {
          const blocks = value.process.filter(
            block =>
              !previous.value.process.some(
                old => old.index === block.index && canonicalDigest(old) === canonicalDigest(block),
              ),
          )
          for (const subscriber of subscriptions)
            enqueue(subscriber, {
              kind: 'delta',
              from: previous.cursor,
              cursor: cursor.ok,
              value: { state: value.state, blocks },
            })
        }
      }
      const next = refreshing.then(refresh)
      refreshing = next.then(
        () => undefined,
        () => undefined,
      )
      return next
    },
    close,
  }
}
