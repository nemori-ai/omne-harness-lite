export type SentinelMark = 'begin' | 'end'

export type SentinelPiece =
  | Readonly<{ kind: 'segment' | 'between'; bytes: Uint8Array }>
  | Readonly<{ kind: 'begin' }>
  | Readonly<{ kind: 'end' }>

export type SentinelScan = Readonly<{
  nonce: string | undefined
  inSegment: boolean
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

export function watchSentinels(scan: SentinelScan, nonce: string): SentinelScan {
  return { ...scan, nonce }
}

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

function prefixOf(data: Uint8Array, at: number, pattern: Uint8Array): boolean {
  const rest = data.length - at
  if (rest >= pattern.length) return false
  for (let i = 0; i < rest; i++) if (data[at + i] !== pattern[i]) return false
  return true
}

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
      return {
        scan: { nonce: scan.nonce, inSegment, held: Uint8Array.from(data.subarray(at)) },
        pieces,
      }
    }
    at += 1
  }
  emit(data.length)
  return { scan: { nonce: scan.nonce, inSegment, held: new Uint8Array(0) }, pieces }
}
