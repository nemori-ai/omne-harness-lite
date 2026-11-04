// Step 11: the byte range of one page, by the SPEC "读取的形状规则". A pure function over the
// verified bytes. Text is strict UTF-8 (the snapshot says so), so a character boundary is each
// byte that is not a continuation byte (0b10xxxxxx), and a slice between boundaries decodes.
// The requested end is the requested start plus the requested length; the actual end is the
// last character boundary at or before it, and not before the actual start.
import {
  PAGE_LIMIT,
  type ByteRange,
  type Bytes,
  type PackageEntry,
  type ReadContent,
} from '@omne-harness/skill-contract'

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

/** The first character boundary at `index` or after it; the total counts like a boundary. */
function boundaryAtOrAfter(region: Bytes, index: number): number {
  let at = index
  while (continuationAt(region, at)) at += 1
  return at
}

/** The last character boundary at `index` or before it. Index 0 is a boundary, so it ends. */
function boundaryAtOrBefore(region: Bytes, index: number): number {
  let at = index
  while (continuationAt(region, at)) at -= 1
  return at
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/** A byte range must be a non-negative integer start and length. Anything else is a caller
 * error, so it throws a TypeError. An absent range is the first page. */
export function assertByteRange(range: ByteRange | undefined): void {
  if (range !== undefined && !(isCount(range.start) && isCount(range.length)))
    throw new TypeError('a byte range is a non-negative integer start and length')
}

function decodeText(slice: Bytes): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(slice)
}

/** Slices one page out of `bytes` from `bodyOffset` on. */
export function sliceRange(
  bytes: Bytes,
  encoding: PackageEntry['encoding'],
  requested?: ByteRange,
  bodyOffset = 0,
): Sliced {
  assertByteRange(requested)
  const region = bytes.subarray(bodyOffset)
  const total = region.length
  const text = encoding === 'text'
  const requestedStart = Math.min(requested?.start ?? 0, total)
  const requestedEnd = Math.min(
    requestedStart + Math.min(requested?.length ?? PAGE_LIMIT, PAGE_LIMIT),
    total,
  )
  const start = text ? boundaryAtOrAfter(region, requestedStart) : requestedStart
  const end = Math.max(start, text ? boundaryAtOrBefore(region, requestedEnd) : requestedEnd)
  const slice = region.slice(start, end)
  return {
    content: text ? { kind: 'text', text: decodeText(slice) } : { kind: 'bytes', bytes: slice },
    range: { start, length: end - start },
    total,
    complete: end >= total,
  }
}
