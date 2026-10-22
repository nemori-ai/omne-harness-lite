import type { CompactionPolicy, RepresentationPolicyConfig } from './ports.js'
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
  isEvidence,
  isConsumed,
} from './schema-primitives.js'
import { isCoverage } from './coverage-validation.js'
export type { Path, Decoded, Decoder } from './schema-primitives.js'
export { standardSchema, record, decimal } from './schema-primitives.js'
export const compactionPolicySchema = standardSchema<CompactionPolicy>((v, path) => {
  if (
    !record(v) ||
    !record(v.retainBudget) ||
    !(v.retainPreference === 'newest-first' || v.retainPreference === 'most-referenced') ||
    !(
      v.triggerPercent === null ||
      (decimal(v.triggerPercent) && Number(v.triggerPercent) <= 100)
    ) ||
    !(v.headroomTokens === null || integer(v.headroomTokens)) ||
    typeof v.trimFirst !== 'boolean' ||
    !integer(v.stepBound) ||
    BigInt(v.stepBound) < (v.trimFirst ? 2n : 1n)
  )
    return reject(path)
  const b = v.retainBudget
  const retainBudget =
    b.kind === 'ratio' && decimal(b.retainRatio) && Number(b.retainRatio) <= 1
      ? { kind: 'ratio' as const, retainRatio: b.retainRatio }
      : b.kind === 'tokens' && integer(b.retainTokens)
        ? { kind: 'tokens' as const, retainTokens: b.retainTokens }
        : null
  return retainBudget === null
    ? reject(path)
    : {
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
})
function choices(v: unknown): v is readonly ('original' | 'derived' | 'transcript')[] {
  return Array.isArray(v) && v.every(x => x === 'original' || x === 'derived' || x === 'transcript')
}
export const representationPolicyConfigSchema = standardSchema<RepresentationPolicyConfig>(
  (v, path) => {
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
  },
)
export const planProgressSchema = standardSchema<PlanProgress>((v, path) => {
  if (
    !record(v) ||
    !integer(v.completed) ||
    !Array.isArray(v.consumed) ||
    !v.consumed.every(
      (x, index) =>
        record(x) &&
        integer(x.index) &&
        BigInt(x.index) === BigInt(index) &&
        isEvidence(x.evidence),
    ) ||
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
})
export const compactionPlanSchema = standardSchema<CompactionPlan>((v, path) => {
  if (
    !record(v) ||
    !record(v.policy) ||
    !adoption(v.policy.identity) ||
    typeof v.policy.configDigest !== 'string' ||
    !integer(v.bound) ||
    BigInt(v.bound) < 1n ||
    !record(v.covers) ||
    !Array.isArray(v.retained) ||
    !Array.isArray(v.floor) ||
    !Array.isArray(v.after) ||
    !(v.shape === 'trim-then-summarize' || v.shape === 'summarize')
  )
    return reject(path)
  const id = decodePlanId(v.planId),
    candidate = decodeCandidateRef(v.candidate),
    epoch = decodeEpochId(v.epoch)
  const from = typeof v.covers.from === 'string' ? parseRecordEntryRef(v.covers.from) : null,
    to = typeof v.covers.to === 'string' ? parseRecordEntryRef(v.covers.to) : null
  const after = v.after.map(judgeMessage)
  const retained = v.retained.map(x => (typeof x === 'string' ? parseRecordEntryRef(x) : null)),
    floor = v.floor.map(x => (typeof x === 'string' ? parseRecordEntryRef(x) : null))
  if (
    after.some(x => 'rejected' in x) ||
    'failure' in id ||
    'failure' in candidate ||
    'failure' in epoch ||
    from === null ||
    to === null ||
    retained.some(x => x === null) ||
    floor.some(x => x === null) ||
    new Set(retained).size !== retained.length ||
    floor.some(ref => !retained.includes(ref))
  )
    return reject(path)
  return {
    ok: true,
    value: {
      planId: id.ok,
      candidate: candidate.ok,
      epoch: epoch.ok,
      bound: v.bound,
      policy: { identity: v.policy.identity, configDigest: v.policy.configDigest },
      covers: { from, to },
      retained: retained.filter(x => x !== null),
      floor: floor.filter(x => x !== null),
      after: after.flatMap(x => ('ok' in x ? [x.ok] : [])),
      shape: v.shape,
    },
  }
})
export const coverageSchema = standardSchema<Coverage>((v, p) =>
  isCoverage(v) ? { ok: true, value: structuredClone(v) } : reject(p),
)
