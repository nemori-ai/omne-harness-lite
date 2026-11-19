// Folding: every fact in the range lands in exactly one bucket and one group; sums keep the known,
// the unknown and the provisional apart; ratios come from the sums; percentiles from the units.
import type { Amount, UsageItem } from '@omne-harness/call-account'
import { instantText, type CheckedUsageQuery, type UsageEdge } from './check.ts'
import { addLexemes } from './decimal.ts'
import {
  TOKEN_KINDS,
  type TokenKind,
  type UsageCell,
  type UsageCoverage,
  type UsageDimension,
  type UsageDistribution,
  type UsageFact,
  type UsageMeasures,
  type UsageRatio,
  type UsageResult,
  type UsageSum,
} from './values.ts'

type Sum = { known: string; unknown: number; provisional: number }
type Share = { part: string; whole: string }
type Tally = Readonly<{
  measures: UsageMeasures
  costUnknown: number
  excluded: UsageCoverage['excluded']
}>

const zero = (): Sum => ({ known: '0', unknown: 0, provisional: 0 })
const itemOf = (fact: UsageFact, name: TokenKind): UsageItem | undefined =>
  fact.usage.find(item => item.name === name)

function add(sum: Sum, amount: Amount): void {
  if (amount.state === 'known') sum.known = addLexemes(sum.known, amount.lexeme)
  else if (amount.state === 'provisional') sum.provisional += 1
  else sum.unknown += 1
}

function addMs(sum: Sum, ms: number | null): void {
  if (ms === null) sum.unknown += 1
  else sum.known = addLexemes(sum.known, String(ms))
}

const ratio = (part: number, whole: number): UsageRatio =>
  whole === 0 ? { kind: 'unknown' } : { kind: 'known', value: part / whole }

function percentile(sorted: readonly number[], share: number): number | null {
  if (sorted.length === 0) return null
  return sorted[Math.max(Math.ceil(share * sorted.length), 1) - 1] ?? null
}

function distribution(values: number[]): UsageDistribution {
  const sorted = values.sort((a, b) => a - b)
  return { count: sorted.length, p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9) }
}

function known(items: readonly (UsageItem | undefined)[]): readonly string[] | null {
  const lexemes = items.map(item => (item?.state === 'known' ? item.lexeme : null))
  return lexemes.every(item => item !== null) ? (lexemes as string[]) : null
}

function tally(facts: readonly UsageFact[]): Tally {
  let calls = 0
  let retried = 0
  let interrupted = 0
  let costUnknown = 0
  const failed = new Map<string | null, number>()
  const tokens = Object.fromEntries(TOKEN_KINDS.map(kind => [kind, zero()])) as Record<
    TokenKind,
    Sum
  >
  const costs = new Map<string, Sum>()
  const total = zero()
  const firsts: number[] = []
  const wholes: number[] = []
  const cache: Share = { part: '0', whole: '0' }
  const reasoning: Share = { part: '0', whole: '0' }
  const speed = { output: '0', ms: 0 }
  const excluded = { cacheHit: 0, reasoningShare: 0, outputPerSecond: 0 }
  for (const fact of facts) {
    if (fact.retried) retried += 1
    else calls += 1
    if (fact.outcome === 'interrupted') interrupted += 1
    if (fact.outcome === 'failed') failed.set(fact.cause, (failed.get(fact.cause) ?? 0) + 1)
    for (const kind of TOKEN_KINDS) {
      const item = itemOf(fact, kind)
      if (item !== undefined) add(tokens[kind], item)
    }
    if (fact.cost !== null) {
      const sum = costs.get(fact.cost.unit) ?? zero()
      add(sum, fact.cost)
      costs.set(fact.cost.unit, sum)
      if (fact.cost.state === 'unknown') costUnknown += 1
    }
    addMs(total, fact.durations.total)
    if (fact.durations.toFirstContent !== null) firsts.push(fact.durations.toFirstContent)
    if (fact.durations.total !== null) wholes.push(fact.durations.total)
    const input = [itemOf(fact, 'input'), itemOf(fact, 'cache-read'), itemOf(fact, 'cache-write')]
    if (input.some(item => item !== undefined)) {
      const values = known(input)
      if (values === null) excluded.cacheHit += 1
      else {
        cache.part = addLexemes(cache.part, values[1] ?? '0')
        cache.whole = values.reduce(addLexemes, cache.whole)
      }
    }
    const output = itemOf(fact, 'output')
    if (output !== undefined) {
      const share = known([itemOf(fact, 'reasoning'), output])
      if (share === null) excluded.reasoningShare += 1
      else {
        reasoning.part = addLexemes(reasoning.part, share[0] ?? '0')
        reasoning.whole = addLexemes(reasoning.whole, share[1] ?? '0')
      }
      const generation = fact.durations.generation
      if (output.state !== 'known' || generation === null) excluded.outputPerSecond += 1
      else {
        speed.output = addLexemes(speed.output, output.lexeme)
        speed.ms += generation
      }
    }
  }
  const units = calls + retried
  const failures = [...failed.values()].reduce((sum, count) => sum + count, 0)
  const measures: UsageMeasures = {
    calls,
    units,
    retried,
    interrupted,
    failed: [...failed]
      .map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => compareKeys([a.cause], [b.cause])),
    tokens: tokens as Record<TokenKind, UsageSum>,
    cost: [...costs]
      .map(([unit, sum]) => ({ ...sum, unit }))
      .sort((a, b) => (a.unit < b.unit ? -1 : 1)),
    duration: { total, toFirstContent: distribution(firsts), whole: distribution(wholes) },
    rates: {
      cacheHit: ratio(Number(cache.part), Number(cache.whole)),
      reasoningShare: ratio(Number(reasoning.part), Number(reasoning.whole)),
      retry: ratio(retried, units),
      failure: ratio(failures, units),
      outputPerSecond: ratio(Number(speed.output), speed.ms / 1000),
    },
  }
  return { measures, costUnknown, excluded }
}

export const measure = (facts: readonly UsageFact[]): UsageMeasures => tally(facts).measures

function valueOf(fact: UsageFact, dimension: UsageDimension): string | null {
  if (dimension === 'source') return fact.source
  if (dimension === 'purpose') return fact.consumer.purpose
  return fact.labels[dimension]
}

function compareKeys(a: readonly (string | null)[], b: readonly (string | null)[]): number {
  for (let at = 0; at < a.length; at += 1) {
    const [x, y] = [a[at] ?? null, b[at] ?? null]
    if (x === y) continue
    if (x === null) return -1
    if (y === null) return 1
    return x < y ? -1 : 1
  }
  return 0
}

function cells(facts: readonly UsageFact[], groupBy: readonly UsageDimension[]): UsageCell[] {
  if (groupBy.length === 0) return []
  const groups = new Map<string, { key: (string | null)[]; facts: UsageFact[] }>()
  for (const fact of facts) {
    const key = groupBy.map(dimension => valueOf(fact, dimension))
    const name = JSON.stringify(key)
    const group = groups.get(name) ?? { key, facts: [] }
    group.facts.push(fact)
    groups.set(name, group)
  }
  return [...groups.values()]
    .sort((a, b) => compareKeys(a.key, b.key))
    .map(group => ({ key: group.key, measures: measure(group.facts) }))
}

function bucketOf(edges: readonly UsageEdge[], at: number): number {
  let low = 0
  let high = edges.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if ((edges[middle]?.start ?? Infinity) <= at) low = middle
    else high = middle - 1
  }
  return low
}

/** The statistics of the facts read for a checked query, with what the sources said of them. */
export function fold(
  facts: readonly UsageFact[],
  query: CheckedUsageQuery,
  read: Readonly<{ sources: readonly string[]; undated: number }>,
): UsageResult {
  const { edges } = query
  const from = edges[0]?.start ?? 0
  const to = edges.at(-1)?.end ?? 0
  const placed = facts.flatMap(fact => {
    const at = fact.at === null ? NaN : Date.parse(fact.at)
    return at >= from && at < to ? [{ fact, at }] : []
  })
  const inRange = placed.map(item => item.fact)
  const byBucket = edges.map((): UsageFact[] => [])
  for (const item of placed) byBucket[bucketOf(edges, item.at)]?.push(item.fact)
  const whole = tally(inRange)
  const earliest = placed.reduce((low, item) => Math.min(low, item.at), Infinity)
  return {
    total: whole.measures,
    groups: cells(inRange, query.groupBy),
    buckets: edges.map((edge, index) => {
      const own = byBucket[index] ?? []
      return {
        start: instantText(edge.start),
        end: instantText(edge.end),
        total: measure(own),
        groups: cells(own, query.groupBy),
      }
    }),
    coverage: {
      sources: [...read.sources],
      undated: read.undated,
      costUnknown: whole.costUnknown,
      excluded: whole.excluded,
      earliest: earliest === Infinity ? null : instantText(earliest),
    },
  }
}
