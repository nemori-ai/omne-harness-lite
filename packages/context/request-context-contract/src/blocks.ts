import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'
import type { Adoption, CandidateRef } from './refs.js'
import { decodeCandidateRef } from './refs.js'
import type { RetainBudget, CompactionPolicy } from './ports.js'
import { compactionPolicySchema } from './schema.js'
import { standardSchema, record, decimal, adoption, type Decoder } from './schema-primitives.js'
export type CompactionSettingsValue = Readonly<{
  policy: Adoption
  retainBudget: RetainBudget
  retainPreference: CompactionPolicy['retainPreference']
  triggerPercent: string | null
  headroomTokens: string | null
  trimFirst: boolean
  stepBound: string
}>
export type WindowUsageValue = Readonly<{
  candidate: CandidateRef
  usedTokens: string
  windowTokens: string
  ratio: string
}>
declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'context.compaction-settings': CompactionSettingsValue
    'context.window-usage': WindowUsageValue
  }
}
const decodeCompactionSettings: Decoder<CompactionSettingsValue> = (v, path) => {
  const policy = compactionPolicySchema['~standard'].validate(v)
  if (policy instanceof Promise || 'issues' in policy || !record(v) || !adoption(v.policy))
    return { ok: false, issues: [{ path, message: 'Invalid compaction settings' }] }
  return {
    ok: true,
    value: {
      ...policy.value,
      policy: {
        owner: v.policy.owner,
        name: v.policy.name,
        revision: v.policy.revision,
        digest: v.policy.digest,
      },
    },
  }
}
export const compactionSettingsSchema = standardSchema(decodeCompactionSettings)
const decodeWindowUsage: Decoder<WindowUsageValue> = (v, path) => {
  const candidate = decodeCandidateRef(record(v) ? v.candidate : null)
  if (
    !record(v) ||
    'failure' in candidate ||
    !decimal(v.usedTokens) ||
    !decimal(v.windowTokens) ||
    !decimal(v.ratio) ||
    Number(v.ratio) > 1
  )
    return { ok: false, issues: [{ path, message: 'Invalid window usage' }] }
  return {
    ok: true,
    value: {
      candidate: candidate.ok,
      usedTokens: v.usedTokens,
      windowTokens: v.windowTokens,
      ratio: v.ratio,
    },
  }
}
export const windowUsageSchema = standardSchema(decodeWindowUsage)
export const compactionSettingsBlock: SuppliedBlockDescriptor<
  'context.compaction-settings',
  CompactionSettingsValue
> = Object.freeze({
  kind: 'supplied',
  key: 'context.compaction-settings',
  schema: compactionSettingsSchema,
  consumers: ['model'] as const,
  required: true,
  disclosure: 'plain',
  carriesPrevious: true,
  volatility: 'stable',
  recovery: 'reread',
})
export const windowUsageBlock: SuppliedBlockDescriptor<'context.window-usage', WindowUsageValue> =
  Object.freeze({
    kind: 'supplied',
    key: 'context.window-usage',
    schema: windowUsageSchema,
    consumers: ['model'] as const,
    required: true,
    disclosure: 'plain',
    carriesPrevious: false,
    volatility: 'per-request',
    recovery: 'recompute',
  })
