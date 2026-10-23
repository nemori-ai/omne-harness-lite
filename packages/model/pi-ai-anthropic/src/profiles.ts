// The official profiles of the Anthropic family: one profile definition per `current` record,
// derived from the record. The retry policy is a Model policy and the compaction trigger is a
// profile setting, so the assembly gives both.
import type {
  Adoption,
  ModelLimit,
  ModelProfileDefinition,
  TokenLimit,
  UpstreamLimit,
} from '@omne-harness/model-contract'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import { componentAdoption } from './adoptions.ts'
import { ANTHROPIC_OWNER } from './owner.ts'
import type { AnthropicRecord, TokenLimitData, UpstreamData } from './record.ts'
import { ANTHROPIC_RECORDS } from './records.ts'

export type OfficialProfilesInput = Readonly<{
  retryPolicy: Adoption
  /** A decimal integer from 1 to 100: the compaction trigger of every profile. */
  compactionTriggerPercent: string
}>

const PERCENT = /^(100|[1-9][0-9]?)$/

function upstreamOf(record: AnthropicRecord, data: UpstreamData): UpstreamLimit {
  return data.kind === 'finite'
    ? { kind: 'finite', amount: data.amount, source: componentAdoption(record, 'evidence') }
    : { kind: 'unknown' }
}

function tokenLimit(record: AnthropicRecord, supplier: Adoption, data: TokenLimitData): TokenLimit {
  return { provided: data.provided, upstream: [{ supplier, limit: upstreamOf(record, data.upstream) }] }
}

/** The profile definition of one record. */
export function profileOf(
  record: AnthropicRecord,
  input: OfficialProfilesInput,
): ModelProfileDefinition {
  const supplier = recordAdoption(ANTHROPIC_OWNER, record)
  const { context } = record.profile
  const limits: ModelLimit[] = record.profile.limits.map(limit => ({
    metric: limit.metric,
    provided: limit.provided,
    upstream: [{ supplier, limit: upstreamOf(record, limit.upstream) }],
  }))
  return {
    suppliers: [
      {
        adoption: supplier,
        recipient: record.route.recipient,
        model: record.route.model,
        replay: record.replay.declaration,
      },
    ],
    fallback: false,
    input: record.profile.input,
    output: record.profile.output,
    context: {
      window: tokenLimit(record, supplier, context.window),
      input: context.input === null ? null : tokenLimit(record, supplier, context.input),
      output: tokenLimit(record, supplier, context.output),
      compactionTriggerPercent: input.compactionTriggerPercent,
    },
    limits,
    parameters: [],
    representation: componentAdoption(record, 'representation'),
    meter: componentAdoption(record, 'meter'),
    retryPolicy: input.retryPolicy,
  }
}

/**
 * One profile definition per `current` record, in record order. Pure data; nothing is acquired.
 * Throws `RangeError` when `compactionTriggerPercent` is not a decimal integer from 1 to 100.
 */
export function officialAnthropicProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition[] {
  if (typeof input.compactionTriggerPercent !== 'string' || !PERCENT.test(input.compactionTriggerPercent))
    throw new RangeError('compactionTriggerPercent must be a decimal integer from 1 to 100')
  const records: readonly AnthropicRecord[] = ANTHROPIC_RECORDS
  return records.filter(record => record.status === 'current').map(record => profileOf(record, input))
}
