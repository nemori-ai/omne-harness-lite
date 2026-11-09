// The application's schedule of the Tool sweep (BodyLifecycle `DeleteBytes` then `Reclaim`): one
// step sweeps the due bodies of one tenant at the sweeper's clock; a round visits every tenant the
// directory enumerates. The Tool runtime does the reclaiming; this only decides when and for whom.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import type { Reply } from '@omne-harness/tool-contract'
import type { ToolInstantClock } from '@omne-harness/tool-contract/provider'
import type { ToolLedgerSweep } from '@omne-harness/tool'

export type BodySweepProgress = Readonly<{
  tenants: number
  reclaimed: number
  failures: number
  roundComplete: boolean
}>

export type BodySweepInput<P> = Readonly<{
  domains: TenantDomains<P>
  scanner: P
  clock: ToolInstantClock
  sweep: ToolLedgerSweep['sweep']
  limit: number
}>

export function createBodySweep<P>(input: BodySweepInput<P>) {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000)
    throw new RangeError('body sweep limit must be an integer from 1 to 1000')
  let pending: TenantId[] | null = null
  let active: Reply<BodySweepProgress> | null = null
  let stopped = false
  const unavailable = (diagnostic: string) =>
    fail({ kind: 'unavailable' as const, dependency: 'body-sweep', diagnostic })
  const closed = () => unavailable('body sweep is closed')
  async function begin(): Reply<TenantId[]> {
    let answer: Awaited<ReturnType<TenantDomains<P>['enumerate']>>
    try {
      answer = await input.domains.enumerate({ principal: input.scanner })
    } catch {
      return unavailable('tenant enumeration failed')
    }
    if (answer.kind === 'denied') return fail({ kind: 'denied', action: 'enumerate-tenants' })
    if (answer.kind === 'unavailable') return unavailable('tenant enumeration is unavailable')
    const tenants: TenantId[] = []
    for (const entry of answer.entries) {
      const tenant = tenantCodec.parse(entry.tenant)
      if (!tenant.ok) return unavailable('tenant directory contains an invalid tenant')
      tenants.push(tenant.value)
    }
    return succeed(tenants)
  }
  async function step(): Reply<BodySweepProgress> {
    if (pending === null) {
      const started = await begin()
      if ('failure' in started) return started
      pending = started.ok
    }
    const tenant = pending.shift()
    if (tenant === undefined) {
      pending = null
      return succeed({ tenants: 0, reclaimed: 0, failures: 0, roundComplete: true })
    }
    let reclaimed = 0
    let failures = 0
    for (;;) {
      if (stopped) return closed()
      const answer = await input.sweep(tenant, input.clock.now(), input.limit)
      if ('failure' in answer) {
        failures += 1
        break
      }
      reclaimed += answer.ok.reclaimed
      if (answer.ok.reclaimed < input.limit) break
    }
    const roundComplete = pending.length === 0
    if (roundComplete) pending = null
    return succeed({ tenants: 1, reclaimed, failures, roundComplete })
  }
  return Object.freeze({
    advance(): Reply<BodySweepProgress> {
      if (stopped) return Promise.resolve(closed())
      active ??= Promise.resolve()
        .then(step)
        .finally(() => {
          active = null
        })
      return active
    },
    async close(): Promise<void> {
      stopped = true
      pending = null
      await active
    },
  })
}
