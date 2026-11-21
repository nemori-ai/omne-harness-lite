import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'
import type { Adoption } from './refs.js'
import type { CompactionPolicy } from './ports.js'
import { compactionPolicySchema } from './schema.js'
import { standardSchema, record, adoption, type Decoder } from './schema-primitives.js'
export type CompactionSettingsValue = CompactionPolicy & Readonly<{ policy: Adoption }>
declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'context.compaction-settings': CompactionSettingsValue
  }
}
const decodeCompactionSettings: Decoder<CompactionSettingsValue> = (v, path) => {
  const policy = compactionPolicySchema['~standard'].validate(
    record(v) ? { triggerPercent: v.triggerPercent, headroomTokens: v.headroomTokens } : v,
  )
  if (
    policy instanceof Promise ||
    'issues' in policy ||
    !record(v) ||
    !adoption(v.policy) ||
    Object.keys(v).some(key => !['policy', 'triggerPercent', 'headroomTokens'].includes(key))
  )
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
