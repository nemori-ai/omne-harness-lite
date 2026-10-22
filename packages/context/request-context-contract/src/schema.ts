import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { decodeRevision } from '@omne-harness/model-contract'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CompactionPolicy, RepresentationPolicyConfig } from './ports.js'
import type { CompactionPlan, PlanProgress, Coverage } from './values.js'
import { decodePlanId, decodeCandidateRef, decodeEpochId, decodeBatchRef } from './refs.js'
import { parseRecordEntryRef, judgeMessage, parseMessageId } from '@omne-harness/message'
export type Path = readonly (string | number)[]
export type Decoded<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly Readonly<{ path: Path; message: string }>[] }>
export type Decoder<T> = (value: unknown, path: Path) => Decoded<T>
export function standardSchema<T>(decode: Decoder<T>): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'omne-request-context',
      validate(value) {
        const result = decode(value, [])
        return result.ok
          ? { value: result.value }
          : { issues: result.issues.map(i => ({ message: i.message, path: [...i.path] })) }
      },
    },
  }
}
export function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
export function decimal(v: unknown): v is string {
  return typeof v === 'string' && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(v)
}
function revision(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
}
function integer(v: unknown): v is string {
  return typeof v === 'string' && /^(0|[1-9][0-9]*)$/u.test(v)
}
function reject(path: Path): Decoded<never> {
  return { ok: false, issues: [{ path, message: 'Invalid request-context contract value' }] }
}
function adoption(v: unknown): v is import('./refs.js').Adoption {
  return (
    record(v) &&
    typeof v.owner === 'string' &&
    typeof v.name === 'string' &&
    typeof v.revision === 'string' &&
    typeof v.digest === 'string'
  )
}
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
function ref(value: unknown): boolean {
  return typeof value === 'string' && parseRecordEntryRef(value) !== null
}
function scope(value: unknown): boolean {
  return !('failure' in decodeScopeRef(value))
}
function stringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(x => typeof x === 'string')
}
function reference(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.storage === 'string' &&
    typeof value.key === 'string' &&
    typeof value.mediaType === 'string' &&
    integer(value.bytes) &&
    typeof value.digest === 'string'
  )
}
function alteration(value: unknown): boolean {
  return (
    record(value) &&
    isEvidence(value.evidence) &&
    (value.touches === 'existing-layers' || value.touches === 'history-tail')
  )
}
function representation(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.message === 'string' &&
    parseMessageId(value.message).ok &&
    typeof value.block === 'string' &&
    value.block.length > 0 &&
    ['original', 'derived', 'transcript', 'pending-load'].includes(String(value.choice)) &&
    (value.converter === null || adoption(value.converter)) &&
    (value.mediaType === null || typeof value.mediaType === 'string')
  )
}
function isCoverage(v: unknown): v is Coverage {
  if (
    !record(v) ||
    !record(v.history) ||
    !record(v.compactions) ||
    !record(v.inputs) ||
    !record(v.snapshot) ||
    !record(v.prompt) ||
    !record(v.model) ||
    !record(v.tools) ||
    !record(v.conditions) ||
    !record(v.budget)
  )
    return false
  const h = v.history,
    s = v.snapshot,
    p = v.prompt,
    m = v.model,
    t = v.tools,
    b = v.budget
  if (
    'failure' in decodeEpochId(h.epoch) ||
    !Number.isSafeInteger(h.upper) ||
    !Array.isArray(h.anchors) ||
    !h.anchors.every(
      a =>
        record(a) &&
        ['history-head', 'snapshot-reminder', 'history-body'].includes(String(a.layer)) &&
        Number.isSafeInteger(a.seq) &&
        typeof a.prefixDigest === 'string',
    )
  )
    return false
  if (
    !(v.compactions.record === null || ref(v.compactions.record)) ||
    !(v.compactions.derivation === null || typeof v.compactions.derivation === 'string') ||
    'failure' in decodeBatchRef(v.inputs.batch) ||
    !(v.inputs.saved === null || isEvidence(v.inputs.saved))
  )
    return false
  if (
    !scope(s.scope) ||
    !record(s.eligibility) ||
    typeof s.eligibility.eligibility !== 'string' ||
    !revision(s.revision) ||
    !record(s.anchor) ||
    'failure' in decodeEpochId(s.anchor.epoch) ||
    !Number.isSafeInteger(s.anchor.seq) ||
    !(typeof s.anchor.prefixDigest === 'string' || s.anchor.prefixDigest === null) ||
    !(s.content === 'full' || s.content === 'incremental')
  )
    return false
  if (
    !Array.isArray(p.sections) ||
    !p.sections.every(
      x =>
        record(x) &&
        typeof x.name === 'string' &&
        (x.scope === null || scope(x.scope)) &&
        adoption(x.source) &&
        typeof x.revision === 'string',
    ) ||
    typeof p.digest !== 'string' ||
    !(p.generation === null || typeof p.generation === 'string')
  )
    return false
  if (
    !adoption(m.profile) ||
    'failure' in decodeRevision(m.revision) ||
    typeof m.recipient !== 'string' ||
    typeof m.parametersDigest !== 'string' ||
    !(m.replay === 'on' || m.replay === 'off') ||
    !stringList(t.direct) ||
    !stringList(t.programmatic) ||
    typeof t.digest !== 'string'
  )
    return false
  return (
    isEvidence(v.conditions.evidence) &&
    typeof v.conditions.revision === 'string' &&
    Array.isArray(v.alterations) &&
    v.alterations.every(alteration) &&
    Array.isArray(v.representations) &&
    v.representations.every(representation) &&
    typeof b.inputDigest === 'string' &&
    (b.kind === 'complete' || b.kind === 'deferred-media') &&
    Array.isArray(b.deferred) &&
    b.deferred.every(reference) &&
    stringList(b.unknownLimits) &&
    [
      'new-full-read',
      'system-prompt-changed',
      'tool-set-changed',
      'compaction',
      'extension-altered',
      'model-changed',
      'unchanged',
    ].includes(String(v.prefixBreak))
  )
}
export const coverageSchema = standardSchema<Coverage>((v, p) =>
  isCoverage(v) ? { ok: true, value: structuredClone(v) } : reject(p),
)

function isEvidence(v: unknown): v is import('./refs.js').DurableEvidence {
  return record(v) && ['owner', 'record', 'revision', 'digest'].every(k => typeof v[k] === 'string')
}
function isConsumed(
  v: unknown,
): v is Readonly<{ index: string; evidence: import('./refs.js').DurableEvidence }> {
  return record(v) && integer(v.index) && isEvidence(v.evidence)
}
