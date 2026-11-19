// How full the context of a session was at its last main request: the input of the latest settled,
// accounted main dispatch whose three input items are known, over the window of that dispatch.
import { decimalOf, lexemeOf, plus, ZERO } from './decimal.ts'
import type { ContextOccupancy, UsageFact } from './values.ts'

const INPUT = ['input', 'cache-read', 'cache-write'] as const

function inputOf(fact: UsageFact): string | null {
  let total = ZERO
  for (const name of INPUT) {
    const item = fact.usage.find(entry => entry.name === name)
    if (item?.state !== 'known') return null
    total = plus(total, decimalOf(item.lexeme))
  }
  return lexemeOf(total)
}

/** Hundredths of a percent as text with two places, by integers. */
function percentOf(used: string, window: string): string {
  const basis = (BigInt(used) * 10000n) / BigInt(window)
  return `${basis / 100n}.${String(basis % 100n).padStart(2, '0')}`
}

export function occupancyOf(facts: readonly UsageFact[]): ContextOccupancy {
  const candidates = facts
    .filter(
      fact =>
        fact.subject.kind === 'model_call' &&
        fact.consumer.purpose === 'main' &&
        fact.at !== null &&
        fact.outcome !== 'pending' &&
        fact.accounted,
    )
    .sort((a, b) =>
      (a.at ?? '') === (b.at ?? '')
        ? a.unit < b.unit
          ? 1
          : -1
        : (a.at ?? '') < (b.at ?? '')
          ? 1
          : -1,
    )
  if (candidates.length === 0) return { kind: 'none-yet' }
  for (const fact of candidates) {
    const used = inputOf(fact)
    if (used === null) continue
    if (fact.window === null || !/^[1-9][0-9]*$/u.test(fact.window.tokens))
      return { kind: 'unknown', reason: 'window-unknown' }
    return {
      kind: 'known',
      used,
      window: fact.window.tokens,
      percent: percentOf(used, fact.window.tokens),
      compactAtPercent: fact.window.compactAtPercent,
      asOf: { at: fact.at ?? '', model: fact.labels.model },
    }
  }
  return { kind: 'unknown', reason: 'usage-unknown' }
}
