import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import type { Reply } from '@omne-harness/tool-contract'
import type { ToolInstant, ToolInstantClock } from '@omne-harness/tool-contract/provider'
import type { ToolLedgerStore, ToolLedgerSweep } from '@omne-harness/tool'

const BACKOFF_MS = [1000, 5000, 30_000] as const

const LAST_INSTANT = '9999-12-31T23:59:59.999Z' as ToolInstant

export type BodySweepProgress = Readonly<{
  tenants: number
  reclaimed: number
  removed: number
  failures: number
}>

type Slot = {
  readonly tenant: TenantId
  readonly text: string
  at: number
  failures: number
  visiting: boolean
  noted: number
}

export type DueTenants = ReturnType<typeof createDueTenants>

export function createDueTenants() {
  const slots = new Map<string, Slot>()
  const noteAt = (tenant: TenantId, at: number) => {
    const text = tenantCodec.encode(tenant)
    if (!text.ok) return
    const slot = slots.get(text.value)
    if (slot === undefined)
      slots.set(text.value, {
        tenant,
        text: text.value,
        at,
        failures: 0,
        visiting: false,
        noted: Infinity,
      })
    else if (slot.visiting) slot.noted = Math.min(slot.noted, at)
    else slot.at = Math.min(slot.at, at)
  }
  return Object.freeze({
    note(tenant: TenantId, instant: ToolInstant): void {
      noteAt(tenant, Date.parse(instant))
    },
    noteAt,
    ready(now: number): Slot[] {
      return [...slots.values()]
        .filter(slot => !slot.visiting && slot.at <= now)
        .sort((a, b) => a.at - b.at)
    },
    begin(slot: Slot): void {
      slot.visiting = true
      slot.noted = Infinity
    },
    swept(slot: Slot, next: number | null): void {
      slot.visiting = false
      slot.failures = 0
      slot.at = Math.min(next ?? Infinity, slot.noted)
      if (slot.at === Infinity) slots.delete(slot.text)
    },
    failed(slot: Slot, now: number): Backoff {
      slot.visiting = false
      slot.failures += 1
      const backoff = backoffOf(slot.failures)
      slot.at = now + backoff.delayMs
      return backoff
    },
  })
}

type Backoff = Readonly<{ delayMs: number; warn: boolean }>

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
      input.due.begin(slot)
      const visited = await visit(slot.tenant)
      if (visited.kind === 'stopped') return closed()
      if (visited.kind === 'failed') {
        failures += 1
        const backoff = input.due.failed(slot, nowMs())
        if (backoff.warn)
          input.warn(
            `body sweep of tenant ${slot.text} failed (${visited.reason}); it goes on in ${backoff.delayMs} ms.`,
          )
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
