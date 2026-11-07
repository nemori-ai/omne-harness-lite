import { succeed } from '@omne-harness/operation-result'
import type { Reply } from '@omne-harness/tool-contract'
import type { ToolMaterialDeletion } from '@omne-harness/tool-contract/provider'
import { judgeEvidenceField, type CallInput } from './boundary.ts'
import type { MaterialReclamationProgress, ToolLedgerMaintenance } from './construction.ts'
import { reply } from './ledger-decider.ts'
import {
  confirmMaterialDeletion,
  materialDeletionUnavailable,
  selectMaterialDeletion,
  type MaterialDeletionGrant,
  type MaterialDeletionSelection,
} from './ledger-material-deletion.ts'
import type { MaterialMaintenancePorts } from './ledger-material-maintenance.ts'

async function eraseMaterial<P>(
  ports: MaterialMaintenancePorts<P>,
  input: CallInput<P>,
  grant: MaterialDeletionGrant,
): Reply<ToolMaterialDeletion> {
  const materials = ports.materials
  if (materials === undefined)
    return materialDeletionUnavailable('material provider is not connected')
  const qualified = await ports.authorize(input)
  if ('failure' in qualified) return qualified
  try {
    const observed = await materials.store.inspectErase({
      ...input,
      material: structuredClone(grant.material),
      operation: grant.state.operation,
    })
    if ('failure' in observed) return observed
    if (observed.ok.kind === 'deleted') return succeed(observed.ok)
    const current = await ports.authorize(input)
    if ('failure' in current) return current
    return await materials.store.erase({
      ...input,
      material: structuredClone(grant.material),
      operation: grant.state.operation,
      authorization: structuredClone(grant.state.fence),
    })
  } catch {
    return materialDeletionUnavailable('material deletion provider failed')
  }
}

async function reclaimMaterial<P>(
  ports: MaterialMaintenancePorts<P>,
  input: CallInput<P>,
): Reply<MaterialReclamationProgress> {
  if (ports.materials === undefined)
    return materialDeletionUnavailable('material provider is not connected')
  const domain = { kind: 'call' as const, tenant: input.tenant, call: input.call }
  const selected = await ports.transact<MaterialDeletionSelection>(
    domain,
    null,
    async (snapshot, mint) => {
      const qualified = await ports.authorize(input)
      return 'failure' in qualified
        ? reply(qualified)
        : selectMaterialDeletion(snapshot, mint, input)
    },
    materialDeletionUnavailable('deletion authorization commit is unknown'),
  )
  if ('failure' in selected) return selected
  if (selected.ok.kind === 'invalid')
    return materialDeletionUnavailable('cleanup does not identify a stored material')
  if (selected.ok.kind !== 'delete') return succeed({ kind: selected.ok.kind })
  const grant = selected.ok.grant
  const erased = await eraseMaterial(ports, input, grant)
  if ('failure' in erased) return erased
  if (erased.ok.kind === 'pending') return succeed({ kind: 'pending' })
  const receipt = judgeEvidenceField(erased.ok.receipt, 'deletion.receipt')
  if ('failure' in receipt)
    return materialDeletionUnavailable('provider returned an invalid deletion receipt')
  return ports.transact<MaterialReclamationProgress>(
    domain,
    null,
    async snapshot => {
      const qualified = await ports.authorize(input)
      return 'failure' in qualified
        ? reply(qualified)
        : confirmMaterialDeletion(snapshot, grant, receipt.ok)
    },
    materialDeletionUnavailable('deletion confirmation commit is unknown'),
  )
}

export function createMaterialReclaimer<P>(
  ports: MaterialMaintenancePorts<P>,
): ToolLedgerMaintenance<P>['reclaim'] {
  return async supplied => {
    const checked = await ports.entry(supplied)
    if ('failure' in checked) return checked
    const result = await reclaimMaterial(ports, checked.ok)
    const current = await ports.authorize(checked.ok)
    return 'failure' in current ? current : result
  }
}
