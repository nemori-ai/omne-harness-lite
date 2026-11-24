import type {
  Adoption,
  ModelLimit,
  ModelProfileDefinition,
  ReasoningEffortMapping,
  TokenLimit,
  UpstreamLimit,
} from '@omne-harness/model-contract'
import { recordAdoption, recordProvider } from '@omne-harness/pi-ai-transport'
import { componentAdoption } from './adoptions.ts'
import { ANTHROPIC_OWNER } from './owner.ts'
import type { AnthropicRecord, TokenLimitData, UpstreamData } from './record.ts'
import { ANTHROPIC_RECORDS } from './records.ts'

export type OfficialProfilesInput = Readonly<{
  retryPolicy: Adoption
  compactionTriggerPercent: string
}>

const PERCENT = /^(100|[1-9][0-9]?)$/

function upstreamOf(record: AnthropicRecord, data: UpstreamData): UpstreamLimit {
  return data.kind === 'finite'
    ? { kind: 'finite', amount: data.amount, source: componentAdoption(record, 'evidence') }
    : { kind: 'unknown' }
}

function tokenLimit(record: AnthropicRecord, supplier: Adoption, data: TokenLimitData): TokenLimit {
  return {
    provided: data.provided,
    upstream: [{ supplier, limit: upstreamOf(record, data.upstream) }],
  }
}

export function effortMapping(record: AnthropicRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'anthropic/claude-fable-5.2':
    case 'anthropic/claude-fable-5.1':
    case 'anthropic/claude-opus-5.5':
    case 'anthropic/claude-opus-5':
    case 'anthropic/claude-sonnet-5.5':
    case 'anthropic/claude-sonnet-5':
    case 'anthropic/claude-haiku-5.5':
      return { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' }
    default:
      return {}
  }
}

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
        provider: recordProvider(record),
        model: record.route.model,
        replay: record.replay.declaration,
      },
    ],
    fallback: false,
    input: record.profile.input,
    ...(record.wire.file === undefined ? {} : { fileTypes: record.wire.file.mediaTypes }),
    output: record.profile.output,
    context: {
      window: tokenLimit(record, supplier, context.window),
      input: context.input === null ? null : tokenLimit(record, supplier, context.input),
      output: tokenLimit(record, supplier, context.output),
      compactionTriggerPercent: input.compactionTriggerPercent,
    },
    limits,
    parameters: [],
    reasoningEfforts: effortMapping(record),
    representation: componentAdoption(record, 'representation'),
    meter: componentAdoption(record, 'meter'),
    retryPolicy: input.retryPolicy,
  }
}

export function officialAnthropicProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition[] {
  if (
    typeof input.compactionTriggerPercent !== 'string' ||
    !PERCENT.test(input.compactionTriggerPercent)
  )
    throw new RangeError('compactionTriggerPercent must be a decimal integer from 1 to 100')
  const records: readonly AnthropicRecord[] = ANTHROPIC_RECORDS
  return records
    .filter(record => record.status === 'current')
    .map(record => profileOf(record, input))
}
