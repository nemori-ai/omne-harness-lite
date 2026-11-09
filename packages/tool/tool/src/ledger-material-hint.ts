import type { ToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import { canonicalJson } from './evidence.ts'
import type { Snapshot } from './ledger-decider.ts'
import type { MaterialMaintenanceHint } from './ledger-material-records.ts'
import type { LedgerWrite } from './ledger-store.ts'

export function materialMaintenanceHint(
  snapshot: Snapshot,
  writes: readonly LedgerWrite[],
): MaterialMaintenanceHint {
  const uses = new Map(snapshot.materialUses)
  const cleanup = new Map(snapshot.materialCleanup)
  const writerScopes = new Set(snapshot.writerScopes.keys())
  let phase = snapshot.call?.state.phase
  for (const write of writes) {
    if (write.kind === 'put') {
      if (write.record.kind === 'material-use') uses.set(write.record.use.id, write.record.use)
      else if (write.record.kind === 'material-cleanup')
        cleanup.set(write.record.cleanup.writeOperation, write.record.cleanup)
      else if (write.record.kind === 'body-writer-scope')
        writerScopes.add(write.record.scope.start.operation)
      else if (write.record.kind === 'call') phase = write.record.call.state.phase
    } else if (write.kind === 'delete') {
      if (write.key.startsWith('material-use:'))
        uses.delete(write.key.slice('material-use:'.length))
      else if (write.key.startsWith('material-cleanup:'))
        cleanup.delete(write.key.slice('material-cleanup:'.length))
      else if (write.key.startsWith('body-writer-scope:'))
        writerScopes.delete(write.key.slice('body-writer-scope:'.length))
    }
  }
  if (phase !== 'settled' && writerScopes.size > 0) return { kind: 'ready' }
  const protectedMaterials = new Set<string>()
  let due: ToolMaterialInstant | null = null
  for (const use of uses.values()) {
    protectedMaterials.add(canonicalJson(use.material))
    if (
      (use.kind === 'offloaded-body' || use.kind === 'page-lease') &&
      (due === null || Date.parse(use.expiresAt) < Date.parse(due))
    )
      due = use.expiresAt
  }
  for (const candidate of cleanup.values()) {
    if (!protectedMaterials.has(canonicalJson(candidate.material))) return { kind: 'ready' }
  }
  return due === null ? { kind: 'none' } : { kind: 'due', at: due }
}
