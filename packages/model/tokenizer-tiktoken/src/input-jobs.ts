// How one count input becomes worker jobs. A worker job has a bounded retained size, so the
// memory of the executor is the number of jobs in flight times that size. A count input has no
// such bound: it is cut into jobs, each within the bound, and the caller adds their token counts.
// Pure: nothing here talks to a worker.
import type { TokenizationSegment } from '@omne-harness/model-contract/provider'

const JOB_OVERHEAD_BYTES = 32
const SEGMENT_OVERHEAD_BYTES = 128
/** The retained size of a job of one character of two code units: the least a job must hold. */
export const MIN_JOB_INPUT_BYTES = JOB_OVERHEAD_BYTES + SEGMENT_OVERHEAD_BYTES + 4
const HIGH_SURROGATE_FIRST = 0xd800
const HIGH_SURROGATE_LAST = 0xdbff

const stringOf = (segment: TokenizationSegment): string =>
  segment.kind === 'text' ? segment.text : segment.name

/** The retained size of one segment: its object overhead and two bytes per UTF-16 code unit. */
const segmentBytes = (segment: TokenizationSegment): number =>
  SEGMENT_OVERHEAD_BYTES + 2 * stringOf(segment).length

/** The conservative retained size of one job input. It is not the UTF-8 size or the RSS. */
export function retainedInputBytes(input: readonly TokenizationSegment[]): number {
  return input.reduce((bytes, segment) => bytes + segmentBytes(segment), JOB_OVERHEAD_BYTES)
}

/** The end of a piece of `text` from `from` with at most `units` code units, on a pair boundary. */
function pieceEnd(text: string, from: number, units: number): number {
  const end = Math.min(text.length, from + units)
  const last = text.charCodeAt(end - 1)
  const splits = end < text.length && last >= HIGH_SURROGATE_FIRST && last <= HIGH_SURROGATE_LAST
  return splits && end - 1 > from ? end - 1 : end
}

/** The segment, or the pieces of a text that one job cannot hold. A text is cut between characters. */
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

/**
 * The jobs of one count input, in order. Every job is within `maxBytes` of retained size, except
 * a job of one special token, which cannot be cut. `maxBytes` is at least `MIN_JOB_INPUT_BYTES`,
 * so a job holds any one character. The segments of all
 * jobs, put together in order, are the input. There is always at least one job, so an empty input
 * is one empty job, and an input that fits is one job of the same segments.
 */
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
