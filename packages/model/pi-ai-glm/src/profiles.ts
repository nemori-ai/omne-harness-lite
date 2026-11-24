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
import { GLM_OWNER } from './owner.ts'
import type { GlmRecord, TokenLimitData, UpstreamData } from './record.ts'
import { GLM_RECORDS } from './records.ts'

export type OfficialProfilesInput = Readonly<{
  retryPolicy: Adoption
  compactionTriggerPercent: string
}>

const PERCENT = /^(100|[1-9][0-9]?)$/

function upstreamOf(record: GlmRecord, data: UpstreamData): UpstreamLimit {
  return data.kind === 'finite'
    ? { kind: 'finite', amount: data.amount, source: componentAdoption(record, 'evidence') }
    : { kind: 'unknown' }
}

function tokenLimit(record: GlmRecord, supplier: Adoption, data: TokenLimitData): TokenLimit {
  return {
    provided: data.provided,
    upstream: [{ supplier, limit: upstreamOf(record, data.upstream) }],
  }
}

export function effortMapping(record: GlmRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'z-ai/glm-5.3':
    case 'z-ai/glm-5.3-prime':
    case 'z-ai/glm-5.3-flash':
    case 'z-ai/glm-5.3-flashx':
      return { low: 'low', medium: 'high', high: 'max' }
    case 'z-ai/glm-5.2':
      return { high: 'high', xhigh: 'xhigh' }
    default:
      return {}
  }
}

export function profileOf(record: GlmRecord, input: OfficialProfilesInput): ModelProfileDefinition {
  const supplier = recordAdoption(GLM_OWNER, record)
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

export function officialGlmProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition[] {
  if (
    typeof input.compactionTriggerPercent !== 'string' ||
    !PERCENT.test(input.compactionTriggerPercent)
  )
    throw new RangeError('compactionTriggerPercent must be a decimal integer from 1 to 100')
  const records: readonly GlmRecord[] = GLM_RECORDS
  return records
    .filter(record => record.status === 'current')
    .map(record => profileOf(record, input))
}
