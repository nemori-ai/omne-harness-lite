import type { CompactionPolicy, RepresentationPolicyConfig, RetainBudget } from './ports.js'
import type { CompactionPlan, PlanProgress, Coverage } from './values.js'
import { decodePlanId, decodeCandidateRef, decodeEpochId } from './refs.js'
import { parseRecordEntryRef, judgeMessage } from '@omne-harness/message'
import {
  standardSchema,
  record,
  decimal,
  integer,
  reject,
  adoption,
  isConsumed,
  type Decoder,
} from './schema-primitives.js'
import { isCoverage } from './coverage-validation.js'
export type { Path, Decoded, Decoder } from './schema-primitives.js'
export { standardSchema, record, decimal } from './schema-primitives.js'
type CompactionControls = Omit<CompactionPolicy, 'retainBudget'>
function isCompactionControls(
  v: Record<string, unknown>,
): v is Record<string, unknown> & CompactionControls {
  return (
    (v.retainPreference === 'newest-first' || v.retainPreference === 'most-referenced') &&
    (v.triggerPercent === null || (decimal(v.triggerPercent) && Number(v.triggerPercent) <= 100)) &&
    (v.headroomTokens === null || integer(v.headroomTokens)) &&
    typeof v.trimFirst === 'boolean' &&
    integer(v.stepBound) &&
    BigInt(v.stepBound) >= (v.trimFirst ? 2n : 1n)
  )
}
const decodeCompactionPolicy: Decoder<CompactionPolicy> = (v, path) => {
  if (!record(v) || !record(v.retainBudget) || !isCompactionControls(v)) return reject(path)
  const retainBudget = decodeRetainBudget(v.retainBudget)
  if (retainBudget === null) return reject(path)
  return {
    ok: true,
    value: {
      retainBudget,
      retainPreference: v.retainPreference,
      triggerPercent: v.triggerPercent,
      headroomTokens: v.headroomTokens,
      trimFirst: v.trimFirst,
      stepBound: v.stepBound,
    },
  }
}
export const compactionPolicySchema = standardSchema(decodeCompactionPolicy)
function decodeRetainBudget(b: Record<string, unknown>): RetainBudget | null {
  switch (b.kind) {
    case 'ratio':
      return decimal(b.retainRatio) && Number(b.retainRatio) <= 1
        ? { kind: 'ratio', retainRatio: b.retainRatio }
        : null
    case 'tokens':
      return integer(b.retainTokens) ? { kind: 'tokens', retainTokens: b.retainTokens } : null
    default:
      return null
  }
}
function choices(v: unknown): v is readonly ('original' | 'derived' | 'transcript')[] {
  return Array.isArray(v) && v.every(x => x === 'original' || x === 'derived' || x === 'transcript')
}
const decodeRepresentationPolicy: Decoder<RepresentationPolicyConfig> = (v, path) => {
  if (
    !record(v) ||
    !record(v.preferences) ||
    !choices(v.preferences.text) ||
    !choices(v.preferences.image) ||
    !choices(v.preferences.voice)
  )
    return reject(path)
  return {
    ok: true,
    value: {
      preferences: {
        text: [...v.preferences.text],
        image: [...v.preferences.image],
        voice: [...v.preferences.voice],
      },
    },
  }
}
export const representationPolicyConfigSchema = standardSchema(decodeRepresentationPolicy)
const decodePlanProgress: Decoder<PlanProgress> = (v, path) => {
  if (
    !record(v) ||
    !integer(v.completed) ||
    !Array.isArray(v.consumed) ||
    !v.consumed.every((x, index) => isConsumed(x) && BigInt(x.index) === BigInt(index)) ||
    BigInt(v.completed) !== BigInt(v.consumed.length)
  )
    return reject(path)
  const id = decodePlanId(v.planId)
  return 'failure' in id
    ? reject(path)
    : {
        ok: true,
        value: { planId: id.ok, completed: v.completed, consumed: v.consumed.filter(isConsumed) },
      }
}
export const planProgressSchema = standardSchema(decodePlanProgress)
type PlanHeader = Pick<CompactionPlan, 'policy' | 'bound' | 'shape'>
function isPlanHeader(v: Record<string, unknown>): v is Record<string, unknown> & PlanHeader {
  return (
    record(v.policy) &&
    adoption(v.policy.identity) &&
    typeof v.policy.configDigest === 'string' &&
    integer(v.bound) &&
    BigInt(v.bound) >= 1n &&
    (v.shape === 'trim-then-summarize' || v.shape === 'summarize')
  )
}
function decodePlanIdentity(
  v: Record<string, unknown>,
): Pick<CompactionPlan, 'planId' | 'candidate' | 'epoch'> | null {
  const id = decodePlanId(v.planId),
    candidate = decodeCandidateRef(v.candidate),
    epoch = decodeEpochId(v.epoch)
  return 'failure' in id || 'failure' in candidate || 'failure' in epoch
    ? null
    : { planId: id.ok, candidate: candidate.ok, epoch: epoch.ok }
}
function entryRef(v: unknown) {
  return typeof v === 'string' ? parseRecordEntryRef(v) : null
}
function decodePlanRange(
  v: Record<string, unknown>,
): Pick<CompactionPlan, 'covers' | 'retained' | 'floor'> | null {
  if (!record(v.covers) || !Array.isArray(v.retained) || !Array.isArray(v.floor)) return null
  const from = entryRef(v.covers.from),
    to = entryRef(v.covers.to)
  const retained = v.retained.map(entryRef),
    floor = v.floor.map(entryRef)
  if (
    from === null ||
    to === null ||
    retained.some(x => x === null) ||
    floor.some(x => x === null) ||
    new Set(retained).size !== retained.length ||
    floor.some(ref => !retained.includes(ref))
  )
    return null
  return {
    covers: { from, to },
    retained: retained.filter(x => x !== null),
    floor: floor.filter(x => x !== null),
  }
}
function decodeAfter(v: unknown): CompactionPlan['after'] | null {
  if (!Array.isArray(v)) return null
  const after = v.map(judgeMessage)
  return after.some(x => 'rejected' in x) ? null : after.flatMap(x => ('ok' in x ? [x.ok] : []))
}
const decodeCompactionPlan: Decoder<CompactionPlan> = (v, path) => {
  if (!record(v) || !isPlanHeader(v)) return reject(path)
  const identity = decodePlanIdentity(v),
    range = decodePlanRange(v),
    after = decodeAfter(v.after)
  if (identity === null || range === null || after === null) return reject(path)
  return {
    ok: true,
    value: {
      ...identity,
      ...range,
      after,
      bound: v.bound,
      policy: { identity: v.policy.identity, configDigest: v.policy.configDigest },
      shape: v.shape,
    },
  }
}
export const compactionPlanSchema = standardSchema(decodeCompactionPlan)
export const coverageSchema = standardSchema<Coverage>((v, p) =>
  isCoverage(v) ? { ok: true, value: structuredClone(v) } : reject(p),
)
