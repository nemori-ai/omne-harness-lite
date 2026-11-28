import type {
  Adoption,
  ModelLimit,
  ModelProfileDefinition,
  ReasoningEffortMapping,
  TokenLimit,
  UpstreamLimit,
} from '@omne-harness/model-contract'
import { recordAdoption, recordProvider } from '../family-table.ts'
import { componentAdoption } from './adoptions.ts'
import type { GatewayRecord, TokenLimitData, UpstreamData } from './record.ts'

export type OfficialProfilesInput = Readonly<{
  retryPolicy: Adoption
  compactionTriggerPercent: string
}>

export type EffortMappingOf<R extends GatewayRecord> = (record: R) => ReasoningEffortMapping

const PERCENT = /^(100|[1-9][0-9]?)$/

function upstreamOf(owner: string, record: GatewayRecord, data: UpstreamData): UpstreamLimit {
  return data.kind === 'finite'
    ? { kind: 'finite', amount: data.amount, source: componentAdoption(owner, record, 'evidence') }
    : { kind: 'unknown' }
}

function tokenLimit(
  owner: string,
  record: GatewayRecord,
  supplier: Adoption,
  data: TokenLimitData,
): TokenLimit {
  return {
    provided: data.provided,
    upstream: [{ supplier, limit: upstreamOf(owner, record, data.upstream) }],
  }
}

function profileOf<R extends GatewayRecord>(
  owner: string,
  record: R,
  input: OfficialProfilesInput,
  effortMapping: EffortMappingOf<R>,
): ModelProfileDefinition<'llm'> {
  const supplier = recordAdoption(owner, record)
  const { context } = record.profile
  const limits: ModelLimit[] = record.profile.limits.map(limit => ({
    metric: limit.metric,
    provided: limit.provided,
    upstream: [{ supplier, limit: upstreamOf(owner, record, limit.upstream) }],
  }))
  // The file byte limit is the record's own offering on the wire; no upstream value is known.
  if (record.wire.file !== undefined)
    limits.push({
      metric: 'file-bytes',
      provided: String(record.wire.file.maxBytes),
      upstream: [{ supplier, limit: { kind: 'unknown' } }],
    })
  return {
    kind: 'llm',
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
      window: tokenLimit(owner, record, supplier, context.window),
      input: context.input === null ? null : tokenLimit(owner, record, supplier, context.input),
      output: tokenLimit(owner, record, supplier, context.output),
      compactionTriggerPercent: input.compactionTriggerPercent,
    },
    limits,
    parameters: [],
    reasoningEfforts: effortMapping(record),
    representation: componentAdoption(owner, record, 'representation'),
    meter: componentAdoption(owner, record, 'meter'),
    retryPolicy: input.retryPolicy,
  }
}

/** The official profile of every current record: frozen records keep serving old adoptions only. */
export function officialProfilesOf<R extends GatewayRecord>(
  owner: string,
  records: readonly R[],
  input: OfficialProfilesInput,
  effortMapping: EffortMappingOf<R>,
): readonly ModelProfileDefinition<'llm'>[] {
  if (
    typeof input.compactionTriggerPercent !== 'string' ||
    !PERCENT.test(input.compactionTriggerPercent)
  )
    throw new RangeError('compactionTriggerPercent must be a decimal integer from 1 to 100')
  return records
    .filter(record => record.status === 'current')
    .map(record => profileOf(owner, record, input, effortMapping))
}
