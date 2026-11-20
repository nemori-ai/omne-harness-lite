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

type Dated = UsageFact & Readonly<{ at: string }>

const settledMain = (fact: UsageFact): fact is Dated =>
  fact.subject.kind === 'model_call' &&
  fact.consumer.purpose === 'main' &&
  fact.at !== null &&
  fact.outcome !== 'pending' &&
  fact.accounted

/** The newest first; of two at one instant, the later unit first. */
const newestFirst = (a: Dated, b: Dated): number =>
  a.at === b.at ? (a.unit < b.unit ? 1 : -1) : a.at < b.at ? 1 : -1

const WINDOW = /^[1-9][0-9]*$/u

export function occupancyOf(facts: readonly UsageFact[]): ContextOccupancy {
  const candidates = facts.filter(settledMain).sort(newestFirst)
  if (candidates.length === 0) return { kind: 'none-yet' }
  for (const fact of candidates) {
    const used = inputOf(fact)
    if (used === null) continue
    const { window } = fact
    if (window === null || !WINDOW.test(window.tokens))
      return { kind: 'unknown', reason: 'window-unknown' }
    return {
      kind: 'known',
      used,
      window: window.tokens,
      percent: percentOf(used, window.tokens),
      compactAtPercent: window.compactAtPercent,
      asOf: { at: fact.at, model: fact.labels.model },
    }
  }
  return { kind: 'unknown', reason: 'usage-unknown' }
}
