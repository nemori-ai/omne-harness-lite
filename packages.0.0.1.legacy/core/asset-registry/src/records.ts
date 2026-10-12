import {
  capabilityCanonicalString,
  createAssetModelJudge,
  type AssetModelJudge,
  type CapabilityId,
} from '@omne-harness-lite/asset-model'
import {
  defaultBodyContracts,
  judgeEffectiveAssembly,
  type EffectiveAssembly,
  type AssetEvaluator,
} from '@omne-harness-lite/asset-evaluation'
import { readEvaluationProjection, type ManifestRecord } from '@omne-harness-lite/assembly-manifest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { modelName } from '@omne-harness-lite/tool-definition'
import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import { closed, equal, object, own, requiredOwn } from './json.ts'
import {
  REGISTERED_CATEGORIES,
  type RegisteredCategory,
  type CompositionEntry,
  type FilledBy,
  type CheckedRegistryRecord,
  type RootSourceProof,
} from './types.ts'
let assetJudge: AssetModelJudge | undefined
export function getAssetJudge(): AssetModelJudge {
  return (assetJudge ??= createAssetModelJudge(defaultBodyContracts))
}
export function capability(value: unknown): value is CapabilityId {
  return 'ok' in getAssetJudge().judgeAssetValue('CapabilityId', value)
}
export function registered(value: unknown): value is RegisteredCategory {
  return typeof value === 'string' && REGISTERED_CATEGORIES.includes(value as RegisteredCategory)
}
export function session(value: unknown): value is string {
  return 'ok' in parseOpaqueIdentifier(value, 'SessionRef')
}
export function order(value: unknown): value is readonly CapabilityId[] {
  const copied = own(value)
  return (
    Array.isArray(copied) &&
    copied.every(capability) &&
    new Set(copied.map(capabilityCanonicalString)).size === copied.length
  )
}
export function permutation(
  evaluation: EffectiveAssembly,
  sequence: readonly CapabilityId[],
): boolean {
  return (
    order(sequence) &&
    sequence.length === evaluation.composition.length &&
    evaluation.composition.every(item => sequence.some(member => equal(item, member)))
  )
}
export function filledBy(value: unknown): value is FilledBy {
  return (
    (closed(value, ['kind']) &&
      ['assembly', 'auto_refresh_after_failure', 'asset_change'].includes(String(value.kind))) ||
    (closed(value, ['kind', 'command']) &&
      value.kind === 'reload' &&
      typeof value.command === 'string' &&
      REGISTERED_CATEGORIES.some(cat => value.command === `omne-official:reload-${cat}`))
  )
}
export function compositionFor(
  evaluation: EffectiveAssembly,
  sequence: readonly CapabilityId[],
  category: RegisteredCategory,
): readonly CompositionEntry[] | undefined {
  const result: CompositionEntry[] = []
  for (const id of sequence.filter(id => id.category === category)) {
    const matches = evaluation.assets.filter(asset => equal(asset.capability, id))
    const entry = matches[0]
    if (
      matches.length !== 1 ||
      entry === undefined ||
      ((category === 'tool' || category === 'skill') && typeof entry.resident !== 'boolean')
    )
      return undefined
    result.push({
      capability: entry.capability,
      asset: entry.asset,
      version: entry.version,
      from: entry.from,
      ...(category === 'tool' || category === 'skill'
        ? { resident: entry.resident as boolean }
        : {}),
    })
  }
  return requiredOwn(result)
}
function recordEnvelope(
  value: unknown,
  expectedSession: string,
  head: number,
): value is JsonObject {
  return (
    closed(value, ['session', 'seq', 'evaluationRef', 'evaluation', 'tables', 'content']) &&
    value.session === expectedSession &&
    typeof value.seq === 'number' &&
    Number.isSafeInteger(value.seq) &&
    value.seq >= 1 &&
    !(value.seq > head) &&
    'ok' in parseOpaqueIdentifier(value.evaluationRef, 'EvaluationRef')
  )
}
function recordIdentity(identity: JsonObject, ref: JsonValue | undefined): boolean {
  return identity.kind === 'mint'
    ? closed(identity, ['kind'])
    : closed(identity, ['kind', 'ref']) &&
        ['given', 'reuse'].includes(String(identity.kind)) &&
        identity.ref === ref
}
function recordPurpose(kind: JsonValue | undefined, reason: FilledBy): boolean {
  return kind === 'given'
    ? reason.kind === 'assembly'
    : kind === 'mint'
      ? reason.kind === 'reload'
      : ['auto_refresh_after_failure', 'asset_change'].includes(reason.kind)
}
function recordCategories(
  tables: JsonObject,
  kind: JsonValue | undefined,
): RegisteredCategory[] | undefined {
  const categories = Object.keys(tables)
  if (
    categories.length === 0 ||
    !categories.every(registered) ||
    (kind === 'given' &&
      (categories.length !== 6 ||
        !REGISTERED_CATEGORIES.every(cat => Object.hasOwn(tables, cat)))) ||
    (kind === 'reuse' && (categories.length !== 1 || categories[0] !== 'slash_command'))
  )
    return undefined
  return categories
}
function subsequence(actual: readonly JsonValue[], expected: readonly CompositionEntry[]): boolean {
  let cursor = 0
  for (const entry of actual) {
    while (cursor < expected.length && !equal(expected[cursor], entry)) cursor++
    if (cursor >= expected.length) return false
    cursor++
  }
  return true
}
function readCompositions(
  tables: JsonObject,
  categories: readonly RegisteredCategory[],
  kind: JsonValue | undefined,
  evaluation: EffectiveAssembly,
  sequence: readonly CapabilityId[],
): CheckedRegistryRecord['compositions'] | undefined {
  const compositions: Partial<Record<RegisteredCategory, readonly CompositionEntry[]>> = {}
  for (const category of categories) {
    const table = tables[category]
    const expected = compositionFor(evaluation, sequence, category)
    if (
      !closed(table, ['filledAt', 'composition']) ||
      !('ok' in instantFromEpochMs(table.filledAt)) ||
      !Array.isArray(table.composition) ||
      expected === undefined
    )
      return undefined
    if (
      kind === 'reuse'
        ? !subsequence(table.composition, expected)
        : !equal(table.composition, expected)
    )
      return undefined
    compositions[category] = table.composition as unknown as readonly CompositionEntry[]
  }
  return compositions
}
/** Checks the complete AR use, including reuse subsequences. It does not prove storage or caller authority. */
export function readRegistryRecord(
  value: unknown,
  expectedSession: string,
  head: number,
  evaluator?: AssetEvaluator,
): CheckedRegistryRecord | undefined {
  const copied = own(value)
  if (
    !recordEnvelope(copied, expectedSession, head) ||
    !object(copied.evaluation) ||
    !object(copied.tables) ||
    !closed(copied.content, ['evaluation', 'compositionOrder', 'filledBy']) ||
    !filledBy(copied.content.filledBy)
  )
    return undefined
  const identity = copied.evaluation
  if (!recordIdentity(identity, copied.evaluationRef)) return undefined
  const projected = readEvaluationProjection(copied.content, evaluator)
  if (!('ok' in projected) || projected.ok.evaluation.unresolved.length !== 0) return undefined
  if (!recordPurpose(identity.kind, copied.content.filledBy)) return undefined
  const categories = recordCategories(copied.tables, identity.kind)
  if (categories === undefined) return undefined
  const compositions = readCompositions(
    copied.tables,
    categories,
    identity.kind,
    projected.ok.evaluation,
    projected.ok.compositionOrder,
  )
  if (compositions === undefined) return undefined
  return requiredOwn({
    record: copied as unknown as ManifestRecord,
    content: { ...projected.ok, filledBy: copied.content.filledBy as unknown as FilledBy },
    compositions,
  })
}
export function extractRootSourceFromFullFillRecord(
  value: unknown,
  expectedSession: unknown,
  head: unknown,
  evaluator?: AssetEvaluator,
): RootSourceProof | { readonly failure: 'unavailable' } {
  if (
    !session(expectedSession) ||
    typeof head !== 'number' ||
    !Number.isSafeInteger(head) ||
    head < 1
  )
    return { failure: 'unavailable' }
  const checked = readRegistryRecord(value, expectedSession, head, evaluator)
  if (
    checked === undefined ||
    checked.record.evaluation.kind !== 'given' ||
    checked.content.filledBy.kind !== 'assembly' ||
    Object.keys(checked.compositions).length !== 6
  )
    return { failure: 'unavailable' }
  const roots = checked.content.evaluation.assets.filter(asset =>
    equal(asset.capability, checked.content.evaluation.root),
  )
  const root = roots[0]
  if (roots.length !== 1 || root === undefined) return { failure: 'unavailable' }
  return requiredOwn({
    record: checked.record,
    rootSource: { asset: root.asset, version: root.version },
  })
}
export function effective(
  value: unknown,
  evaluator?: AssetEvaluator,
): EffectiveAssembly | undefined {
  const copy = own(value)
  return (evaluator?.judgeEffectiveAssembly ?? judgeEffectiveAssembly)(copy)
    ? (copy as unknown as EffectiveAssembly)
    : undefined
}
export function entryName(id: CapabilityId): string {
  return id.category === 'tool' ? modelName(id.name) : id.name
}
