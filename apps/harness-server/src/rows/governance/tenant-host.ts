import type { DomainRef, TenantDomainLookup } from '@omne-harness/sql-contract'
import type { StandingDestinationResolver } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { monotonicClock } from '../../shutdown.ts'
import type { StopResult } from '../../types.ts'
import type { TenantGovernanceAssembly, TenantSettingsAccess } from './tenant-runtime.ts'

type Opened = Awaited<ReturnType<TenantGovernanceAssembly['open']>>
type Runtime = Extract<Opened, { kind: 'created' }>

/** One failed open of a tenant's governance runtime, as the host reports it. */
export type TenantGovernanceOpenFailure = Readonly<{
  tenantRef: string
  /** The phase the assembly stopped in, or `threw` when the open threw. */
  phase: string
  /** Failed opens of this tenant in a row, this one included. */
  failures: number
  /** The wait before the host opens this tenant again. */
  againInMs: number
}>

type Options = Readonly<{
  domains: TenantDomainLookup
  prepare(tenantRef: string, domain: DomainRef): TenantGovernanceAssembly
  /** The wait before the next attempt after `failures` failed opens in a row. Default 1, 5, 30 s. */
  retryPauseMs?(failures: number): number
  /** Monotonic milliseconds. Default the process monotonic clock. */
  now?(): number
  /** Every failed open is reported; a tenant without governance is not a silent state. */
  report?(failure: TenantGovernanceOpenFailure): void
}>

/**
 * One prepared assembly and its one attempt (tenant-runtime.ts: one assembly owns one attempt).
 * `spent` is set when that attempt did not create a runtime: the entry answers unavailable until
 * `retryAt`, then the host replaces it with a new assembly over the same durable domain.
 */
type Entry = {
  domain: DomainRef
  assembly: TenantGovernanceAssembly
  opening?: Promise<Opened | undefined>
  spent?: { retryAt: number }
}
const unavailable = () => ({ kind: 'unavailable' as const, diagnostic: 'tenant-governance-route' })

/** The default policy of the wait after a run of failed opens; the `retryPauseMs` option replaces it. */
function pauseAfter(failures: number): number {
  if (failures <= 1) return 1000
  return failures === 2 ? 5000 : 30_000
}

export class TenantGovernanceHost {
  private readonly options: Options
  private readonly entries = new Map<string, Promise<Entry | undefined>>()
  /** Failed opens in a row per tenant; cleared by an open that created a runtime. */
  private readonly failures = new Map<string, number>()
  /** The replacement of a spent entry, so that callers holding the same spent entry share it. */
  private readonly renewals = new WeakMap<Entry, Promise<Entry | undefined>>()
  private closing = false
  private stopping: Promise<StopResult> | undefined
  readonly destination: StandingDestinationResolver

  constructor(options: Options) {
    this.options = { ...options }
    this.destination = {
      seal: async reservation => {
        const entry = await this.entry(reservation.binding.scopeRef)
        return entry?.assembly.destination.seal(reservation) ?? unavailable()
      },
    }
  }

  private now(): number {
    return this.options.now?.() ?? monotonicClock.now()
  }

  private async prepare(tenantRef: string): Promise<Entry | undefined> {
    if (!tenantCodec.parse(tenantRef).ok) return undefined
    const result = await this.options.domains.lookup({ tenant: tenantRef })
    if (result.kind !== 'ready') return undefined
    const domain = result.domain
    if (domain.scope.kind !== 'tenant' || domain.scope.tenant !== tenantRef) return undefined
    return { domain: structuredClone(domain), assembly: this.options.prepare(tenantRef, domain) }
  }

  /** Keeps `pending` as the entry of the tenant; an entry that could not be prepared is dropped. */
  private keep(tenantRef: string, pending: Promise<Entry | undefined>): Promise<Entry | undefined> {
    const kept = pending
      .catch(() => undefined)
      .then(entry => {
        if (entry === undefined && this.entries.get(tenantRef) === kept)
          this.entries.delete(tenantRef)
        return entry
      })
    this.entries.set(tenantRef, kept)
    return kept
  }

  private entry(tenantRef: string): Promise<Entry | undefined> {
    return (
      this.entries.get(tenantRef) ??
      this.keep(
        tenantRef,
        Promise.resolve().then(() => this.prepare(tenantRef)),
      )
    )
  }

  /** The attempt of an entry did not create a runtime: count it, report it, set the next attempt. */
  private fail(tenantRef: string, entry: Entry, phase: string): void {
    const failures = (this.failures.get(tenantRef) ?? 0) + 1
    this.failures.set(tenantRef, failures)
    const againInMs = Math.max(0, (this.options.retryPauseMs ?? pauseAfter)(failures))
    entry.spent = { retryAt: this.now() + againInMs }
    this.options.report?.({ tenantRef, phase, failures, againInMs })
  }

  /** Starts the one attempt of an entry. A throw is a failed attempt, not a rejection kept forever. */
  private open(tenantRef: string, entry: Entry): Promise<Opened | undefined> {
    return Promise.resolve()
      .then(() => entry.assembly.open())
      .then(
        result => {
          if (result.kind === 'created') this.failures.delete(tenantRef)
          else this.fail(tenantRef, entry, result.phase)
          return result
        },
        () => {
          this.fail(tenantRef, entry, 'threw')
          return undefined
        },
      )
  }

  /**
   * The entry that replaces a spent one: what the failed attempt still holds is closed first, then
   * a new assembly is prepared. When the close does not settle, the spent entry stays and waits
   * another pause, so that no closing responsibility is dropped.
   */
  private renew(tenantRef: string, spent: Entry): Promise<Entry | undefined> {
    const known = this.renewals.get(spent)
    if (known !== undefined) return known
    const renewal = this.keep(
      tenantRef,
      (async () => {
        const held = await spent.opening
        if (held !== undefined && 'close' in held && (await held.close()).kind !== 'closed') {
          this.renewals.delete(spent)
          this.fail(tenantRef, spent, 'close')
          return spent
        }
        return this.prepare(tenantRef)
      })(),
    )
    this.renewals.set(spent, renewal)
    return renewal
  }

  async runtime(tenantRef: string): Promise<Runtime | undefined> {
    if (this.closing) return undefined
    let entry = await this.entry(tenantRef)
    if (entry?.spent !== undefined) {
      if (this.now() < entry.spent.retryAt) return undefined
      entry = await this.renew(tenantRef, entry)
      if (entry?.spent !== undefined) return undefined
    }
    if (!entry || this.closing) return undefined
    entry.opening ??= this.open(tenantRef, entry)
    const result = await entry.opening
    if (result?.kind !== 'created') return undefined
    if (!this.closing) return result
    await result.close()
    return undefined
  }

  /** The Settings of an open tenant runtime; undefined when the runtime is not open. */
  async settings(tenantRef: string): Promise<TenantSettingsAccess | undefined> {
    if ((await this.runtime(tenantRef)) === undefined) return undefined
    return (await this.entry(tenantRef))?.assembly.settings
  }

  private async drain(): Promise<StopResult> {
    const entries = await Promise.all(this.entries.values())
    const results = await Promise.all(
      entries.map(async entry => {
        const runtime = await entry?.opening
        return runtime && 'close' in runtime ? runtime.close() : { kind: 'closed' as const }
      }),
    )
    const pending = results.filter(result => result.kind !== 'closed').length
    return pending === 0
      ? { kind: 'settled' }
      : {
          kind: 'incomplete',
          detail: `${pending} governance runtime(s) retain closing responsibility`,
        }
  }

  async close(deadlineMonotonicMs: number): Promise<StopResult> {
    this.closing = true
    this.stopping ??= this.drain()
      .catch((): StopResult => ({ kind: 'failed', detail: 'governance runtime shutdown failed' }))
      .finally(() => {
        this.stopping = undefined
      })
    const timer = monotonicClock.after(deadlineMonotonicMs - monotonicClock.now())
    try {
      return await Promise.race([
        this.stopping,
        timer.promise.then((): StopResult => ({
          kind: 'incomplete',
          detail: 'governance runtime shutdown deadline',
        })),
      ])
    } finally {
      timer.cancel()
    }
  }
}
