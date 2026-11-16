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

function continuationAt(region: Bytes, at: number): boolean {
  return ((region[at] ?? 0) & 0b1100_0000) === 0b1000_0000
}

function boundaryAtOrAfter(region: Bytes, index: number): number {
  let at = index
  while (continuationAt(region, at)) at += 1
  return at
}

function boundaryAtOrBefore(region: Bytes, index: number): number {
  let at = index
  while (continuationAt(region, at)) at -= 1
  return at
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

export function assertByteRange(range: ByteRange | undefined): void {
  if (range !== undefined && !(isCount(range.start) && isCount(range.length)))
    throw new TypeError('a byte range is a non-negative integer start and length')
}

function decodeText(slice: Bytes): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(slice)
}

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
