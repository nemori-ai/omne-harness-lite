import type {
  RetainedOutput,
  RetainedOutputFrom,
  RetainedStreamTail,
} from '@omne-harness/execution-environment-contract'

export type TailStream = 'stdout' | 'stderr'

export type RetainedTail = Readonly<{
  append(stream: TailStream, bytes: Uint8Array): void
  /** `count` bytes of `stream` were observed but never reached the tail: the saved bytes restart after the gap. */
  drop(stream: TailStream, count: number): void
  read(from?: RetainedOutputFrom): RetainedOutput
  close(): void
  closed(): boolean
}>

type StreamState = {
  readonly savedFrom: number
  discarded: number
  ring: Uint8Array | undefined
  writeAt: number
  saved: number
}

const streams: readonly TailStream[] = ['stdout', 'stderr']
const continuation = (byte: number) => byte >> 6 === 0b10

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
