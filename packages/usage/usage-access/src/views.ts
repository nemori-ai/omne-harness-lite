import type {
  ContextOccupancy,
  UsageFact,
  UsageMeasures,
  UsageRatio,
  UsageRecordPage,
  UsageResult,
} from '@omne-harness/usage-contract'
import type { AnswerOf } from '@omne-harness/access-cordis-contract'
import type { UsageProtocol } from '@omne-harness/usage-protocol'
import { encodeInstant, parseInstant, type Instant } from '@omne-harness/utc-instant'

type Operations = UsageProtocol['operations']
type Succeeded<N extends keyof Operations> =
  AnswerOf<Operations[N]> extends infer A
    ? A extends Readonly<{ outcome: 'succeeded'; body: infer B }>
      ? B
      : never
    : never

export const instantOf = (text: string): Instant => {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new TypeError(`usage-access: ${text} is not an instant`)
  return parsed.value
}
export const textOf = encodeInstant

const ratioOf = (ratio: UsageRatio) =>
  ratio.kind === 'known' ? { kind: 'known' as const, value: String(ratio.value) } : ratio

const measuresOf = (measures: UsageMeasures) => ({
  ...measures,
  rates: {
    cacheHit: ratioOf(measures.rates.cacheHit),
    reasoningShare: ratioOf(measures.rates.reasoningShare),
    retry: ratioOf(measures.rates.retry),
    failure: ratioOf(measures.rates.failure),
    outputPerSecond: ratioOf(measures.rates.outputPerSecond),
  },
})
const cellsOf = (cells: UsageResult['groups']) =>
  cells.map(({ key, measures }) => ({ key, measures: measuresOf(measures) }))

export const resultOf = (result: UsageResult): Succeeded<'query-usage'> => ({
  total: measuresOf(result.total),
  groups: cellsOf(result.groups),
  buckets: result.buckets.map(bucket => ({
    start: instantOf(bucket.start),
    end: instantOf(bucket.end),
    total: measuresOf(bucket.total),
    groups: cellsOf(bucket.groups),
  })),
  coverage: {
    ...result.coverage,
    earliest: result.coverage.earliest === null ? null : instantOf(result.coverage.earliest),
  },
})

const factOf = (fact: UsageFact) => ({ ...fact, at: fact.at === null ? null : instantOf(fact.at) })

export const pageOf = (page: UsageRecordPage): Succeeded<'list-usage-records'> => ({
  entries: page.entries.map(factOf),
  next: page.next,
})

export const occupancyOf = (occupancy: ContextOccupancy): Succeeded<'read-context-occupancy'> =>
  occupancy.kind === 'known'
    ? { ...occupancy, asOf: { at: instantOf(occupancy.asOf.at), model: occupancy.asOf.model } }
    : occupancy
