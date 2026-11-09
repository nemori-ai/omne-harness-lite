import { sameFactValue } from './evidence.ts'
import type { ToolInstant } from '@omne-harness/tool-contract/provider'
import { settleBodyEntries } from './ledger-body-entries.ts'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolRenderedResult } from '@omne-harness/tool-contract'
import { materialContent, materialContentSeal } from './ledger-material-content.ts'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolFailure, RawOutput } from '@omne-harness/tool-contract'
import type { ToolMaterialSeal } from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import type { Snapshot } from './ledger-decider.ts'

import type { MaterialRecord } from './ledger-material-records.ts'
import type { LedgerWrite, ResultRecord } from './ledger-store.ts'

function preparedMaterial(
  snapshot: Snapshot,
  seal: ToolMaterialSeal,
  purpose: MaterialRecord['purpose'],
): Outcome<MaterialRecord, ToolFailure> {
  const material = [...snapshot.materials.values()].find(record =>
    sameFactValue(record.material, seal.material),
  )
  if (
    material === undefined ||
    material.purpose !== purpose ||
    material.state.kind !== 'sealed' ||
    !sameFactValue(material.state.seal, seal)
  )
    return invalid('material', 'prepared-seal-required')
  const use = snapshot.materialUses.get(`preparation:${material.writeOperation}`)
  if (
    use?.kind !== 'preparation' ||
    use.operation !== material.writeOperation ||
    !sameFactValue(use.material, material.material)
  )
    return invalid('material', 'preparation-use-required')
  return succeed(material)
}

export function preparedRawMaterial(
  snapshot: Snapshot,
  raw: RawOutput,
): Outcome<MaterialRecord, ToolFailure> {
  const seal = materialContentSeal(raw.content, snapshot)
  if ('failure' in seal) return seal
  if (!sameFactValue(seal.ok.codec, raw.codec) || !sameFactValue(seal.ok.evidence, raw.custody))
    return invalid('raw', 'not-original-material')
  return preparedMaterial(snapshot, seal.ok, 'raw')
}

/**
 * The body part of model `Settle`: the referenced body is linked and scheduled, the other bodies
 * of the call are orphaned at `orphanDue` (null when the call never had a writer, as at an
 * admission-time settlement).
 */
export function settleResultBodies(
  snapshot: Snapshot,
  result: ResultRecord,
  orphanDue: ToolInstant | null,
): Outcome<readonly LedgerWrite[], ToolFailure> {
  const original = result.value.original
  const linked =
    original.kind === 'offloaded'
      ? { bodyId: original.bodyId, result: result.result, expiresAt: original.retention.expiresAt }
      : null
  if (linked === null && orphanDue === null) return succeed([])
  if (orphanDue === null)
    return invalid('original.source', 'body-settlement-requires-a-settlement-instant')
  return settleBodyEntries(snapshot, linked, orphanDue)
}

export function releaseFinalPreparation(
  snapshot: Snapshot,
  seal: ToolMaterialSeal,
  basis: DurableEvidence,
): Outcome<readonly LedgerWrite[], ToolFailure> {
  const prepared = preparedMaterial(snapshot, seal, 'final')
  if ('failure' in prepared) return prepared
  return succeed([
    { kind: 'delete', key: `material-use:preparation:${prepared.ok.writeOperation}` },
    cleanupMaterial(prepared.ok, basis),
  ])
}

export function adoptRawMaterials<B extends ContentBlock>(
  snapshot: Snapshot,
  raw: RawOutput,
  value: ToolRenderedResult<B>,
  result: Pick<ResultRecord, 'result' | 'source'>,
): Outcome<readonly LedgerWrite[], ToolFailure> {
  const prepared = preparedRawMaterial(snapshot, raw)
  if ('failure' in prepared) return prepared
  const nativeRefs = [
    ...value.attachments,
    ...value.content.flatMap(block => ('ref' in block ? [block.ref] : [])),
    ...(value.original.kind === 'offloaded'
      ? value.original.summary.flatMap(block => ('ref' in block ? [block.ref] : []))
      : []),
  ]
  const processRefs = [...snapshot.facts.values()].flatMap(saved =>
    saved.fact.kind === 'process'
      ? saved.fact.blocks.flatMap(block => ('ref' in block.content ? [block.content.ref] : []))
      : [],
  )
  const writes: LedgerWrite[] = []
  for (const material of snapshot.materials.values()) {
    if (material.purpose !== 'raw' || material.state.kind !== 'sealed') continue
    const reference = materialContent(material.state.seal)
    const purposes: ('native-reference' | 'process-history')[] = []
    if (nativeRefs.some(ref => sameFactValue(ref, reference))) purposes.push('native-reference')
    if (processRefs.some(ref => sameFactValue(ref, reference))) purposes.push('process-history')
    if (purposes.length === 0 && material.writeOperation !== prepared.ok.writeOperation) continue
    const checked = preparedMaterial(snapshot, material.state.seal, 'raw')
    if ('failure' in checked) return checked
    writes.push(...adoptRawUses(material, purposes, result))
  }
  return succeed(writes)
}

function adoptRawUses(
  material: MaterialRecord,
  purposes: readonly ('native-reference' | 'process-history')[],
  result: Pick<ResultRecord, 'result' | 'source'>,
): readonly LedgerWrite[] {
  const writes: LedgerWrite[] = [
    { kind: 'delete', key: `material-use:preparation:${material.writeOperation}` },
  ]
  for (const kind of purposes)
    writes.push({
      kind: 'put',
      record: {
        kind: 'material-use',
        use: {
          id: `${kind}:${result.result}:${material.writeOperation}`,
          kind,
          material: material.material,
          writeOperation: material.writeOperation,
          result: result.result,
          basis: result.source,
        },
      },
    })
  if (purposes.length === 0) writes.push(cleanupMaterial(material, result.source))
  return writes
}

function cleanupMaterial(
  material: Pick<MaterialRecord, 'material' | 'writeOperation'>,
  basis: DurableEvidence,
): LedgerWrite {
  return {
    kind: 'put',
    record: {
      kind: 'material-cleanup',
      cleanup: {
        material: material.material,
        writeOperation: material.writeOperation,
        basis,
      },
    },
  }
}
