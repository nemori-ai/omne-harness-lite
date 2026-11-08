import { upgradeHistoricalCall, type HistoryUpgrade } from './history-upgrade.ts'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolHistoryCallSource, ToolHistoryMigration } from '@omne-harness/tool'
import type { Reply } from '@omne-harness/tool-contract'
import type { createLocalHistoricalDeliveryMaintenance } from '@omne-harness/tool-host-local'

export type HistoryStartupInput<P> = Readonly<{
  enumerate(): Reply<readonly TenantId[]>
  principal: P
  calls: ToolHistoryCallSource
  migration: ToolHistoryMigration<P>
  host: ReturnType<typeof createLocalHistoricalDeliveryMaintenance<P>>
  upgrade?: HistoryUpgrade
  current(): boolean
}>

const unavailable = (diagnostic: string) =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'tool-history-startup',
    diagnostic,
  })

/** Old writers must be drained before this check; no executor may run until it succeeds. */
export async function checkToolHistory<P>(input: HistoryStartupInput<P>): Reply<void> {
  async function read<T>(work: () => Reply<T>): Reply<T> {
    try {
      if (!input.current()) return unavailable('startup dependencies were withdrawn')
      const answer = await work()
      return input.current() ? answer : unavailable('startup dependencies were withdrawn')
    } catch {
      return unavailable('historical inventory could not be checked')
    }
  }
  const tenants = await read(input.enumerate)
  if ('failure' in tenants) return tenants
  for (const tenant of tenants.ok) {
    const access = { principal: input.principal, tenant }
    let after: string | null = null
    do {
      const page = await read(() => input.calls.scan({ tenant, after, limit: 128 }))
      if ('failure' in page) return page
      for (const call of page.ok.calls) {
        const request = { ...access, call }
        if (input.upgrade !== undefined) {
          const upgrade = input.upgrade
          const prepared = await read(() =>
            upgradeHistoricalCall(request, input.migration, input.host, upgrade),
          )
          if ('failure' in prepared) return prepared
        }
        const plans = await read(() => input.migration.plans(request))
        if ('failure' in plans) return plans
        if (plans.ok.some(plan => !['cleaned', 'abandoned'].includes(plan.progress.kind)))
          return unavailable('an unfinished historical migration requires explicit upgrade')
        const preview = await read(() =>
          input.migration.preview({ ...request, interpretations: [] }),
        )
        if ('failure' in preview) return preview
        if (preview.ok.kind !== 'current')
          return unavailable('historical or unknown tool records require explicit upgrade')
      }
      after = page.ok.next
    } while (after !== null)
    const host = await read(() => input.host.inspect(access))
    if ('failure' in host) return host
    if (host.ok.kind !== 'current')
      return unavailable('historical host delivery records require explicit upgrade')
  }
  return succeed(undefined)
}
