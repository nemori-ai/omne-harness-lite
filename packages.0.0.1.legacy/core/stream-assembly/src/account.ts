import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { TrimSummary } from '@omne-harness-lite/call-accounts'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { TrimEvent } from '@omne-harness-lite/arrival-events'
import type { ModelAssemblyAccount, ToolAssemblyAccount } from './types.ts'

export function sumNumbers(...values: readonly JsonNumber[]): JsonNumber {
  return values
    .reduce((sum, value) => sum.add(ExactDecimal.from(value)), ExactDecimal.from(0))
    .toJsonNumber()
}

export function equalNumbers(left: JsonNumber, right: JsonNumber): boolean {
  return ExactDecimal.from(left).compare(ExactDecimal.from(right)) === 0
}

export function emptyTrims(): TrimSummary {
  return Object.freeze({
    merged: 0,
    cut: 0,
    omittedBytes: 0,
    byReason: Object.freeze({ rate_merged: 0, frame_too_long: 0, quota_exhausted: 0, rejected: 0 }),
  })
}

/** S-14: pairing is about adjacent accepted events, not block identity. */
export function addTrim(
  previous: TrimSummary,
  event: TrimEvent,
  followsLongTrim: boolean,
): TrimSummary {
  const paired = followsLongTrim && event.reason === 'rejected'
  const merged =
    event.reason === 'rate_merged' ? sumNumbers(previous.merged, event.merged) : previous.merged
  const byReason = Object.freeze({
    rate_merged: merged,
    frame_too_long: sumNumbers(
      previous.byReason.frame_too_long,
      event.reason === 'frame_too_long' ? 1 : paired ? -1 : 0,
    ),
    quota_exhausted: sumNumbers(
      previous.byReason.quota_exhausted,
      event.reason === 'quota_exhausted' ? 1 : 0,
    ),
    rejected: sumNumbers(previous.byReason.rejected, event.reason === 'rejected' ? 1 : 0),
  })
  return Object.freeze({
    merged,
    cut: sumNumbers(byReason.quota_exhausted, byReason.rejected),
    omittedBytes:
      event.reason === 'rate_merged'
        ? previous.omittedBytes
        : sumNumbers(previous.omittedBytes, event.omittedBytes),
    byReason,
  })
}

export function unknownModelAccount(trims: TrimSummary): ModelAssemblyAccount {
  return Object.freeze({
    usage: Object.freeze({
      input_tokens: 'unknown',
      output_tokens: 'unknown',
      cache_read_tokens: 'unknown',
      cache_write_tokens: 'unknown',
      source: 'none',
    }),
    cost: Object.freeze({ cost_usd: 'unknown', source: 'none' }),
    trims,
  })
}

export function toolAccount(acceptedFrames: JsonNumber, trims: TrimSummary): ToolAssemblyAccount {
  return Object.freeze({
    frames: Object.freeze({ emitted: sumNumbers(acceptedFrames, trims.merged, trims.cut), trims }),
  })
}
