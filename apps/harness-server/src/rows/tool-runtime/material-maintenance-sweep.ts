import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import type { Reply } from '@omne-harness/tool-contract'
import type { ToolMaterialClock, ToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import type { LocalToolMaterialMaintenance } from '@omne-harness/tool-host-local'

export type MaterialSweepProgress = Readonly<{
  calls: number
  failures: number
  roundComplete: boolean
}>

export type MaterialSweepInput<P> = Readonly<{
  domains: TenantDomains<P>
  scanner: P
  maintainer: P
  clock: ToolMaterialClock
  maintenance: LocalToolMaterialMaintenance<P>
  pageSize: number
}>

type TenantCursor = Readonly<{ tenant: TenantId; after: string | null }>
type Round = Readonly<{ at: ToolMaterialInstant; pending: Map<string, TenantCursor> }>

export function createMaterialMaintenanceSweep<P>(input: MaterialSweepInput<P>) {
  if (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 128)
    throw new RangeError('material sweep pageSize must be an integer from 1 to 128')
  let round: Round | null = null
  let active: Reply<MaterialSweepProgress> | null = null
  let closing: Promise<void> | null = null
  let stopped = false
  const unavailable = (diagnostic: string) =>
    fail({ kind: 'unavailable' as const, dependency: 'material-sweep', diagnostic })
  const closed = () =>
    unavailable('material sweep is closed; accepted operations may have completed')
  async function invoke<T>(work: () => Reply<T>): Reply<T> {
    if (stopped) return closed()
    try {
      const answer = await work()
      return stopped ? closed() : answer
    } catch {
      return unavailable('material maintenance dependency failed')
    }
  }
  async function begin(): Reply<Round> {
    const listing = await invoke(async () => {
      const answer = await input.domains.enumerate({ principal: input.scanner })
      if (answer.kind === 'denied') return fail({ kind: 'denied', action: 'enumerate-tenants' })
      if (answer.kind === 'unavailable') return unavailable('tenant enumeration is unavailable')
      return succeed(answer.entries.map(entry => entry.tenant))
    })
    if ('failure' in listing) return listing
    const time = await invoke(() => input.clock.sample())
    if ('failure' in time) return time
    const pending = new Map<string, TenantCursor>()
    for (const text of listing.ok) {
      const tenant = tenantCodec.parse(text)
      if (!tenant.ok) return unavailable('tenant directory contains an invalid tenant')
      pending.set(text, { tenant: tenant.value, after: null })
    }
    return succeed({ at: time.ok, pending })
  }
  async function step(): Reply<MaterialSweepProgress> {
    if (round === null) {
      const started = await begin()
      if ('failure' in started) return started
      round = started.ok
    }
    const entry = round.pending.entries().next().value
    if (entry === undefined) {
      round = null
      return succeed({ calls: 0, failures: 0, roundComplete: true })
    }
    const [key, cursor] = entry
    const at = round.at
    const request = { principal: input.maintainer, tenant: cursor.tenant }
    const page = await invoke(() =>
      input.maintenance.scan({
        ...request,
        at,
        after: cursor.after,
        limit: input.pageSize,
      }),
    )
    if (stopped) return closed()
    round.pending.delete(key)
    let calls = 0
    let failures = 0
    if ('failure' in page) failures += 1
    else {
      if (page.ok.next !== null) round.pending.set(key, { ...cursor, after: page.ok.next })
      for (const call of page.ok.calls) {
        const expired = await invoke(() => input.maintenance.expire({ ...request, call }))
        if (stopped) return closed()
        if ('failure' in expired) failures += 1
        const reclaimed = await invoke(() => input.maintenance.reclaim({ ...request, call }))
        if (stopped) return closed()
        if ('failure' in reclaimed) failures += 1
        calls += 1
      }
    }
    const roundComplete = round.pending.size === 0
    if (roundComplete) round = null
    return succeed({ calls, failures, roundComplete })
  }
  return Object.freeze({
    advance(): Reply<MaterialSweepProgress> {
      if (stopped) return Promise.resolve(closed())
      active ??= Promise.resolve()
        .then(step)
        .finally(() => {
          active = null
        })
      return active
    },
    close(): Promise<void> {
      if (closing !== null) return closing
      stopped = true
      const completion = Promise.withResolvers<void>()
      closing = completion.promise
      round = null
      const host = (async () => {
        await input.maintenance.close()
      })()
      void Promise.all([active, host]).then(() => completion.resolve(), completion.reject)
      return closing
    },
  })
}
