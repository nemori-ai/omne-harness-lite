import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createToolMaterialMaintenance,
  type AccessVerdict,
  type MaterialMaintenancePage,
  type ToolLedgerMaintenance,
  type ToolMaterialMaintenanceInput,
  type ToolMaterialMaintenanceSource,
} from '@omne-harness/tool'
import type { Reply } from '@omne-harness/tool-contract'
import {
  createMaintenanceScope,
  maintenanceClosedDiagnostic,
} from './material-maintenance-scope.ts'

export type LocalToolMaterialMaintenanceInput<P> = ToolMaterialMaintenanceInput<P> &
  Readonly<{
    source: ToolMaterialMaintenanceSource
    scanAccess: { qualify(input: Access<P>): Promise<AccessVerdict> }
  }>

export type LocalToolMaterialMaintenance<P> = ToolLedgerMaintenance<P> &
  Readonly<{
    scan(
      input: Access<P> & Parameters<ToolMaterialMaintenanceSource['scan']>[0],
    ): Reply<MaterialMaintenancePage>
    close(): Promise<void>
  }>

export function createLocalToolMaterialMaintenance<P>(
  input: LocalToolMaterialMaintenanceInput<P>,
): LocalToolMaterialMaintenance<P> {
  const scope = createMaintenanceScope()
  const stopped = () => ({ kind: 'unavailable' as const, diagnostic: maintenanceClosedDiagnostic })
  const unavailable = () => fail({ ...stopped(), dependency: 'material-maintenance' })
  const maintenance = createToolMaterialMaintenance<P>({
    ledgerCommitAttempts: input.ledgerCommitAttempts,
    access: { qualify: supplied => scope.gate(() => input.access.qualify(supplied), stopped) },
    store: {
      durability: input.store.durability,
      readRecord: (domain, key) => scope.gate(() => input.store.readRecord(domain, key), stopped),
      read: supplied => scope.gate(() => input.store.read(supplied), stopped),
      commit: supplied => scope.gate(() => input.store.commit(supplied), stopped),
      due: (tenant, now, limit) => scope.gate(() => input.store.due(tenant, now, limit), stopped),
    },
    materials: {
      clock: { sample: () => scope.gate(() => input.materials.clock.sample(), unavailable) },
      store: {
        inspectErase: supplied =>
          scope.gate(() => input.materials.store.inspectErase(supplied), unavailable),
        erase: supplied => scope.gate(() => input.materials.store.erase(supplied), unavailable),
      },
    },
  })
  const qualifyScan = async (supplied: Access<P>): Reply<void> => {
    const verdict = await scope.gate(() => input.scanAccess.qualify(supplied), stopped)
    if (verdict.kind === 'allowed') return succeed(undefined)
    return verdict.kind === 'denied'
      ? fail({ kind: 'denied', action: 'scan-materials' })
      : fail({
          kind: 'unavailable',
          dependency: 'material-maintenance-access',
          diagnostic: verdict.diagnostic,
        })
  }
  return Object.freeze({
    reclaim: supplied => scope.run(() => maintenance.reclaim(supplied)),
    scan: supplied => {
      const fixed = {
        principal: supplied.principal,
        tenant: supplied.tenant,
        at: supplied.at,
        after: supplied.after,
        limit: supplied.limit,
      }
      return scope.run(async () => {
        const authorized = await qualifyScan(fixed)
        if ('failure' in authorized) return authorized
        const page = await scope.gate(
          () =>
            input.source.scan({
              tenant: fixed.tenant,
              at: fixed.at,
              after: fixed.after,
              limit: fixed.limit,
            }),
          unavailable,
        )
        if ('failure' in page) return page
        const result = { calls: [...page.ok.calls], next: page.ok.next }
        const current = await qualifyScan(fixed)
        return 'failure' in current ? current : succeed(result)
      })
    },
    close: scope.close,
  } satisfies LocalToolMaterialMaintenance<P>)
}
