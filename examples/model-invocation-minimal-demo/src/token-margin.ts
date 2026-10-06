import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { TokenMargin } from '@omne-harness-lite/model-request-runtime'

/** CLI configuration stays decimal-exact and has no implicit margin. */
export function readTokenMargin(
  multiplier: string | undefined,
  reserve: string | undefined,
): TokenMargin | undefined {
  if (multiplier === undefined || reserve === undefined) return undefined
  try {
    const value = {
      multiplier: new LosslessNumber(multiplier),
      reserveTokens: new LosslessNumber(reserve),
    }
    if (
      ExactDecimal.from(value.multiplier).compare(ExactDecimal.from(1)) < 0 ||
      !ExactDecimal.from(value.reserveTokens).isInteger ||
      ExactDecimal.from(value.reserveTokens).compare(ExactDecimal.from(0)) < 0
    )
      return undefined
    return Object.freeze(value)
  } catch {
    return undefined
  }
}
