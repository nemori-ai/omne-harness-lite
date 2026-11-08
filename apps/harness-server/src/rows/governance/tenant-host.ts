import type { DomainRef, TenantDomainLookup } from '@omne-harness/sql-contract'
import type { StandingDestinationResolver } from '@omne-harness/identity'
import type { SettingsSourceDestination } from '@omne-harness/settings-local/preparation'
import { tenantCodec } from '@omne-harness/legal-identity'
import { monotonicClock } from '../../shutdown.ts'
import type { StopResult } from '../../types.ts'
import type { TenantGovernanceAssembly } from './tenant-runtime.ts'

type Opened = Awaited<ReturnType<TenantGovernanceAssembly['open']>>
type Runtime = Extract<Opened, { kind: 'created' }>
type Options = Readonly<{
  domains: TenantDomainLookup
  prepare(tenantRef: string, domain: DomainRef): TenantGovernanceAssembly
}>
type Entry = {
  domain: DomainRef
  assembly: TenantGovernanceAssembly
  opening?: Promise<Opened>
}
const unavailable = () => ({ kind: 'unavailable' as const, diagnostic: 'tenant-governance-route' })

export class TenantGovernanceHost {
  private readonly options: Options
  private readonly entries = new Map<string, Promise<Entry | undefined>>()
  private closing = false
  private stopping: Promise<StopResult> | undefined
  readonly destination: StandingDestinationResolver
  readonly sourceDestination: SettingsSourceDestination

  constructor(options: Options) {
    this.options = { ...options }
    this.destination = {
      seal: async reservation => {
        const entry = await this.entry(reservation.binding.scopeRef)
        return entry?.assembly.destination.seal(reservation) ?? unavailable()
      },
    }
    this.sourceDestination = {
      recognize: async request => {
        const entry = await this.sourceEntry(request.destination.identity.domain)
        return entry?.assembly.sourceDestination.recognize(request) ?? unavailable()
      },
      seal: async request => {
        const entry = await this.sourceEntry(request.destination.identity.domain)
        return entry?.assembly.sourceDestination.seal(request) ?? unavailable()
      },
    }
  }

  private async prepare(tenantRef: string): Promise<Entry | undefined> {
    if (!tenantCodec.parse(tenantRef).ok) return undefined
    const result = await this.options.domains.lookup({ tenant: tenantRef })
    if (result.kind !== 'ready') return undefined
    const domain = result.domain
    if (domain.scope.kind !== 'tenant' || domain.scope.tenant !== tenantRef) return undefined
    return { domain: structuredClone(domain), assembly: this.options.prepare(tenantRef, domain) }
  }

  private entry(tenantRef: string): Promise<Entry | undefined> {
    const existing = this.entries.get(tenantRef)
    if (existing) return existing
    const pending = Promise.resolve()
      .then(() => this.prepare(tenantRef))
      .catch(() => undefined)
      .then(entry => {
        if (entry === undefined) this.entries.delete(tenantRef)
        return entry
      })
    this.entries.set(tenantRef, pending)
    return pending
  }

  private async sourceEntry(domain: DomainRef) {
    if (domain.scope.kind !== 'tenant') return undefined
    const entry = await this.entry(domain.scope.tenant)
    return entry?.domain.transactionDomain === domain.transactionDomain ? entry : undefined
  }

  async runtime(tenantRef: string): Promise<Runtime | undefined> {
    if (this.closing) return undefined
    const entry = await this.entry(tenantRef)
    if (!entry || this.closing) return undefined
    entry.opening ??= Promise.resolve().then(() => entry.assembly.open())
    const result = await entry.opening
    if (result.kind !== 'created') return undefined
    if (!this.closing) return result
    await result.close()
    return undefined
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
