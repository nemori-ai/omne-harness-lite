import {
  isAssetCategory,
  capabilityCanonicalString,
  type CapabilityId,
} from '@omne-harness-lite/asset-model'
import { judgeEffectiveAssembly, type EffectiveAssembly } from '@omne-harness-lite/asset-evaluation'
import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  LosslessNumber,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { validate as validateTool } from '@omne-harness-lite/tool-definition'
import type {
  AppendFacts,
  AppendDecision,
  CheckedAppend,
  EvaluationProjection,
  ManifestAppendInput,
  ManifestSessionRef,
  Presence,
} from './types.ts'

function object(value: JsonValue): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function closed(value: JsonObject, members: readonly string[]): boolean {
  return (
    Object.keys(value).length === members.length && members.every(key => Object.hasOwn(value, key))
  )
}
export function sessionRef(value: unknown): ManifestSessionRef | undefined {
  const parsed = parseOpaqueIdentifier(value, 'SessionRef')
  return 'ok' in parsed ? parsed.ok : undefined
}
export function checkManifestAppendInput(
  session: unknown,
  expectedHead: unknown,
  value: unknown,
): { readonly ok: CheckedAppend } | { readonly failure: 'invalidInput' } {
  const identity = sessionRef(session)
  const head = copyJsonValue(expectedHead)
  const copied = copyJsonValue(value)
  const bad = { failure: 'invalidInput' } as const
  if (
    identity === undefined ||
    'failed' in head ||
    !isNonNegativeJsonInteger(head.ok) ||
    'failed' in copied ||
    !object(copied.ok)
  )
    return bad
  const record = copied.ok
  if (
    !closed(record, ['evaluation', 'tables', 'content']) ||
    record.evaluation === undefined ||
    !object(record.evaluation) ||
    record.tables === undefined ||
    !object(record.tables) ||
    Object.keys(record.tables).length === 0
  )
    return bad
  const evaluation = record.evaluation
  if (evaluation.kind === 'mint') {
    if (!closed(evaluation, ['kind'])) return bad
  } else if (evaluation.kind === 'given' || evaluation.kind === 'reuse') {
    if (
      !closed(evaluation, ['kind', 'ref']) ||
      !('ok' in parseOpaqueIdentifier(evaluation.ref, 'EvaluationRef'))
    )
      return bad
  } else return bad
  for (const [category, table] of Object.entries(record.tables)) {
    if (
      !isAssetCategory(category) ||
      !object(table) ||
      !closed(table, ['filledAt', 'composition']) ||
      !('ok' in instantFromEpochMs(table.filledAt))
    )
      return bad
  }
  return {
    ok: Object.freeze({
      session: identity,
      expectedHead: head.ok as JsonNumber,
      record: record as unknown as ManifestAppendInput,
    }),
  }
}
export function judgeManifestAppend(
  facts: AppendFacts,
  request: CheckedAppend,
): AppendDecision | { readonly admissible: true } {
  const kind = request.record.evaluation.kind
  if (kind === 'given' && facts.owner !== undefined) {
    if (facts.owner.session === request.session && facts.owner.evaluation.kind === 'given')
      return { failure: 'alreadyRecorded', record: facts.owner }
    return { failure: 'evaluationRefConflict' }
  }
  if (kind === 'reuse' && (facts.owner === undefined || facts.owner.session !== request.session))
    return { failure: 'recordNotFound' }
  if (ExactDecimal.from(request.expectedHead).compare(ExactDecimal.from(facts.head)) !== 0)
    return { failure: 'headMismatch', head: facts.head }
  const categories = Object.entries(request.record.tables).flatMap(([category, table]) => {
    const previous = facts.filledAt[category as keyof typeof facts.filledAt]
    return previous !== undefined && table.filledAt <= previous
      ? [category as keyof typeof facts.filledAt]
      : []
  })
  return categories.length > 0
    ? { failure: 'filledAtNotIncreasing', categories: Object.freeze(categories) }
    : { admissible: true }
}
export function validNames(value: unknown): value is readonly string[] {
  const copy = copyJsonValue(value)
  return (
    'ok' in copy &&
    Array.isArray(copy.ok) &&
    copy.ok.length > 0 &&
    copy.ok.every(name => validateTool('DependencyName', name).valid) &&
    new Set(copy.ok).size === copy.ok.length
  )
}
export function answerPresence(
  snapshot: Readonly<Record<string, Presence>>,
  names: readonly string[],
): { readonly presence: Readonly<Record<string, Presence>> } | { readonly failure: 'unavailable' } {
  const presence: Record<string, Presence> = Object.create(null) as Record<string, Presence>
  for (const name of names) {
    if (
      !Object.hasOwn(snapshot, name) ||
      (snapshot[name] !== 'present' && snapshot[name] !== 'absent')
    )
      return { failure: 'unavailable' }
    presence[name] = snapshot[name]
  }
  return { presence: Object.freeze(presence) }
}
export function readEvaluationProjection(
  content: unknown,
):
  | { readonly ok: EvaluationProjection }
  | { readonly failure: 'unavailable'; readonly reason: 'invalid_evaluation_content' } {
  const bad = { failure: 'unavailable', reason: 'invalid_evaluation_content' } as const
  const copied = copyJsonValue(content)
  if (
    'failed' in copied ||
    !object(copied.ok) ||
    !judgeEffectiveAssembly(copied.ok.evaluation) ||
    !Array.isArray(copied.ok.compositionOrder)
  )
    return bad
  const evaluation = copied.ok.evaluation as unknown as EffectiveAssembly
  const order = copied.ok.compositionOrder
  if (order.length !== evaluation.composition.length) return bad
  const members = new Set(evaluation.composition.map(capabilityCanonicalString))
  for (const capability of order) {
    if (
      !object(capability) ||
      !closed(capability, ['category', 'name']) ||
      !isAssetCategory(capability.category) ||
      typeof capability.name !== 'string'
    )
      return bad
    // All allowed identifiers come from the public full result judge; compare without parsing a possibly invalid extra name.
    const key = `${capability.category}/${capability.name}`
    if (!members.delete(key)) return bad
  }
  return {
    ok: Object.freeze({
      evaluation,
      compositionOrder: order as unknown as readonly CapabilityId[],
    }),
  }
}

/** MF4 S-36 checks the represented request only; range requires actual IO. */
export function checkManifestGivenReadInput(
  session: unknown,
  headValue: unknown,
):
  | { readonly ok: { readonly session: ManifestSessionRef; readonly head: JsonNumber } }
  | { readonly failure: 'invalidInput' } {
  const identity = sessionRef(session)
  const copied = copyJsonValue(headValue)
  if (identity === undefined || 'failed' in copied || !isNonNegativeJsonInteger(copied.ok))
    return { failure: 'invalidInput' }
  return { ok: Object.freeze({ session: identity, head: copied.ok }) }
}
