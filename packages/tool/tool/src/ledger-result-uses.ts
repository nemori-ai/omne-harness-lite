import { sameFactValue } from './evidence.ts'
import { authorBody } from './ledger-author-body.ts'
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

export function adoptResultMaterials(
  snapshot: Snapshot,
  result: ResultRecord,
): Outcome<readonly LedgerWrite[], ToolFailure> {
  const channels = result.value
  const seals = [
    channels.content,
    channels.data,
    channels.attachments,
    ...(channels.original.kind === 'offloaded' ? [channels.original.summary] : []),
  ]
  const writes: LedgerWrite[] = []
  for (const seal of seals) {
    const prepared = preparedMaterial(snapshot, seal, 'result')
    if ('failure' in prepared) return prepared
    const material = prepared.ok
    writes.push(
      { kind: 'delete', key: `material-use:preparation:${material.writeOperation}` },
      {
        kind: 'put',
        record: {
          kind: 'material-use',
          use: {
            id: `delivery:${result.result}:${material.writeOperation}`,
            kind: 'delivery',
            writeOperation: material.writeOperation,
            material: material.material,
            result: result.result,
            delivery: result.delivery.delivery,
            basis: result.source,
          },
        },
      },
    )
  }
  if (channels.original.kind === 'offloaded') {
    const { seal, description } = channels.original.body
    if (description.previewKind === 'author-summary') {
      const authored = authorBody(snapshot, description.source)
      if ('failure' in authored) return authored
      const { retention, ...fixedDescription } = description
      if (
        !sameFactValue(authored.ok.prepared.description, fixedDescription) ||
        !sameFactValue(authored.ok.prepared.seal, seal) ||
        !sameFactValue(authored.ok.policy.adoption, retention.adoption)
      )
        return invalid('original.source', 'sealed-body-changed')
    }
    const adopted = adoptResultBody(snapshot, result)
    if ('failure' in adopted) return adopted
    writes.push(...adopted.ok)
  }
  return succeed(writes)
}

export function adoptResultBody(
  snapshot: Snapshot,
  result: ResultRecord,
): Outcome<readonly LedgerWrite[], ToolFailure> {
  const original = result.value.original
  if (original.kind !== 'offloaded') return succeed([])
  const { seal, description } = original.body
  const writes: LedgerWrite[] = []
  const prepared = preparedMaterial(snapshot, seal, 'body')
  if ('failure' in prepared) return prepared
  const material = prepared.ok
  writes.push(
    { kind: 'delete', key: `material-use:preparation:${material.writeOperation}` },
    {
      kind: 'put',
      record: {
        kind: 'material-use',
        use: {
          id: `body:${description.bodyId}`,
          kind: 'offloaded-body',
          material: material.material,
          writeOperation: material.writeOperation,
          result: result.result,
          bodyId: description.bodyId,
          expiresAt: description.retention.expiresAt,
          basis: result.source,
        },
      },
    },
  )
  return succeed(writes)
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

export function releaseResultMaterials(
  snapshot: Snapshot,
  result: ResultRecord,
  basis: DurableEvidence,
): readonly LedgerWrite[] {
  const writes: LedgerWrite[] = []
  for (const use of snapshot.materialUses.values()) {
    if (
      use.kind !== 'delivery' ||
      use.result !== result.result ||
      use.delivery !== result.delivery.delivery
    )
      continue
    writes.push({ kind: 'delete', key: `material-use:${use.id}` })
    writes.push(cleanupMaterial(use, basis))
  }
  return writes
}
