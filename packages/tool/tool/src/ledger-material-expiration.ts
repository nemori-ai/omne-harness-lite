import type { DurableEvidence } from '@omne-harness/tool-contract'
import type { ToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import type { MaterialUseRecord } from './ledger-material-records.ts'
import type { LedgerWrite } from './ledger-store.ts'

export type TimedMaterialUse = Extract<MaterialUseRecord, { kind: 'offloaded-body' | 'page-lease' }>

export function materialExpirationWrites(
  input: Readonly<{
    use: TimedMaterialUse
    time: ToolMaterialInstant
    basis: DurableEvidence
    cleanupExists: boolean
  }>,
): readonly LedgerWrite[] {
  const { use, time, basis } = input
  const writes: LedgerWrite[] = [{ kind: 'delete', key: `material-use:${use.id}` }]
  if (use.kind === 'offloaded-body')
    writes.push({
      kind: 'put',
      record: {
        kind: 'body-expiration',
        expiration: {
          result: use.result,
          bodyId: use.bodyId,
          material: use.material,
          expiredAt: time,
          basis,
        },
      },
    })
  if (!input.cleanupExists)
    writes.push({
      kind: 'put',
      record: {
        kind: 'material-cleanup',
        cleanup: { material: use.material, writeOperation: use.writeOperation, basis },
      },
    })
  return writes
}
