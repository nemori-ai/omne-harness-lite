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
import { DEEPSEEK_OWNER } from './owner.ts'
import type { DeepSeekRecord, TokenLimitData, UpstreamData } from './record.ts'
import { DEEPSEEK_RECORDS } from './records.ts'

export type OfficialProfilesInput = Readonly<{
  retryPolicy: Adoption
  compactionTriggerPercent: string
}>

const PERCENT = /^(100|[1-9][0-9]?)$/

function upstreamOf(record: DeepSeekRecord, data: UpstreamData): UpstreamLimit {
  return data.kind === 'finite'
    ? { kind: 'finite', amount: data.amount, source: componentAdoption(record, 'evidence') }
    : { kind: 'unknown' }
}

function tokenLimit(record: DeepSeekRecord, supplier: Adoption, data: TokenLimitData): TokenLimit {
  return {
    provided: data.provided,
    upstream: [{ supplier, limit: upstreamOf(record, data.upstream) }],
  }
}

export function effortMapping(record: DeepSeekRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'deepseek/deepseek-v4.1-flash':
    case 'deepseek/deepseek-v4.1-flash-1017':
    case 'deepseek/deepseek-v4-pro-0813':
    case 'deepseek/deepseek-v4-flash-0731':
    case 'deepseek/deepseek-v4-flash-vision-exp':
      return { low: 'low', medium: 'high', high: 'max' }
    case 'deepseek/deepseek-v4-pro':
    case 'deepseek/deepseek-v4-flash':
      return { medium: 'high', high: 'max' }
    default:
      return {}
  }
}

export function profileOf(
  record: DeepSeekRecord,
  input: OfficialProfilesInput,
): ModelProfileDefinition {
  const supplier = recordAdoption(DEEPSEEK_OWNER, record)
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

export function officialDeepSeekProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition[] {
  if (
    typeof input.compactionTriggerPercent !== 'string' ||
    !PERCENT.test(input.compactionTriggerPercent)
  )
    throw new RangeError('compactionTriggerPercent must be a decimal integer from 1 to 100')
  const records: readonly DeepSeekRecord[] = DEEPSEEK_RECORDS
  return records
    .filter(record => record.status === 'current')
    .map(record => profileOf(record, input))
}
