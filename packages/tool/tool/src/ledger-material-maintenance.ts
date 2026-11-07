import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Reply, ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import type { ToolMaterialClock } from '@omne-harness/tool-contract/provider'
import type { CallInput } from './boundary.ts'
import { invalid } from './boundary.ts'
import type {
  MaterialMaintenanceProgress,
  ToolLedgerMaintenance,
  ToolLedgerPorts,
} from './construction.ts'
import { mintEvidence } from './evidence.ts'
import type { Decision, Mint, Snapshot } from './ledger-decider.ts'
import { sampleMaterialTime } from './ledger-material-custody.ts'
import { materialExpirationWrites } from './ledger-material-expiration.ts'
import type { LedgerDomain, LedgerWrite } from './ledger-store.ts'

type MaintenanceTransaction = <T>(
  domain: LedgerDomain,
  operation: ToolOperationId | null,
  decide: (snapshot: Snapshot, mint: Mint) => Promise<Decision<T>>,
  unknown: Outcome<T, ToolFailure>,
) => Reply<T>

async function expireMaterials<P>(
  snapshot: Snapshot,
  mint: Mint,
  input: CallInput<P>,
  clock: ToolMaterialClock,
): Promise<Decision<MaterialMaintenanceProgress>> {
  if (snapshot.call === null) return { kind: 'reply', outcome: invalid('call', 'unknown-call') }
  const progress = {
    expiredBodies: 0,
    expiredLeases: 0,
    cleanupPending: snapshot.materialCleanup.size > 0,
  }
  const uses = [...snapshot.materialUses.values()].filter(
    use => use.kind === 'offloaded-body' || use.kind === 'page-lease',
  )
  if (uses.length === 0) return { kind: 'reply', outcome: succeed(progress) }
  const sampled = await sampleMaterialTime(clock, snapshot.materialTime)
  if ('failure' in sampled) return { kind: 'reply', outcome: sampled }
  const writes: LedgerWrite[] = []
  const cleanup = new Set(snapshot.materialCleanup.keys())
  for (const use of uses) {
    if (Date.parse(sampled.ok) < Date.parse(use.expiresAt)) continue
    const basis = mintEvidence(
      use.kind === 'offloaded-body' ? 'body-expiration' : 'page-lease',
      { tenant: input.tenant, call: input.call, result: use.result },
      mint.revision,
      { use: use.id, time: sampled.ok },
    )
    writes.push(
      ...materialExpirationWrites({
        use,
        time: sampled.ok,
        basis,
        cleanupExists: cleanup.has(use.writeOperation),
      }),
    )
    cleanup.add(use.writeOperation)
    if (use.kind === 'offloaded-body') progress.expiredBodies += 1
    else progress.expiredLeases += 1
  }
  progress.cleanupPending = cleanup.size > 0
  if (writes.length === 0 && snapshot.materialTime?.highWatermark === sampled.ok)
    return { kind: 'reply', outcome: succeed(progress) }
  writes.push({
    kind: 'put',
    record: { kind: 'material-time', time: { highWatermark: sampled.ok } },
  })
  return { kind: 'commit', value: progress, writes }
}

export function createLedgerMaterialMaintenance<P>(
  ports: Readonly<{
    materials: ToolLedgerPorts<P>['materials']
    entry(input: unknown): Reply<CallInput<P>>
    authorize(input: CallInput<P>): Reply<void>
    transact: MaintenanceTransaction
  }>,
): ToolLedgerMaintenance<P> {
  return {
    async expire(supplied) {
      const checked = await ports.entry(supplied)
      if ('failure' in checked) return checked
      const input = checked.ok
      const materials = ports.materials
      if (materials === undefined)
        return fail({
          kind: 'unavailable',
          dependency: 'material-maintenance',
          diagnostic: 'material provider is not connected',
        })
      const result = await ports.transact<MaterialMaintenanceProgress>(
        { kind: 'call', tenant: input.tenant, call: input.call },
        null,
        async (snapshot, mint) => {
          const qualified = await ports.authorize(input)
          if ('failure' in qualified) return { kind: 'reply', outcome: qualified }
          const decision = await expireMaterials(snapshot, mint, input, materials.clock)
          const current = await ports.authorize(input)
          return 'failure' in current ? { kind: 'reply', outcome: current } : decision
        },
        fail({
          kind: 'unavailable',
          dependency: 'material-maintenance',
          diagnostic: 'expiration commit is unknown',
        }),
      )
      const current = await ports.authorize(input)
      return 'failure' in current ? current : result
    },
  }
}
