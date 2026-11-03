// Step 11: the byte range of one page, by the SPEC "读取的形状规则". A pure function over the
// verified bytes. Text is strict UTF-8 (the snapshot says so), so a character boundary is any
// byte that is not a continuation byte (0b10xxxxxx), and a slice between boundaries decodes.
import type { ByteRange, Bytes, PackageEntry, ReadContent } from '@omne-harness/skill-contract'

/** The most bytes of one page. Not configurable in this version. */
export const PAGE_LIMIT = 65_536

export type Sliced = Readonly<{
  content: ReadContent
  range: ByteRange
  total: number
  complete: boolean
}>

/** Whether the byte at `at` continues a character. Past the end there is no byte: a boundary. */
function continuationAt(region: Bytes, at: number): boolean {
  return ((region[at] ?? 0) & 0b1100_0000) === 0b1000_0000
}

/** The first character boundary at or after `index`; the total counts as a boundary. */
function boundaryAtOrAfter(region: Bytes, index: number): number {
  let at = index
  while (continuationAt(region, at)) at += 1
  return at
}

/** The last character boundary at or before `index`. `index` is not before a boundary, so the
 * walk stops there at the latest. */
function boundaryAtOrBefore(region: Bytes, index: number): number {
  let at = index
  while (continuationAt(region, at)) at -= 1
  return at
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function decodeText(slice: Bytes): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(slice)
}

/**
 * Slices one page out of `bytes` from `bodyOffset` on. The start and the length of `requested`
 * must be non-negative integers: anything else is a caller error and throws a TypeError.
 */
export function sliceRange(
  bytes: Bytes,
  encoding: PackageEntry['encoding'],
  requested?: ByteRange,
  bodyOffset = 0,
): Sliced {
  if (requested !== undefined && !(isCount(requested.start) && isCount(requested.length)))
    throw new TypeError('a byte range is a non-negative integer start and length')
  const region = bytes.subarray(bodyOffset)
  const total = region.length
  const text = encoding === 'text'
  const requestedStart = Math.min(requested?.start ?? 0, total)
  const start = text ? boundaryAtOrAfter(region, requestedStart) : requestedStart
  const requestedEnd = Math.min(
    start + Math.min(requested?.length ?? PAGE_LIMIT, PAGE_LIMIT),
    total,
  )
  const end = text ? boundaryAtOrBefore(region, requestedEnd) : requestedEnd
  const slice = region.slice(start, end)
  return {
    content: text ? { kind: 'text', text: decodeText(slice) } : { kind: 'bytes', bytes: slice },
    range: { start, length: end - start },
    total,
    complete: end >= total,
  }
}
