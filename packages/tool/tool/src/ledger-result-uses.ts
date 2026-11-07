import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolFailure } from '@omne-harness/tool-contract'
import type { ToolMaterialSeal } from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import type { Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
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
