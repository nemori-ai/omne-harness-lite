// The output tail of one retained process: per stream, the newest bytes written after the handover,
// bounded by a capacity, with the source offsets the contract's `output` reports. It lives in the
// provider's memory only; nothing here is durable.
import type {
  RetainedOutput,
  RetainedOutputFrom,
  RetainedStreamTail,
} from '@omne-harness/execution-environment-contract'

export type TailStream = 'stdout' | 'stderr'

export type RetainedTail = Readonly<{
  /** Bytes of `stream` observed now; the oldest saved bytes go once the capacity is passed. */
  append(stream: TailStream, bytes: Uint8Array): void
  /** `count` bytes of `stream` were observed but never reached the tail: the saved bytes restart after the gap. */
  drop(stream: TailStream, count: number): void
  read(from?: RetainedOutputFrom): RetainedOutput
  /** The provider observes the streams no longer: the readings stop here, and nothing is appended. */
  close(): void
  closed(): boolean
}>

/**
 * One stream's saved bytes in a ring of the capacity's size, allocated when the first byte arrives:
 * the saved bytes end right before `writeAt` and wrap around the ring's end.
 */
type StreamState = {
  readonly savedFrom: number
  /** Observed after `savedFrom` and no longer saved. */
  discarded: number
  ring: Uint8Array | undefined
  writeAt: number
  /** Saved bytes, at most the capacity. */
  saved: number
}

const streams: readonly TailStream[] = ['stdout', 'stderr']
const continuation = (byte: number) => byte >> 6 === 0b10

/**
 * A tail whose streams start saving at `savedFrom`: the bytes each stream had observed when the
 * domain was handed over. `capacity` is the bound of saved bytes per stream and must be positive; a
 * provider that saves nothing keeps no tail at all. Each stream holds one buffer of the capacity's
 * size, allocated when its first byte arrives.
 */
export function createRetainedTail(input: {
  capacity: number
  savedFrom: Readonly<Record<TailStream, number>>
}): RetainedTail {
  const capacity = input.capacity
  if (!Number.isSafeInteger(capacity) || capacity <= 0)
    throw new RangeError('a retained tail needs a positive capacity')
  const state = new Map<TailStream, StreamState>(
    streams.map(stream => [
      stream,
      { savedFrom: input.savedFrom[stream], discarded: 0, ring: undefined, writeAt: 0, saved: 0 },
    ]),
  )
  let version = 0
  let open = true
  const of = (stream: TailStream): StreamState => {
    const found = state.get(stream)
    if (found === undefined) throw new TypeError(`unknown stream ${stream}`)
    return found
  }
  const end = (s: StreamState) => s.savedFrom + s.discarded + s.saved

  /** Writes `bytes` (fewer than the capacity) at `writeAt`, wrapping around the ring's end. */
  function write(s: StreamState, ring: Uint8Array, bytes: Uint8Array): void {
    const first = Math.min(bytes.length, capacity - s.writeAt)
    ring.set(bytes.subarray(0, first), s.writeAt)
    ring.set(bytes.subarray(first), 0)
    s.writeAt = (s.writeAt + bytes.length) % capacity
  }

  function append(s: StreamState, bytes: Uint8Array): void {
    const ring = (s.ring ??= new Uint8Array(capacity))
    if (bytes.length >= capacity) {
      ring.set(bytes.subarray(bytes.length - capacity))
      s.writeAt = 0
    } else {
      write(s, ring, bytes)
    }
    const total = s.saved + bytes.length
    s.saved = Math.min(total, capacity)
    s.discarded += total - s.saved
  }

  /** One copy of the saved bytes from `offset` on, read out of the ring in order. */
  function copyOut(s: StreamState, offset: number): Uint8Array {
    const length = s.saved - offset
    const data = new Uint8Array(length)
    if (s.ring === undefined || length === 0) return data
    const readAt = (s.writeAt - length + capacity) % capacity
    const first = Math.min(length, capacity - readAt)
    data.set(s.ring.subarray(readAt, readAt + first))
    data.set(s.ring.subarray(0, length - first), first)
    return data
  }

  function streamTail(
    stream: TailStream,
    s: StreamState,
    from: number | undefined,
  ): RetainedStreamTail {
    const firstSaved = s.savedFrom + s.discarded
    const last = end(s)
    const start = Math.min(Math.max(from ?? firstSaved, firstSaved), last)
    const data = copyOut(s, start - firstSaved)
    let skipped = 0
    while (skipped < 3 && skipped < data.length && continuation(data[skipped] ?? 0)) skipped++
    const text = data.subarray(skipped)
    let value: string
    let replaced = false
    try {
      value = new TextDecoder('utf-8', { fatal: true }).decode(text)
    } catch {
      value = new TextDecoder('utf-8').decode(text)
      replaced = true
    }
    return {
      stream,
      savedFrom: s.savedFrom,
      start,
      end: last,
      discardedBytes: s.discarded,
      data,
      text: { encoding: 'utf-8', value, start: start + skipped, replaced },
    }
  }

  return Object.freeze({
    append(stream, bytes) {
      if (!open || bytes.length === 0) return
      append(of(stream), bytes)
      version++
    },
    drop(stream, count) {
      if (!open || !Number.isSafeInteger(count) || count <= 0) return
      const s = of(stream)
      s.discarded += s.saved + count
      s.saved = 0
      version++
    },
    read(from) {
      const observed = streams.filter(stream => end(of(stream)) > of(stream).savedFrom)
      if (observed.length === 0) return { kind: 'none' }
      return {
        kind: 'tail',
        version,
        streams: observed.map(stream => streamTail(stream, of(stream), from?.[stream])),
      }
    },
    close() {
      open = false
    },
    closed: () => !open,
  })
}
