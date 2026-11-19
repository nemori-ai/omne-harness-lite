// Folding: every fact in the range lands in exactly one bucket and one group; sums keep the known,
// the unknown and the provisional apart; ratios come from the sums; percentiles from the units.
import type { Amount } from '@omne-harness/call-account'
import { instantText, type CheckedUsageQuery, type UsageEdge } from './check.ts'
import { decimalOf, lexemeOf, numberOf, plus, ZERO, type Decimal } from './decimal.ts'
import {
  TOKEN_KINDS,
  type TokenKind,
  type UsageCell,
  type UsageDimension,
  type UsageDistribution,
  type UsageFact,
  type UsageMeasures,
  type UsageRatio,
  type UsageResult,
} from './values.ts'

type Sum = { known: Decimal; unknown: number; provisional: number }
type Value = Readonly<{ state: Amount['state']; value: Decimal | null }>
/** A fact with its amounts read once, so that every cell it lands in adds the same numbers. */
type Parsed = Readonly<{
  fact: UsageFact
  tokens: Readonly<Partial<Record<TokenKind, Value>>>
  cost: (Value & Readonly<{ unit: string }>) | null
}>

const zero = (): Sum => ({ known: ZERO, unknown: 0, provisional: 0 })
const valueOf = (amount: Amount): Value => ({
  state: amount.state,
  value: amount.state === 'unknown' ? null : decimalOf(amount.lexeme),
})

function parse(fact: UsageFact): Parsed {
  const tokens: Partial<Record<TokenKind, Value>> = {}
  for (const kind of TOKEN_KINDS) {
    const item = fact.usage.find(entry => entry.name === kind)
    if (item !== undefined) tokens[kind] = valueOf(item)
  }
  return {
    fact,
    tokens,
    cost: fact.cost === null ? null : { ...valueOf(fact.cost), unit: fact.cost.unit },
  }
}

function add(sum: Sum, amount: Value): void {
  if (amount.state === 'known' && amount.value !== null) sum.known = plus(sum.known, amount.value)
  else if (amount.state === 'provisional') sum.provisional += 1
  else sum.unknown += 1
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

const sumText = (sum: Sum) => ({ ...sum, known: lexemeOf(sum.known) })
const knownOf = (value: Value | undefined): Decimal | null =>
  value?.state === 'known' ? value.value : null

class Cell {
  private calls = 0
  private retried = 0
  private interrupted = 0
  costUnknown = 0
  private readonly failed = new Map<string | null, number>()
  private readonly tokens = Object.fromEntries(TOKEN_KINDS.map(kind => [kind, zero()])) as Record<
    TokenKind,
    Sum
  >
  private readonly costs = new Map<string, Sum>()
  private readonly total = zero()
  private readonly firsts: number[] = []
  private readonly wholes: number[] = []
  private cache = { part: ZERO, whole: ZERO }
  private reasoning = { part: ZERO, whole: ZERO }
  private speed = { output: ZERO, ms: 0 }
  readonly excluded = { cacheHit: 0, reasoningShare: 0, outputPerSecond: 0 }

  add({ fact, tokens, cost }: Parsed): void {
    if (fact.retried) this.retried += 1
    else this.calls += 1
    if (fact.outcome === 'interrupted') this.interrupted += 1
    if (fact.outcome === 'failed')
      this.failed.set(fact.cause, (this.failed.get(fact.cause) ?? 0) + 1)
    for (const kind of TOKEN_KINDS) {
      const value = tokens[kind]
      if (value !== undefined) add(this.tokens[kind], value)
    }
    if (cost !== null) {
      const sum = this.costs.get(cost.unit) ?? zero()
      add(sum, cost)
      this.costs.set(cost.unit, sum)
      if (cost.state === 'unknown') this.costUnknown += 1
    }
    const { total, toFirstContent, generation } = fact.durations
    if (total === null) this.total.unknown += 1
    else {
      this.total.known = plus(this.total.known, { digits: BigInt(total), places: 0 })
      this.wholes.push(total)
    }
    if (toFirstContent !== null) this.firsts.push(toFirstContent)
    this.addRates(tokens, generation)
  }

  private addRates(tokens: Parsed['tokens'], generation: number | null): void {
    const input = [tokens.input, tokens['cache-read'], tokens['cache-write']]
    if (input.some(value => value !== undefined)) {
      const values = input.map(knownOf)
      if (values.some(value => value === null)) this.excluded.cacheHit += 1
      else
        this.cache = {
          part: plus(this.cache.part, values[1] ?? ZERO),
          whole: values.reduce<Decimal>((sum, value) => plus(sum, value ?? ZERO), this.cache.whole),
        }
    }
    const output = tokens.output
    if (output === undefined) return
    const reasoning = knownOf(tokens.reasoning)
    const produced = knownOf(output)
    if (reasoning === null || produced === null) this.excluded.reasoningShare += 1
    else
      this.reasoning = {
        part: plus(this.reasoning.part, reasoning),
        whole: plus(this.reasoning.whole, produced),
      }
    if (produced === null || generation === null) this.excluded.outputPerSecond += 1
    else this.speed = { output: plus(this.speed.output, produced), ms: this.speed.ms + generation }
  }

  measures(): UsageMeasures {
    const units = this.calls + this.retried
    const failures = [...this.failed.values()].reduce((sum, count) => sum + count, 0)
    return {
      calls: this.calls,
      units,
      retried: this.retried,
      interrupted: this.interrupted,
      failed: [...this.failed]
        .map(([cause, count]) => ({ cause, count }))
        .sort((a, b) => compareKeys([a.cause], [b.cause])),
      tokens: Object.fromEntries(
        TOKEN_KINDS.map(kind => [kind, sumText(this.tokens[kind])]),
      ) as UsageMeasures['tokens'],
      cost: [...this.costs]
        .map(([unit, sum]) => ({ ...sumText(sum), unit }))
        .sort((a, b) => (a.unit < b.unit ? -1 : 1)),
      duration: {
        total: sumText(this.total),
        toFirstContent: distribution(this.firsts),
        whole: distribution(this.wholes),
      },
      rates: {
        cacheHit: ratio(numberOf(this.cache.part), numberOf(this.cache.whole)),
        reasoningShare: ratio(numberOf(this.reasoning.part), numberOf(this.reasoning.whole)),
        retry: ratio(this.retried, units),
        failure: ratio(failures, units),
        outputPerSecond: ratio(numberOf(this.speed.output), this.speed.ms / 1000),
      },
    }
  }
}

export function measure(facts: readonly UsageFact[]): UsageMeasures {
  const cell = new Cell()
  for (const fact of facts) cell.add(parse(fact))
  return cell.measures()
}

function dimensionOf(fact: UsageFact, dimension: UsageDimension): string | null {
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

type Groups = Map<string, { key: (string | null)[]; cell: Cell }>

function into(groups: Groups, key: (string | null)[], name: string, parsed: Parsed): void {
  const group = groups.get(name) ?? { key, cell: new Cell() }
  group.cell.add(parsed)
  groups.set(name, group)
}

const cellsOf = (groups: Groups): UsageCell[] =>
  [...groups.values()]
    .sort((a, b) => compareKeys(a.key, b.key))
    .map(group => ({ key: group.key, measures: group.cell.measures() }))

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
  const { edges, groupBy } = query
  const from = edges[0]?.start ?? 0
  const to = edges.at(-1)?.end ?? 0
  const whole = new Cell()
  const groups: Groups = new Map()
  const buckets = edges.map(() => ({ total: new Cell(), groups: new Map() as Groups }))
  let earliest = Infinity
  for (const fact of facts) {
    const at = fact.at === null ? NaN : Date.parse(fact.at)
    if (!(at >= from && at < to)) continue
    const parsed = parse(fact)
    const bucket = buckets[bucketOf(edges, at)]
    whole.add(parsed)
    bucket?.total.add(parsed)
    if (groupBy.length > 0) {
      const key = groupBy.map(dimension => dimensionOf(fact, dimension))
      const name = JSON.stringify(key)
      into(groups, key, name, parsed)
      if (bucket !== undefined) into(bucket.groups, key, name, parsed)
    }
    earliest = Math.min(earliest, at)
  }
  return {
    total: whole.measures(),
    groups: cellsOf(groups),
    buckets: buckets.map((bucket, index) => ({
      start: instantText(edges[index]?.start ?? from),
      end: instantText(edges[index]?.end ?? to),
      total: bucket.total.measures(),
      groups: cellsOf(bucket.groups),
    })),
    coverage: {
      sources: [...read.sources],
      undated: read.undated,
      costUnknown: whole.costUnknown,
      excluded: { ...whole.excluded },
      earliest: earliest === Infinity ? null : instantText(earliest),
    },
  }
}
