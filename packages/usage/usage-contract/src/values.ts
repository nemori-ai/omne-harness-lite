import type { SubjectKind, UsageItem } from '@omne-harness/call-account'
import type { ConsumerRef } from '@omne-harness/exchange-refs'

/** ISO-8601 in UTC with milliseconds. */
export type UsageInstant = string

/** What a unit is payable: known in a unit, unknown with no unit to put it in. */
export type UsageCost =
  | Readonly<{ state: 'known'; lexeme: string; unit: string }>
  | Readonly<{ state: 'unknown' }>

/** One unit of a producer (a real dispatch, a tool call); `cost` is null when nothing is payable. */
export type UsageFact = Readonly<{
  source: string
  subject: Readonly<{ kind: SubjectKind; id: string }>
  unit: string
  at: UsageInstant | null
  consumer: ConsumerRef
  labels: Readonly<{
    model: string | null
    provider: string | null
    profile: string | null
    tool: string | null
  }>
  outcome: 'pending' | 'completed' | 'interrupted' | 'failed'
  cause: string | null
  usage: readonly UsageItem[]
  cost: UsageCost | null
  durations: Readonly<{
    toResponse: number | null
    toFirstContent: number | null
    total: number | null
    generation: number | null
  }>
  connectRetries: number
  window: Readonly<{ tokens: string; compactAtPercent: string | null }> | null
  /** Whether the producer holds an account for this unit, known numbers or not. */
  accounted: boolean
}>

export type UsageConsumer = Readonly<{ owner: string; works: readonly string[] }>

export type UsageScope =
  | Readonly<{ kind: 'tenant' }>
  | Readonly<{ kind: 'session'; session: string }>
  | Readonly<{ kind: 'organization' }>

export const USAGE_BUCKETS = ['none', 'hour', 'day', 'week', 'month'] as const
export type UsageBucket = (typeof USAGE_BUCKETS)[number]
export const USAGE_DIMENSIONS = ['source', 'model', 'provider', 'purpose', 'tool'] as const
export type UsageDimension = (typeof USAGE_DIMENSIONS)[number]

/** A statistics query. The range runs from `from` up to, not including, `to`. */
export type UsageQuery = Readonly<{
  scope: UsageScope
  range: Readonly<{ from: UsageInstant; to: UsageInstant }>
  zone: string
  bucket: UsageBucket
  groupBy: readonly UsageDimension[]
}>

export const TOKEN_KINDS = ['input', 'output', 'cache-read', 'cache-write', 'reasoning'] as const
export type TokenKind = (typeof TOKEN_KINDS)[number]

/** The known sum, and how many units were unknown or provisional and so are not in it. */
export type UsageSum = Readonly<{ known: string; unknown: number; provisional: number }>
export type UsageRatio = Readonly<{ kind: 'known'; value: number }> | Readonly<{ kind: 'unknown' }>
export type UsageDistribution = Readonly<{ count: number; p50: number | null; p90: number | null }>

export type UsageMeasures = Readonly<{
  calls: number
  units: number
  retried: number
  interrupted: number
  failed: readonly Readonly<{ cause: string | null; count: number }>[]
  tokens: Readonly<Record<TokenKind, UsageSum>>
  cost: Readonly<{ sums: readonly Readonly<{ unit: string; known: string }>[]; unknown: number }>
  duration: Readonly<{
    total: UsageSum
    toFirstContent: UsageDistribution
    whole: UsageDistribution
  }>
  rates: Readonly<{
    cacheHit: UsageRatio
    reasoningShare: UsageRatio
    retry: UsageRatio
    failure: UsageRatio
    outputPerSecond: UsageRatio
  }>
}>

export type UsageCell = Readonly<{ key: readonly (string | null)[]; measures: UsageMeasures }>
export type UsageBucketResult = Readonly<{
  start: UsageInstant
  end: UsageInstant
  total: UsageMeasures
  groups: readonly UsageCell[]
}>
export type UsageCoverage = Readonly<{
  sources: readonly string[]
  undated: number
  costUnknown: number
  excluded: Readonly<{ cacheHit: number; reasoningShare: number; outputPerSecond: number }>
  earliest: UsageInstant | null
}>
export type UsageResult = Readonly<{
  total: UsageMeasures
  groups: readonly UsageCell[]
  buckets: readonly UsageBucketResult[]
  coverage: UsageCoverage
}>

export type UsageRecordsQuery = Readonly<{
  scope: UsageScope
  range: Readonly<{ from: UsageInstant; to: UsageInstant }>
  after: string | null
  limit: number
}>
export type UsageRecordPage = Readonly<{ entries: readonly UsageFact[]; next: string | null }>

export type ContextOccupancy =
  | Readonly<{
      kind: 'known'
      used: string
      window: string
      percent: string
      compactAtPercent: string | null
      asOf: Readonly<{ at: UsageInstant; model: string | null }>
    }>
  | Readonly<{ kind: 'none-yet' }>
  | Readonly<{ kind: 'unknown'; reason: 'usage-unknown' | 'window-unknown' }>
