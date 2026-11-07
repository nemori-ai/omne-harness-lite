import { fail, succeed } from '@omne-harness/operation-result'
import { decodeToolOperationId, type DurableEvidence } from '@omne-harness/tool-contract'
import type { CallInput } from './boundary.ts'
import { invalid } from './boundary.ts'
import type { MaterialReclamationProgress } from './construction.ts'
import { digestOf, mintEvidence } from './evidence.ts'
import { put, reply, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import type { MaterialRecord } from './ledger-material-records.ts'

export type MaterialDeletionGrant = MaterialRecord &
  Readonly<{
    state: Extract<MaterialRecord['state'], { kind: 'deleting' }>
  }>

export type MaterialDeletionSelection =
  | Readonly<{ kind: 'idle' | 'blocked' | 'deleted' | 'invalid' }>
  | Readonly<{ kind: 'delete'; grant: MaterialDeletionGrant }>

export function materialDeletionUnavailable(diagnostic: string) {
  return fail({ kind: 'unavailable' as const, dependency: 'material-maintenance', diagnostic })
}

function hasUses(snapshot: Snapshot, material: MaterialRecord['material']): boolean {
  return [...snapshot.materialUses.values()].some(use => sameFactValue(use.material, material))
}

export function selectMaterialDeletion<P>(
  snapshot: Snapshot,
  mint: Mint,
  input: CallInput<P>,
): Decision<MaterialDeletionSelection> {
  if (snapshot.call === null) return reply(invalid('call', 'unknown-call'))
  const keys = [...snapshot.materialCleanup.keys()].sort()
  const key =
    keys.find(
      key => snapshot.materialMaintenanceAfter === null || key > snapshot.materialMaintenanceAfter,
    ) ?? keys[0]
  if (key === undefined) return reply(succeed({ kind: 'idle' }))
  const cleanup = snapshot.materialCleanup.get(key)
  if (cleanup === undefined)
    return reply(materialDeletionUnavailable('cleanup selection is missing'))
  const writes = [put({ kind: 'material-maintenance', after: cleanup.writeOperation })]
  const material = snapshot.materials.get(cleanup.writeOperation)
  if (material === undefined || !sameFactValue(material.material, cleanup.material))
    return { kind: 'commit', value: { kind: 'invalid' }, writes }
  if (hasUses(snapshot, material.material))
    return { kind: 'commit', value: { kind: 'blocked' }, writes }
  if (material.state.kind === 'deleted')
    return {
      kind: 'commit',
      value: { kind: 'deleted' },
      writes: [...writes, { kind: 'delete', key: `material-cleanup:${key}` }],
    }
  if (material.state.kind === 'deleting')
    return {
      kind: 'commit',
      value: { kind: 'delete', grant: { ...material, state: material.state } },
      writes,
    }
  const operation = decodeToolOperationId(
    `material-delete:${digestOf({ material: material.material, writeOperation: material.writeOperation })}`,
  )
  if ('failure' in operation)
    return reply(materialDeletionUnavailable('deletion identity is invalid'))
  const grant: MaterialDeletionGrant = {
    ...material,
    state: {
      kind: 'deleting',
      operation: operation.ok,
      fence: mintEvidence(
        'material-deletion',
        { tenant: input.tenant, call: input.call, operation: operation.ok },
        mint.revision,
        material.material,
      ),
    },
  }
  return {
    kind: 'commit',
    value: { kind: 'delete', grant },
    writes: [...writes, put({ kind: 'material', material: grant })],
  }
}

export function confirmMaterialDeletion(
  snapshot: Snapshot,
  grant: MaterialDeletionGrant,
  receipt: DurableEvidence,
): Decision<MaterialReclamationProgress> {
  const current = snapshot.materials.get(grant.writeOperation)
  if (
    current === undefined ||
    !sameFactValue(current.material, grant.material) ||
    hasUses(snapshot, grant.material)
  )
    return reply(materialDeletionUnavailable('deletion grant no longer matches the material'))
  if (current.state.kind === 'deleted')
    return current.state.operation === grant.state.operation &&
      sameFactValue(current.state.receipt, receipt)
      ? reply(succeed({ kind: 'deleted' }))
      : reply(materialDeletionUnavailable('deletion receipt differs from the committed receipt'))
  if (!sameFactValue(current.state, grant.state))
    return reply(materialDeletionUnavailable('deletion authorization changed'))
  return {
    kind: 'commit',
    value: { kind: 'deleted' },
    writes: [
      put({
        kind: 'material',
        material: {
          ...current,
          state: { kind: 'deleted', operation: grant.state.operation, receipt },
        },
      }),
      { kind: 'delete', key: `material-cleanup:${grant.writeOperation}` },
    ],
  }
}
