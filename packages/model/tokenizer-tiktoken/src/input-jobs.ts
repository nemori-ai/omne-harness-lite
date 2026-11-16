import type { TokenizationSegment } from '@omne-harness/model-contract/provider'

const JOB_OVERHEAD_BYTES = 32
const SEGMENT_OVERHEAD_BYTES = 128
export const MIN_JOB_INPUT_BYTES = JOB_OVERHEAD_BYTES + SEGMENT_OVERHEAD_BYTES + 4
const HIGH_SURROGATE_FIRST = 0xd800
const HIGH_SURROGATE_LAST = 0xdbff

const stringOf = (segment: TokenizationSegment): string =>
  segment.kind === 'text' ? segment.text : segment.name

const segmentBytes = (segment: TokenizationSegment): number =>
  SEGMENT_OVERHEAD_BYTES + 2 * stringOf(segment).length

export function retainedInputBytes(input: readonly TokenizationSegment[]): number {
  return input.reduce((bytes, segment) => bytes + segmentBytes(segment), JOB_OVERHEAD_BYTES)
}

function pieceEnd(text: string, from: number, units: number): number {
  const end = Math.min(text.length, from + units)
  const last = text.charCodeAt(end - 1)
  const splits = end < text.length && last >= HIGH_SURROGATE_FIRST && last <= HIGH_SURROGATE_LAST
  return splits && end - 1 > from ? end - 1 : end
}

function* piecesOf(segment: TokenizationSegment, maxBytes: number): Generator<TokenizationSegment> {
  const units = Math.floor((maxBytes - JOB_OVERHEAD_BYTES - SEGMENT_OVERHEAD_BYTES) / 2)
  if (segment.kind === 'special-token' || segment.text.length <= units) {
    yield segment
    return
  }
  for (let from = 0; from < segment.text.length;) {
    const end = pieceEnd(segment.text, from, units)
    yield { kind: 'text', text: segment.text.slice(from, end) }
    from = end
  }
}

export function* jobsOf(
  input: readonly TokenizationSegment[],
  maxBytes: number,
): Generator<readonly TokenizationSegment[]> {
  let job: TokenizationSegment[] = []
  let bytes = JOB_OVERHEAD_BYTES
  for (const segment of input)
    for (const piece of piecesOf(segment, maxBytes)) {
      if (job.length > 0 && bytes + segmentBytes(piece) > maxBytes) {
        yield job
        job = []
        bytes = JOB_OVERHEAD_BYTES
      }
      job.push(piece)
      bytes += segmentBytes(piece)
    }
  yield job
}
