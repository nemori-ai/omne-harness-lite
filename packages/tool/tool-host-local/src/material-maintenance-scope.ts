import { fail } from '@omne-harness/operation-result'
import type { Reply } from '@omne-harness/tool-contract'

export const maintenanceClosedDiagnostic =
  'maintenance scope is closed; an accepted operation may have completed'
const closed = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'material-maintenance',
    diagnostic: maintenanceClosedDiagnostic,
  })

export function createMaintenanceScope() {
  let phase: 'open' | 'closing' | 'closed' = 'open'
  let pending = 0
  const drained = Promise.withResolvers<void>()
  const finish = () => {
    if (phase === 'closing' && pending === 0) {
      phase = 'closed'
      drained.resolve()
    }
  }
  return {
    async run<T>(work: () => Reply<T>): Reply<T> {
      if (phase !== 'open') return closed()
      pending += 1
      try {
        const answer = await work()
        return phase === 'open' || 'failure' in answer ? answer : closed()
      } catch {
        return fail({
          kind: 'unavailable',
          dependency: 'material-maintenance',
          diagnostic: 'maintenance operation failed',
        })
      } finally {
        pending -= 1
        finish()
      }
    },
    async gate<T>(work: () => Promise<T>, stopped: () => T): Promise<T> {
      return phase === 'open' ? work() : stopped()
    },
    close(): Promise<void> {
      if (phase === 'open') phase = 'closing'
      finish()
      return drained.promise
    },
  }
}
