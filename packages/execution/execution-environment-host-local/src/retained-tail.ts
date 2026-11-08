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
}>

type StreamState = {
  readonly savedFrom: number
  /** Observed after `savedFrom` and no longer saved. */
  discarded: number
  /** Saved bytes in order; their total is at most the capacity after each append. */
  chunks: Uint8Array[]
  saved: number
}

const streams: readonly TailStream[] = ['stdout', 'stderr']
const continuation = (byte: number) => byte >> 6 === 0b10

/**
 * A tail whose streams start saving at `savedFrom`: the bytes each stream had observed when the
 * domain was handed over. `capacity` is the bound of saved bytes per stream and must be positive; a
 * provider that saves nothing keeps no tail at all.
 */
export function createRetainedTail(input: {
  capacity: number
  savedFrom: Readonly<Record<TailStream, number>>
}): RetainedTail {
  if (!Number.isSafeInteger(input.capacity) || input.capacity <= 0)
    throw new RangeError('a retained tail needs a positive capacity')
  const state = new Map<TailStream, StreamState>(
    streams.map(stream => [
      stream,
      { savedFrom: input.savedFrom[stream], discarded: 0, chunks: [], saved: 0 },
    ]),
  )
  let version = 0
  const of = (stream: TailStream): StreamState => {
    const found = state.get(stream)
    if (found === undefined) throw new TypeError(`unknown stream ${stream}`)
    return found
  }
  const end = (s: StreamState) => s.savedFrom + s.discarded + s.saved

  function trim(s: StreamState): void {
    while (s.saved > input.capacity) {
      const first = s.chunks[0]
      if (first === undefined) return
      const over = s.saved - input.capacity
      if (first.length <= over) {
        s.chunks.shift()
        s.saved -= first.length
        s.discarded += first.length
      } else {
        s.chunks[0] = first.subarray(over)
        s.saved -= over
        s.discarded += over
      }
    }
  }

  function streamTail(
    stream: TailStream,
    s: StreamState,
    from: number | undefined,
  ): RetainedStreamTail {
    const firstSaved = s.savedFrom + s.discarded
    const last = end(s)
    const start = Math.min(Math.max(from ?? firstSaved, firstSaved), last)
    const all = new Uint8Array(s.saved)
    let at = 0
    for (const chunk of s.chunks) {
      all.set(chunk, at)
      at += chunk.length
    }
    const data = all.slice(start - firstSaved)
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
      if (bytes.length === 0) return
      const s = of(stream)
      // A copy: the caller's buffer may be reused after this call.
      s.chunks.push(bytes.slice())
      s.saved += bytes.length
      trim(s)
      version++
    },
    drop(stream, count) {
      if (!Number.isSafeInteger(count) || count <= 0) return
      const s = of(stream)
      s.discarded += s.saved + count
      s.chunks = []
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
  })
}
