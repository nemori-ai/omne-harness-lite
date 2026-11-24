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
import { OPENAI_OWNER } from './owner.ts'
import type { OpenAiRecord, TokenLimitData, UpstreamData } from './record.ts'
import { OPENAI_RECORDS } from './records.ts'

export type OfficialProfilesInput = Readonly<{
  retryPolicy: Adoption
  compactionTriggerPercent: string
}>

const PERCENT = /^(100|[1-9][0-9]?)$/

function upstreamOf(record: OpenAiRecord, data: UpstreamData): UpstreamLimit {
  return data.kind === 'finite'
    ? { kind: 'finite', amount: data.amount, source: componentAdoption(record, 'evidence') }
    : { kind: 'unknown' }
}

function tokenLimit(record: OpenAiRecord, supplier: Adoption, data: TokenLimitData): TokenLimit {
  return {
    provided: data.provided,
    upstream: [{ supplier, limit: upstreamOf(record, data.upstream) }],
  }
}

export function effortMapping(record: OpenAiRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'openai/gpt-6.2-astra':
    case 'openai/gpt-6.2-sol':
    case 'openai/gpt-6.1-sol':
    case 'openai/gpt-6.1-terra':
    case 'openai/gpt-6-astra':
    case 'openai/gpt-6-sol':
    case 'openai/gpt-6-luna':
    case 'openai/gpt-5.6-terra':
    case 'openai/gpt-5.6-luna':
      return { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' }
    case 'openai/gpt-6-astra-pro':
    case 'openai/gpt-6-sol-pro':
    case 'openai/gpt-6-luna-pro':
    case 'openai/gpt-5.6-sol':
    case 'openai/gpt-5.6-sol-pro':
    case 'openai/gpt-5.6-terra-pro':
    case 'openai/gpt-5.6-luna-pro':
      return { low: 'low', medium: 'medium', high: 'high' }
    default:
      return {}
  }
}

export function profileOf(
  record: OpenAiRecord,
  input: OfficialProfilesInput,
): ModelProfileDefinition {
  const supplier = recordAdoption(OPENAI_OWNER, record)
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

export function officialOpenAiProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition[] {
  if (
    typeof input.compactionTriggerPercent !== 'string' ||
    !PERCENT.test(input.compactionTriggerPercent)
  )
    throw new RangeError('compactionTriggerPercent must be a decimal integer from 1 to 100')
  const records: readonly OpenAiRecord[] = OPENAI_RECORDS
  return records
    .filter(record => record.status === 'current')
    .map(record => profileOf(record, input))
}
