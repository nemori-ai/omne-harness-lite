import type { Amount, UsageItem } from '@omne-harness/call-account'
import type { UsageCost } from '@omne-harness/usage-contract'
import { TOKEN_KINDS, type UsageFact } from '@omne-harness/usage-contract'

/** mulberry32: the same seed gives the same facts, so a failing case can be replayed. */
export function prng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Pick = Readonly<{
  int: (low: number, high: number) => number
  one: <T>(items: readonly T[]) => T
  chance: (share: number) => boolean
}>

export function picker(seed: number): Pick {
  const next = prng(seed)
  const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1))
  return {
    int,
    one: items => items[int(0, items.length - 1)] as (typeof items)[number],
    chance: share => next() < share,
  }
}

const STATES = ['known', 'known', 'known', 'provisional', 'unknown'] as const

function amount(pick: Pick, unit: string, places: number): Amount {
  const state = pick.one(STATES)
  if (state === 'unknown') return { state, unit }
  const whole = String(pick.int(0, 999))
  const fraction = places === 0 ? '' : String(pick.int(0, 10 ** places - 1)).padStart(places, '0')
  const lexeme =
    fraction === '' || /^0+$/u.test(fraction) ? whole : `${whole}.${fraction.replace(/0+$/u, '')}`
  return state === 'known' ? { state, lexeme, unit } : { state, lexeme, unit }
}

function cost(pick: Pick): UsageCost {
  const value = amount(pick, pick.one(['USD', 'credit']), 2)
  return value.state === 'known'
    ? { state: 'known', lexeme: value.lexeme, unit: value.unit }
    : { state: 'unknown' }
}

/** A fact with random numbers; its instant falls in [from, to] or is missing. */
export function randomFact(pick: Pick, index: number, from: number, to: number): UsageFact {
  const source = pick.one(['model', 'tool'])
  const usage: UsageItem[] = TOKEN_KINDS.filter(() => pick.chance(0.7)).map(name => ({
    name,
    ...amount(pick, 'token', 0),
  }))
  const outcome = pick.one(['pending', 'completed', 'completed', 'interrupted', 'failed'] as const)
  const ms = () => (pick.chance(0.8) ? pick.int(0, 60_000) : null)
  const at = pick.chance(0.1) ? null : pick.chance(0.05) ? to : pick.int(from, to - 1)
  return {
    source,
    subject: {
      kind: source === 'model' ? 'model_call' : 'tool_execution',
      id: source === 'model' ? `call-${pick.int(0, 20)}` : `call-${index}`,
    },
    unit: `unit-${index}`,
    at: at === null ? null : new Date(at).toISOString(),
    consumer: {
      owner: 'agent',
      work: `exec-${pick.int(1, 3)}`,
      position: 'p',
      purpose: pick.one(['main', 'compaction']),
    },
    labels: {
      model: pick.one(['m-a', 'm-b', null]),
      provider: pick.one(['openrouter', null]),
      profile: null,
      tool: source === 'tool' ? pick.one(['Shell', 'Files']) : null,
    },
    outcome,
    cause: outcome === 'failed' ? pick.one(['network', 'upstream', null]) : null,
    usage: source === 'model' ? usage : [],
    cost: pick.chance(0.2) ? null : cost(pick),
    durations: { toResponse: ms(), toFirstContent: ms(), total: ms(), generation: ms() },
    connectRetries: pick.int(0, 2),
    window: null,
  }
}

/** Decimal lexemes as hundredths, an arithmetic of the test's own to check the sums against. */
export const hundredths = (lexeme: string): bigint => {
  const [whole = '0', fraction = ''] = lexeme.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
}
