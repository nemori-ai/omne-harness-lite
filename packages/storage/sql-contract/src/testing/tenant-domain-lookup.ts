// The `TenantDomainLookup` double and its conformance suite. The double answers from an explicit
// table of published entries and records each request; it never registers a tenant. Durability
// is none. A pass proves the in-memory behavior, not the directory of the session storage composite.
import type { TenantDomain, TenantDomainLookup, TenantDomainLookupResult } from '../types.ts'

export interface MemoryTenantDomainLookup extends TenantDomainLookup {
  readonly durability: 'none'
  readonly controls: Readonly<{
    /** Publishes `entry`, as a later snapshot of the directory would. */
    publish(entry: TenantDomain): void
    /** While `diagnostic` is a string, every lookup answers `unavailable`; `null` restores. */
    setUnavailable(diagnostic: string | null): void
    /** The received requests in call order. */
    asked(): readonly Readonly<{ tenant: string }>[]
  }>
}

export function createMemoryTenantDomainLookup(
  published: readonly TenantDomain[] = [],
): MemoryTenantDomainLookup {
  const entries: TenantDomain[] = [...published]
  const asked: Readonly<{ tenant: string }>[] = []
  let unavailable: string | null = null
  return Object.freeze({
    durability: 'none' as const,
    async lookup(input: Readonly<{ tenant: string }>): Promise<TenantDomainLookupResult> {
      asked.push({ tenant: input.tenant })
      if (unavailable !== null) return { kind: 'unavailable', diagnostic: unavailable }
      const entry = entries.find(item => item.tenant === input.tenant)
      return entry === undefined
        ? { kind: 'unregistered' }
        : { kind: 'ready', domain: entry.domain }
    },
    controls: Object.freeze({
      publish: (entry: TenantDomain) => {
        entries.push(entry)
      },
      setUnavailable: (diagnostic: string | null) => {
        unavailable = diagnostic
      },
      asked: () => [...asked],
    }),
  })
}

/**
 * What the lookup suite needs. `registered` is an entry of the published snapshot; `unregistered`
 * names a tenant that the snapshot does not hold. `setUnavailable`, when offered, makes the
 * snapshot unreadable (`null` restores it).
 */
export type TenantDomainLookupFixture = Readonly<{
  lookup: TenantDomainLookup
  registered: TenantDomain
  unregistered: string
  setUnavailable?: (diagnostic: string | null) => void
}>

export type TenantDomainLookupVerdicts = Readonly<{
  passed: readonly string[]
  failed: readonly Readonly<{ id: string; message: string }>[]
  notApplicable: readonly string[]
}>

class NotApplicable extends Error {}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const show = (value: unknown): string => JSON.stringify(value)

const scenarios: readonly Readonly<{
  id: string
  title: string
  run(fixture: TenantDomainLookupFixture): Promise<void>
}>[] = [
  {
    id: 'L1',
    title: 'a registered tenant reads ready with its own domain',
    async run({ lookup, registered }) {
      const result = await lookup.lookup({ tenant: registered.tenant })
      expect(
        result.kind === 'ready' && show(result.domain) === show(registered.domain),
        `expected ready with ${show(registered.domain)}, got ${show(result)}`,
      )
    },
  },
  {
    id: 'L2',
    title: 'an unregistered tenant reads unregistered, and the lookup does not register it',
    async run({ lookup, unregistered }) {
      for (const attempt of ['first', 'second']) {
        const result = await lookup.lookup({ tenant: unregistered })
        expect(
          result.kind === 'unregistered',
          `${attempt} lookup: expected unregistered, got ${show(result)}`,
        )
      }
    },
  },
  {
    id: 'L3',
    title: 'an unreadable snapshot answers unavailable, never unregistered or a domain',
    async run({ lookup, registered, unregistered, setUnavailable }) {
      if (setUnavailable === undefined) throw new NotApplicable()
      setUnavailable('directory rebuilding')
      for (const tenant of [registered.tenant, unregistered]) {
        const result = await lookup.lookup({ tenant })
        expect(
          result.kind === 'unavailable',
          `${tenant}: expected unavailable, got ${show(result)}`,
        )
      }
      setUnavailable(null)
      const restored = await lookup.lookup({ tenant: registered.tenant })
      expect(restored.kind === 'ready', `after restore: expected ready, got ${show(restored)}`)
    },
  },
]

/** Runs every scenario on a fresh fixture and reports each verdict; it does not throw on a failure. */
export async function runTenantDomainLookupConformance(
  fixture: () => TenantDomainLookupFixture | Promise<TenantDomainLookupFixture>,
): Promise<TenantDomainLookupVerdicts> {
  const passed: string[] = []
  const failed: { id: string; message: string }[] = []
  const notApplicable: string[] = []
  for (const scenario of scenarios) {
    try {
      await scenario.run(await fixture())
      passed.push(scenario.id)
    } catch (error) {
      if (error instanceof NotApplicable) notApplicable.push(scenario.id)
      else
        failed.push({
          id: scenario.id,
          message: `${scenario.title}: ${error instanceof Error ? error.message : String(error)}`,
        })
    }
  }
  return { passed, failed, notApplicable }
}
