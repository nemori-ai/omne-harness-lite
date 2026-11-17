import {
  compactionPolicySchema,
  type CompactionPolicy,
  type CompactionPolicyPort,
} from '@omne-harness/request-context-contract'
import { adoptionDigest, digest } from './digest.ts'
import { decodeParameters } from './policy-input.ts'

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = Object.freeze({
  triggerPercent: null,
  headroomTokens: null,
})
export type DefaultCompactionOptions = Readonly<{ config?: Partial<CompactionPolicy> }>

export function createDefaultCompactionPolicy(
  options: DefaultCompactionOptions = {},
): CompactionPolicyPort {
  const config = Object.freeze(
    decodeParameters(
      compactionPolicySchema,
      { ...DEFAULT_COMPACTION_POLICY, ...options.config },
      'The compaction trigger configuration',
    ),
  )
  return {
    identity: {
      owner: 'request-context',
      name: 'default-compaction-trigger',
      revision: '1',
      digest: adoptionDigest({ strategy: 'default-compaction-trigger', revision: '1' }),
    },
    config,
    configDigest: () => digest(config),
  }
}
