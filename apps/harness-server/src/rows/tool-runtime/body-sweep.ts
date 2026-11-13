// The application's schedule of the Tool sweep (BodyLifecycle `DeleteBytes` then `Reclaim`), by
// due time (SPEC「Tool 正文清扫」): a step sweeps only the tenants whose next due entry has come.
// The table of due tenants is a live object of this process: commits of this process note the
// due entries they write, and the startup sweep over every tenant rebuilds it. The Tool runtime
// does the reclaiming; this only decides when and for whom.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import type { Reply } from '@omne-harness/tool-contract'
import type { ToolInstant, ToolInstantClock } from '@omne-harness/tool-contract/provider'
import type { ToolLedgerStore, ToolLedgerSweep } from '@omne-harness/tool'

/** After the n-th failure in a row the tenant waits item min(n, 3), capped at 30 seconds. */
const BACKOFF_MS = [1000, 5000, 30_000] as const

/** The last instant: the due index read up to it answers the earliest entry first. */
const LAST_INSTANT = '9999-12-31T23:59:59.999Z' as ToolInstant

export type BodySweepProgress = Readonly<{
  /** The tenants this step swept. */
  tenants: number
  reclaimed: number
  /** Call domains removed with the host records of the call. */
  removed: number
  /** The tenants whose sweep or due read failed in this step; they wait out their backoff. */
  failures: number
}>

type Slot = {
  readonly tenant: TenantId
  /** When the tenant is next swept, in epoch milliseconds. */
  at: number
  failures: number
  visiting: boolean
  /** The earliest due time noted while the tenant was being swept. */
  noted: number
}

/** The tenants with due entries, and when each is next swept (SPEC「按到期时刻安排」). */
export type DueTenants = ReturnType<typeof createDueTenants>

export function createDueTenants() {
  const slots = new Map<string, Slot>()
  const noteAt = (tenant: TenantId, at: number) => {
    const key = tenantCodec.encode(tenant)
    if (!key.ok || Number.isNaN(at)) return
    const slot = slots.get(key.value)
    if (slot === undefined)
      slots.set(key.value, { tenant, at, failures: 0, visiting: false, noted: Infinity })
    else if (slot.visiting) slot.noted = Math.min(slot.noted, at)
    else slot.at = Math.min(slot.at, at)
  }
  return Object.freeze({
    /** A commit of this process wrote a due entry of `tenant` at `instant`. */
    note(tenant: TenantId, instant: ToolInstant): void {
      noteAt(tenant, Date.parse(instant))
    },
    noteAt,
    /** The tenants due at `now`, earliest first. */
    ready(now: number): Slot[] {
      return [...slots.values()]
        .filter(slot => !slot.visiting && slot.at <= now)
        .sort((a, b) => a.at - b.at)
    },
    begin(slot: Slot): void {
      slot.visiting = true
      slot.noted = Infinity
    },
    /** The sweep and the due read answered: the tenant is next due at `next`, or not at all. */
    swept(slot: Slot, next: number | null): void {
      slot.visiting = false
      slot.failures = 0
      slot.at = Math.min(next ?? Infinity, slot.noted)
      if (slot.at === Infinity) {
        const key = tenantCodec.encode(slot.tenant)
        if (key.ok) slots.delete(key.value)
      }
    },
    /** The sweep or the due read failed: the tenant stays, and waits out its backoff. */
    failed(slot: Slot, now: number): Backoff {
      slot.visiting = false
      slot.failures += 1
      const backoff = backoffOf(slot.failures)
      slot.at = now + backoff.delayMs
      return backoff
    },
    size: () => slots.size,
  })
}

type Backoff = Readonly<{ delayMs: number; warn: boolean }>

/** The wait after the n-th failure in a row; a warning only for the first and those at the cap. */
function backoffOf(failures: number): Backoff {
  const step = Math.min(failures, BACKOFF_MS.length) - 1
  return {
    delayMs: BACKOFF_MS[step] as number,
    warn: failures === 1 || step === BACKOFF_MS.length - 1,
  }
}

function reasonOf(failure: Readonly<{ kind: string }>): string {
  const diagnostic: unknown = Reflect.get(failure, 'diagnostic')
  return typeof diagnostic === 'string' ? diagnostic : failure.kind
}

export type BodySweepInput<P> = Readonly<{
  domains: TenantDomains<P>
  scanner: P
  clock: ToolInstantClock
  sweep: ToolLedgerSweep['sweep']
  /** The due index of the record store: the sweep reads the earliest entry of a tenant with it. */
  dueIndex: ToolLedgerStore['due']
  due: DueTenants
  limit: number
  warn(message: string): void
}>

export function createBodySweep<P>(input: BodySweepInput<P>) {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000)
    throw new RangeError('body sweep limit must be an integer from 1 to 1000')
  let listed = false
  let listFailures = 0
  let listAgainAt = 0
  let active: Reply<BodySweepProgress> | null = null
  let stopped = false
  const closed = () =>
    fail({
      kind: 'unavailable' as const,
      dependency: 'body-sweep',
      diagnostic: 'body sweep is closed',
    })
  const nowMs = () => Date.parse(input.clock.now())

  /** Startup: every tenant of the directory is due once. */
  async function list(): Promise<string | null> {
    let answer: Awaited<ReturnType<TenantDomains<P>['enumerate']>>
    try {
      answer = await input.domains.enumerate({ principal: input.scanner })
    } catch {
      return 'tenant enumeration failed'
    }
    if (answer.kind === 'denied') return 'tenant enumeration was denied'
    if (answer.kind === 'unavailable') return `tenant enumeration: ${answer.diagnostic}`
    const tenants: TenantId[] = []
    for (const entry of answer.entries) {
      const tenant = tenantCodec.parse(entry.tenant)
      if (!tenant.ok) return 'tenant directory contains an invalid tenant'
      tenants.push(tenant.value)
    }
    const now = nowMs()
    for (const tenant of tenants) input.due.noteAt(tenant, now)
    return null
  }

  /** Sweeps one tenant in full batches, then reads its earliest due entry. */
  async function visit(
    tenant: TenantId,
  ): Promise<
    | Readonly<{ kind: 'swept'; reclaimed: number; removed: number; next: number | null }>
    | Readonly<{ kind: 'failed'; reason: string }>
    | Readonly<{ kind: 'stopped' }>
  > {
    const now = input.clock.now()
    let reclaimed = 0
    let removed = 0
    for (;;) {
      if (stopped) return { kind: 'stopped' }
      const answer = await input.sweep(tenant, now, input.limit)
      if ('failure' in answer) return { kind: 'failed', reason: reasonOf(answer.failure) }
      reclaimed += answer.ok.reclaimed
      removed += answer.ok.removed
      if (answer.ok.reclaimed + answer.ok.removed < input.limit) break
    }
    const earliest = await input.dueIndex(tenant, LAST_INSTANT, 1)
    if (earliest.kind === 'unavailable') return { kind: 'failed', reason: earliest.diagnostic }
    const first = earliest.entries[0]
    return {
      kind: 'swept',
      reclaimed,
      removed,
      next: first === undefined ? null : Date.parse(first.dueAt),
    }
  }

  async function step(): Reply<BodySweepProgress> {
    if (!listed && nowMs() >= listAgainAt) {
      const failed = await list()
      if (failed === null) {
        listed = true
        listFailures = 0
      } else {
        listFailures += 1
        const backoff = backoffOf(listFailures)
        listAgainAt = nowMs() + backoff.delayMs
        if (backoff.warn) input.warn(`body sweep: ${failed}; it goes on in ${backoff.delayMs} ms.`)
      }
    }
    let tenants = 0
    let reclaimed = 0
    let removed = 0
    let failures = 0
    for (const slot of input.due.ready(nowMs())) {
      if (stopped) return closed()
      input.due.begin(slot)
      const visited = await visit(slot.tenant)
      if (visited.kind === 'stopped') return closed()
      if (visited.kind === 'failed') {
        failures += 1
        const backoff = input.due.failed(slot, nowMs())
        if (backoff.warn) {
          const text = tenantCodec.encode(slot.tenant)
          input.warn(
            `body sweep of tenant ${text.ok ? text.value : '(no tenant text)'} failed (${visited.reason}); it goes on in ${backoff.delayMs} ms.`,
          )
        }
        continue
      }
      input.due.swept(slot, visited.next)
      tenants += 1
      reclaimed += visited.reclaimed
      removed += visited.removed
    }
    return succeed({ tenants, reclaimed, removed, failures })
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
      await active
    },
  })
}
