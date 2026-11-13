// Worker slots bound what works at the same time, not how many domains a deployment has (SPEC 5.2
// 持有与空闲, SPEC 12.2). With more domains than slots, an idle domain yields its write Worker when
// another needs the slot, and opens again at its next use. A domain that is held does not yield.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildReadMaterials,
  closeProviders,
  delay,
  readRequest,
  readyProvider,
  summary,
} from './read-support.ts'
import {
  TENANT_A,
  commitRequest,
  identity,
  kindOf,
  leases,
  makeWorkspace,
  registration,
  type Built,
  type Provider,
  type Workspace,
} from './support.ts'

let workspace: Workspace
let built: Built

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildReadMaterials(workspace)
  leases.admitted.length = 0
  leases.released = 0
})

afterEach(async () => {
  await closeProviders()
  await workspace.remove()
})

// Three slots, one of them only for writers: at most two readers.
const tight = { maxWorkers: 3, reservedWriterSlots: 1, maxReadWorkersPerDomain: 1 }
const domainOf = (index: number): string => `domain-${String(index)}`

const read = (domain: string, handler = 'page', input: Record<string, number> = {}) => ({
  ...readRequest(handler, input),
  domain: { scope: TENANT_A, transactionDomain: domain },
})

const commit = (domain: string, key: string) =>
  commitRequest(built, { identity: identity({ transactionDomain: domain, operationKey: key }) })

/** Registers `count` more domains beside the one `readyProvider` made. */
async function withDomains(provider: Provider, count: number): Promise<readonly string[]> {
  const domains: string[] = []
  for (let index = 0; index < count; index += 1) {
    const domain = domainOf(index)
    const registered = await provider.storage.registerCombination(
      registration(built, { transactionDomain: domain }),
    )
    expect(kindOf(registered)).toBe('registered')
    domains.push(domain)
  }
  return domains
}

/** Workers whose lease is admitted and not released yet: each holds one slot. */
const liveWorkers = (): number => leases.admitted.length - leases.released

describe('more domains than Worker slots', () => {
  it('reads and writes every domain, and never has more Workers than slots', async () => {
    const provider = await readyProvider(workspace, built, tight)
    const domains = await withDomains(provider, 6)
    let most = liveWorkers()
    for (const round of [1, 2])
      for (const domain of domains) {
        const key = `write-${String(round)}`
        expect(kindOf(await provider.storage.commit(commit(domain, key)))).toBe('committed')
        expect(summary(await provider.storage.read(read(domain)))).toBe('read')
        most = Math.max(most, liveWorkers())
      }
    expect(most).toBeLessThanOrEqual(tight.maxWorkers)
    // What was committed before a yield is there after the domain opened again.
    for (const domain of domains) {
      const result = await provider.storage.read(read(domain, 'rows', { limit: 10 }))
      expect(result).toMatchObject({ kind: 'read', output: { count: 2 } })
    }
  })

  it('opening a domain takes a slot: registrations alone never exceed the slots', async () => {
    const provider = await readyProvider(workspace, built, tight)
    await withDomains(provider, 6)
    expect(liveWorkers()).toBeLessThanOrEqual(tight.maxWorkers)
  })

  it('a write in flight keeps its Worker: concurrent writes never end as worker_exited', async () => {
    // Two slots, three domains, writes to all three at once, many rounds. A write either commits or
    // is refused before anything was sent (no slot right now); it is never left without its Worker.
    const provider = await readyProvider(workspace, built, { ...tight, maxWorkers: 2 })
    const domains = await withDomains(provider, 3)
    for (let round = 0; round < 15; round += 1) {
      const results = await Promise.all(
        domains.map(domain => provider.storage.commit(commit(domain, `race-${String(round)}`))),
      )
      for (const result of results) {
        const text = JSON.stringify(result)
        expect(text).not.toContain('worker_exited')
        expect(['committed', 'rejected_before_accept/domain_unavailable']).toContain(kindOf(result))
      }
    }
    // With nothing else in flight, every domain commits.
    for (const domain of domains)
      expect(kindOf(await provider.storage.commit(commit(domain, 'after')))).toBe('committed')
  })

  it('a read does not need the write Worker of its domain', async () => {
    const provider = await readyProvider(workspace, built, tight)
    const domains = await withDomains(provider, 3)
    // Three write Workers would fill the three slots. Reads of the three domains at the same time
    // still run: the write Workers are idle, and a read asks only for a reader.
    const results = await Promise.all(
      domains.map(domain => provider.storage.read(read(domain)).then(summary)),
    )
    expect(results).toEqual(['read', 'read', 'read'])
    expect(liveWorkers()).toBeLessThanOrEqual(tight.maxWorkers)
  })

  it('reads go on while a slow read of another domain runs', async () => {
    const provider = await readyProvider(workspace, built, tight)
    const domains = await withDomains(provider, 2)
    const slow = provider.storage.read(read(domains[0] ?? '', 'page', { sleepMs: 400 }))
    await delay(100)
    expect(summary(await provider.storage.read(read(domains[1] ?? '')))).toBe('read')
    expect(summary(await slow)).toBe('read')
  })
})
