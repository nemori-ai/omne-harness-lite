// Segment sentinels in the PTY byte stream of a persistent terminal.
//
// The driver writes `ESC ] 7770 ; omne-b ; <nonce> BEL` before a segment's script and
// `ESC ] 7770 ; omne-e ; <nonce> BEL` after it. Both go through the same PTY as the script's
// bytes, so their position in the stream divides segment bytes from between-segment bytes.
// Only the nonce of the segment being watched is recognized; any other sequence is data.
// This module does no I/O: the gate keeps the scan state and acts on the pieces.

export type SentinelMark = 'begin' | 'end'

export type SentinelPiece =
  | Readonly<{ kind: 'segment' | 'between'; bytes: Uint8Array }>
  | Readonly<{ kind: 'begin' }>
  | Readonly<{ kind: 'end' }>

export type SentinelScan = Readonly<{
  /** The nonce being watched; without one nothing is recognized and nothing is held. */
  nonce: string | undefined
  /** Whether the last recognized sentinel was a begin sentinel. */
  inSegment: boolean
  /** A stream tail that may be the start of a sentinel; it is data if the next bytes do not complete one. */
  held: Uint8Array
}>

export type SentinelStep = Readonly<{ scan: SentinelScan; pieces: readonly SentinelPiece[] }>

const ESC = 0x1b

export const idleSentinels: SentinelScan = Object.freeze({
  nonce: undefined,
  inSegment: false,
  held: new Uint8Array(0),
})

export function sentinel(mark: SentinelMark, nonce: string): Uint8Array {
  return new Uint8Array(
    Buffer.from(`\u001b]7770;omne-${mark === 'begin' ? 'b' : 'e'};${nonce}\u0007`),
  )
}

/** Starts watching for the sentinels of one segment. */
export function watchSentinels(scan: SentinelScan, nonce: string): SentinelScan {
  return { ...scan, nonce }
}

/** Stops watching. Held bytes are data under the current attribution. */
export function releaseSentinels(scan: SentinelScan): SentinelStep {
  return {
    scan: idleSentinels,
    pieces: scan.held.length === 0 ? [] : [bytesOf(scan.inSegment, scan.held)],
  }
}

function bytesOf(inSegment: boolean, bytes: Uint8Array): SentinelPiece {
  return { kind: inSegment ? 'segment' : 'between', bytes }
}

function startsWith(data: Uint8Array, at: number, pattern: Uint8Array): boolean {
  if (data.length - at < pattern.length) return false
  for (let i = 0; i < pattern.length; i++) if (data[at + i] !== pattern[i]) return false
  return true
}

/** True when the rest of `data` from `at` is a proper prefix of `pattern`. */
function prefixOf(data: Uint8Array, at: number, pattern: Uint8Array): boolean {
  const rest = data.length - at
  if (rest >= pattern.length) return false
  for (let i = 0; i < rest; i++) if (data[at + i] !== pattern[i]) return false
  return true
}

/** Attributes one chunk read from the PTY, joining it to the bytes held from the previous chunk. */
export function scanSentinels(scan: SentinelScan, chunk: Uint8Array): SentinelStep {
  if (scan.nonce === undefined)
    return { scan, pieces: chunk.length === 0 ? [] : [bytesOf(scan.inSegment, chunk)] }
  const begin = sentinel('begin', scan.nonce)
  const end = sentinel('end', scan.nonce)
  const data = scan.held.length === 0 ? chunk : Buffer.concat([scan.held, chunk])
  const pieces: SentinelPiece[] = []
  let inSegment = scan.inSegment
  let from = 0
  const emit = (to: number) => {
    if (to > from) pieces.push(bytesOf(inSegment, data.slice(from, to)))
  }
  for (let at = data.indexOf(ESC); at !== -1; at = data.indexOf(ESC, at)) {
    const mark: SentinelMark | undefined = startsWith(data, at, begin)
      ? 'begin'
      : startsWith(data, at, end)
        ? 'end'
        : undefined
    if (mark !== undefined) {
      emit(at)
      pieces.push({ kind: mark })
      inSegment = mark === 'begin'
      at += begin.length
      from = at
      continue
    }
    if (prefixOf(data, at, begin) || prefixOf(data, at, end)) {
      emit(at)
      // A copy: the caller may read its next chunk into the buffer `data` views.
      return {
        scan: { nonce: scan.nonce, inSegment, held: Uint8Array.from(data.subarray(at)) },
        pieces,
      }
    }
    // Not a sentinel here; the next one may start at the very next byte.
    at += 1
  }
  emit(data.length)
  return { scan: { nonce: scan.nonce, inSegment, held: new Uint8Array(0) }, pieces }
}
