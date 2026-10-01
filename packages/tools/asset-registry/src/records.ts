import {
  capabilityCanonicalString,
  createAssetModelJudge,
  type CapabilityId,
} from '@omne-harness-lite/asset-model'
import {
  defaultBodyContracts,
  judgeEffectiveAssembly,
  type EffectiveAssembly,
} from '@omne-harness-lite/asset-evaluation'
import {
  readEvaluationProjection,
  type ManifestRecord,
} from '@omne-harness-lite/assembly-manifest-store'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { modelName } from '@omne-harness-lite/tool-definition'
import { closed, equal, object, own, requiredOwn } from './json.ts'
import {
  REGISTERED_CATEGORIES,
  type RegisteredCategory,
  type CompositionEntry,
  type FilledBy,
  type CheckedRegistryRecord,
  type RootSourceProof,
} from './types.ts'
export const assetJudge = createAssetModelJudge(defaultBodyContracts)
export function capability(value: unknown): value is CapabilityId {
  return 'ok' in assetJudge.judgeAssetValue('CapabilityId', value)
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
/** Checks the complete AR use, including reuse subsequences. It does not prove storage or caller authority. */
export function readRegistryRecord(
  value: unknown,
  expectedSession: string,
  head: number,
): CheckedRegistryRecord | undefined {
  const copied = own(value)
  if (
    !closed(copied, ['session', 'seq', 'evaluationRef', 'evaluation', 'tables', 'content']) ||
    copied.session !== expectedSession ||
    typeof copied.seq !== 'number' ||
    !Number.isSafeInteger(copied.seq) ||
    copied.seq < 1 ||
    copied.seq > head ||
    !('ok' in parseOpaqueIdentifier(copied.evaluationRef, 'EvaluationRef')) ||
    !object(copied.evaluation) ||
    !object(copied.tables) ||
    !closed(copied.content, ['evaluation', 'compositionOrder', 'filledBy']) ||
    !filledBy(copied.content.filledBy)
  )
    return undefined
  const identity = copied.evaluation
  if (
    identity.kind === 'mint'
      ? !closed(identity, ['kind'])
      : !closed(identity, ['kind', 'ref']) ||
        !['given', 'reuse'].includes(String(identity.kind)) ||
        identity.ref !== copied.evaluationRef
  )
    return undefined
  const projected = readEvaluationProjection(copied.content)
  if (!('ok' in projected) || projected.ok.evaluation.unresolved.length !== 0) return undefined
  if (
    identity.kind === 'given'
      ? copied.content.filledBy.kind !== 'assembly'
      : identity.kind === 'mint'
        ? copied.content.filledBy.kind !== 'reload'
        : !['auto_refresh_after_failure', 'asset_change'].includes(copied.content.filledBy.kind)
  )
    return undefined
  const categories = Object.keys(copied.tables)
  if (
    categories.length === 0 ||
    !categories.every(registered) ||
    (identity.kind === 'given' &&
      (categories.length !== 6 ||
        !REGISTERED_CATEGORIES.every(cat => Object.hasOwn(copied.tables as object, cat)))) ||
    (identity.kind === 'reuse' && (categories.length !== 1 || categories[0] !== 'slash_command'))
  )
    return undefined
  const compositions: Partial<Record<RegisteredCategory, readonly CompositionEntry[]>> = {}
  for (const category of categories as RegisteredCategory[]) {
    const table = copied.tables[category]
    const expected = compositionFor(
      projected.ok.evaluation,
      projected.ok.compositionOrder,
      category,
    )
    if (
      !closed(table, ['filledAt', 'composition']) ||
      !('ok' in instantFromEpochMs(table.filledAt)) ||
      !Array.isArray(table.composition) ||
      expected === undefined
    )
      return undefined
    if (identity.kind === 'reuse') {
      let cursor = 0
      for (const entry of table.composition) {
        while (cursor < expected.length && !equal(expected[cursor], entry)) cursor++
        if (cursor >= expected.length) return undefined
        cursor++
      }
    } else if (!equal(table.composition, expected)) return undefined
    compositions[category] = table.composition as unknown as readonly CompositionEntry[]
  }
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
): RootSourceProof | { readonly failure: 'unavailable' } {
  if (
    !session(expectedSession) ||
    typeof head !== 'number' ||
    !Number.isSafeInteger(head) ||
    head < 1
  )
    return { failure: 'unavailable' }
  const checked = readRegistryRecord(value, expectedSession, head)
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
export function effective(value: unknown): EffectiveAssembly | undefined {
  const copy = own(value)
  return judgeEffectiveAssembly(copy) ? (copy as unknown as EffectiveAssembly) : undefined
}
export function entryName(id: CapabilityId): string {
  return id.category === 'tool' ? modelName(id.name) : id.name
}
