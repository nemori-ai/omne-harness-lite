import type { DomainRef, TenantDomainLookup } from '@omne-harness/sql-contract'
import type { StandingDestinationResolver } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { pauseAfterFailures } from '../../retry-pause.ts'
import { monotonicClock } from '../../shutdown.ts'
import type { StopResult } from '../../types.ts'
import type { TenantGovernanceAssembly, TenantSettingsAccess } from './tenant-runtime.ts'

type Opened = Awaited<ReturnType<TenantGovernanceAssembly['open']>>
type Runtime = Extract<Opened, { kind: 'created' }>

export type TenantGovernanceOpenFailure = Readonly<{
  tenantRef: string
  phase: string
  failures: number
  againInMs: number
}>

type Options = Readonly<{
  domains: TenantDomainLookup
  prepare(tenantRef: string, domain: DomainRef): TenantGovernanceAssembly
  retryPauseMs?(failures: number): number
  now?(): number
  report?(failure: TenantGovernanceOpenFailure): void
}>

type Entry = {
  domain: DomainRef
  assembly: TenantGovernanceAssembly
  opening?: Promise<Opened | undefined>
  spent?: { retryAt: number }
}
const unavailable = () => ({ kind: 'unavailable' as const, diagnostic: 'tenant-governance-route' })

export class TenantGovernanceHost {
  private readonly options: Options
  private readonly entries = new Map<string, Promise<Entry | undefined>>()
  private readonly failures = new Map<string, number>()
  private readonly preparePauses = new Map<string, number>()
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
    const pause = this.preparePauses.get(tenantRef)
    if (pause !== undefined) {
      if (this.now() < pause) return undefined
      this.preparePauses.delete(tenantRef)
    }
    let result: Awaited<ReturnType<TenantDomainLookup['lookup']>>
    try {
      result = await this.options.domains.lookup({ tenant: tenantRef })
    } catch {
      return this.failPrepare(tenantRef, 'lookup')
    }
    if (result.kind === 'unregistered') return undefined
    if (result.kind !== 'ready') return this.failPrepare(tenantRef, 'lookup')
    const domain = result.domain
    if (domain.scope.kind !== 'tenant' || domain.scope.tenant !== tenantRef) return undefined
    try {
      return { domain: structuredClone(domain), assembly: this.options.prepare(tenantRef, domain) }
    } catch {
      return this.failPrepare(tenantRef, 'prepare')
    }
  }

  private failPrepare(tenantRef: string, phase: 'lookup' | 'prepare'): undefined {
    const againInMs = this.countFailure(tenantRef, phase)
    this.preparePauses.set(tenantRef, this.now() + againInMs)
    return undefined
  }

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

  private fail(tenantRef: string, entry: Entry, phase: string): void {
    entry.spent = { retryAt: this.now() + this.countFailure(tenantRef, phase) }
  }

  private countFailure(tenantRef: string, phase: string): number {
    const failures = (this.failures.get(tenantRef) ?? 0) + 1
    this.failures.set(tenantRef, failures)
    const againInMs = Math.max(0, (this.options.retryPauseMs ?? pauseAfterFailures)(failures))
    this.options.report?.({ tenantRef, phase, failures, againInMs })
    return againInMs
  }

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
