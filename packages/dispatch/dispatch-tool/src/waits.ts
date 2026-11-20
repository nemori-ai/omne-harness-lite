import type { PortRead, ReportWaits } from '@omne-harness/dispatch'
import type { Dispatch, TenantId, WaitAnswer } from '@omne-harness/dispatch-contract'
import type { WaitRecord } from '@omne-harness/tool-contract'
import { isReportWait } from './bridge.ts'

type Caller = Pick<Dispatch, 'id' | 'dispatcher' | 'call'>

/** What Tool keeps of the dispatching call: whether it ended, and its waits. Null: Tool keeps no such call. */
export type CallWaits = PortRead<Readonly<{
  settled: boolean
  waits: readonly WaitRecord[]
}> | null>

export type ReportWaitsInput = Readonly<{
  callOf: (tenant: TenantId, dispatch: Caller) => Promise<CallWaits>
  /** Asks Tool to drive the call: it then reads the outcome through the bridge. */
  schedule: (tenant: TenantId, dispatch: Caller) => Promise<unknown>
}>

const took = (wait: WaitRecord): boolean => wait.phase === 'closed' && wait.cause === 'continued'

/** Reads the answer from the wait record Tool committed. The outcome itself goes through the bridge. */
export function createReportWaits(input: ReportWaitsInput): ReportWaits {
  return {
    async hand(tenant, dispatch): Promise<WaitAnswer> {
      const read = await input.callOf(tenant, dispatch).catch(() => undefined)
      if (read?.kind !== 'read') return 'unreadable'
      if (read.value === null) return 'closed'
      const waits = read.value.waits.filter(isReportWait)
      if (waits.some(took)) return 'delivered'
      if (read.value.settled || waits.some(wait => wait.phase === 'closed')) return 'closed'
      await input.schedule(tenant, dispatch).catch(() => undefined)
      return 'unreadable'
    },
  }
}
