import type { ToolLedgerTimers } from '@omne-harness/tool'
import type { ToolInstanceHost } from '@omne-harness/tool-contract/provider'
import { createLostExecutions, type LostExecutionsInput } from './lost-execution.ts'

type Wake = Parameters<ToolInstanceHost<unknown>['schedule']>[0]
type TimerInput = LostExecutionsInput &
  Readonly<{
    dependencies: Readonly<{
      timers?: ToolLedgerTimers<unknown>
      clock: Readonly<{ now(): string }>
      instances: Pick<ToolInstanceHost<unknown>, 'schedule'>
    }>
  }>

// Each call run first fires the due timers of its tenant and wakes the call of the next one when it
// falls due. A failed fire leaves its entries due for the next run.
export function withTimers(
  input: TimerInput,
  later: Parameters<typeof createLostExecutions>[1],
): ReturnType<typeof createLostExecutions> {
  const upkeep = createLostExecutions(input, later)
  const { timers, clock, instances } = input.dependencies
  if (timers === undefined) return upkeep
  const waking = new Map<string, ReturnType<typeof setTimeout>>()
  const wakeAt = (wake: Wake, dueAt: string): void => {
    const key = JSON.stringify(wake.tenant)
    clearTimeout(waking.get(key))
    const timer = setTimeout(
      () => {
        waking.delete(key)
        void instances.schedule(wake).catch(() => undefined)
      },
      Math.max(0, Date.parse(dueAt) - Date.parse(clock.now())),
    )
    timer.unref()
    waking.set(key, timer)
  }
  return {
    ...upkeep,
    async handled(step, ...rest) {
      const fired = await timers.fire({ principal: step.principal, tenant: step.tenant })
      const next = 'ok' in fired ? fired.ok.next : null
      if (next?.domain.kind === 'call')
        wakeAt({ tenant: step.tenant, call: next.domain.call }, next.dueAt)
      return upkeep.handled(step, ...rest)
    },
  }
}
