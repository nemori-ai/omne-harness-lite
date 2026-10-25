import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'
import type { Adoption, CandidateRef } from './refs.js'
import { decodeCandidateRef } from './refs.js'
import type { RetainBudget, CompactionPolicy } from './ports.js'
import { compactionPolicySchema } from './schema.js'
import { standardSchema, record, integer, adoption, type Decoder } from './schema-primitives.js'
export type CompactionSettingsValue = Readonly<{
  policy: Adoption
  retainBudget: RetainBudget
  retainPreference: CompactionPolicy['retainPreference']
  triggerPercent: string | null
  headroomTokens: string | null
  trimFirst: boolean
  stepBound: string
}>
/**
 * The window usage of the current fixed request of one target (RQ-02). `not-fixed` and
 * `unmeasured` are valid required facts, not a missing block; numeric branches never default to 0.
 */
export type WindowUsageValue =
  | Readonly<{ kind: 'not-fixed' }>
  | Readonly<{ kind: 'unmeasured'; candidate: CandidateRef; windowTokens: string }>
  | Readonly<{
      kind: 'actual' | 'estimate'
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
const POSITIVE = /^[1-9][0-9]*$/u
function exactKeys(v: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(v)
  return own.length === keys.length && keys.every(k => Object.hasOwn(v, k))
}
/** `used/window` rounded up to six decimals with trailing zeros removed; may exceed 1. */
export function windowRatio(usedTokens: string, windowTokens: string): string {
  const scaled =
    (BigInt(usedTokens) * 1_000_000n + BigInt(windowTokens) - 1n) / BigInt(windowTokens)
  const whole = scaled / 1_000_000n
  const fraction = (scaled % 1_000_000n).toString().padStart(6, '0').replace(/0+$/u, '')
  return fraction.length ? `${whole}.${fraction}` : whole.toString()
}
const decodeWindowUsage: Decoder<WindowUsageValue> = (v, path) => {
  const bad = { ok: false as const, issues: [{ path, message: 'Invalid window usage' }] }
  if (!record(v)) return bad
  if (v.kind === 'not-fixed')
    return exactKeys(v, ['kind']) ? { ok: true, value: { kind: 'not-fixed' } } : bad
  const candidate = decodeCandidateRef(v.candidate)
  if (
    'failure' in candidate ||
    typeof v.windowTokens !== 'string' ||
    !POSITIVE.test(v.windowTokens)
  )
    return bad
  if (v.kind === 'unmeasured')
    return exactKeys(v, ['kind', 'candidate', 'windowTokens'])
      ? {
          ok: true,
          value: { kind: 'unmeasured', candidate: candidate.ok, windowTokens: v.windowTokens },
        }
      : bad
  if (
    (v.kind !== 'actual' && v.kind !== 'estimate') ||
    !exactKeys(v, ['kind', 'candidate', 'usedTokens', 'windowTokens', 'ratio']) ||
    !integer(v.usedTokens) ||
    v.ratio !== windowRatio(v.usedTokens, v.windowTokens)
  )
    return bad
  return {
    ok: true,
    value: {
      kind: v.kind,
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
