// `createMcp`: the configuration is checked at construction (SPEC S3), the services share one
// connection table, the clock of the ports stamps the listings, and the inspection port is the
// category port plus the two readers.
import { describe, expect, it } from 'vitest'
import { readBodyText } from '@omne-harness/assets'
import type { McpServices } from '@omne-harness/mcp-contract'
import { createInMemoryCatalogStore, createMcp } from '../src/index.ts'
import { jsonOf, endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice, type Principal } from './doubles/identities.ts'
import { CONFIG, adoptStdio, usualScript, world } from './doubles/world.ts'

const files = endpointRefOf('files')

describe('createMcp', () => {
  it('throws RangeError for an unlawful configuration and builds nothing', () => {
    const w = world()
    expect(() => createMcp(w.ports, { ...CONFIG, maxListingPages: 0 })).toThrow(RangeError)
    expect(() => createMcp(w.ports, { ...CONFIG, maxActions: 1.5 })).toThrow(RangeError)
    expect(() => createMcp(w.ports, { ...CONFIG, instructionsByteLimit: -1 })).toThrow(
      RangeError,
    )
    const broken: unknown = { ...CONFIG, principalKey: 'alice' }
    expect(() => createMcp(w.ports, broken as typeof CONFIG)).toThrow(RangeError)
    expect(w.adoption.calls()).toBe(0)
  })

  it('gives the services, which share one connection table', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const mcp = createMcp(w.ports, CONFIG)
    expect(Object.keys(mcp).sort()).toEqual(['connections', 'discovery', 'inspection', 'status'])
    expect(await mcp.discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'published', revision: 1 },
    })
    expect(await mcp.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
    expect(await mcp.connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'tree-confirmed' },
    })
    expect(await mcp.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
  })

  it('stamps the acquisition time from the clock of the ports (SPEC S3)', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const clock = { now: () => new Date('2026-11-03T08:00:00Z') }
    const mcp = createMcp({ ...w.ports, clock }, CONFIG)
    await mcp.discovery.refresh(alice, { ref: files })
    const read = await w.store.read({
      tenant: alice.tenant,
      account: { kind: 'anonymous' },
      holding: files.holding,
    })
    expect(read).toMatchObject({ ok: { freshness: { acquiredAt: '2026-11-03T08:00:00.000Z' } } })
  })

  it('is the service set of the contract', () => {
    const w = world()
    const services: Omit<McpServices<Principal, string>, 'invoker'> = createMcp<Principal, string>(
      w.ports,
      CONFIG,
    )
    expect(typeof services.discovery.refresh).toBe('function')
  })
})

describe('inspection', () => {
  const LIMITS = {
    maxBytes: 20_000,
    maxDepth: 16,
    maxItems: 1_000,
    maxMembers: 32,
    maxStringLength: 1_000,
    maxNumberLength: 20,
  } as const
  const stdio = { name: 'files', transport: 'stdio', auth: 'none', launch: { command: 'mcp' } }
  const http = { name: 'files', transport: 'streamable-http', auth: 'oauth' }

  it('is the category port mcp with inspect and launchesLocalCommand', () => {
    const { inspection } = createMcp(world().ports, CONFIG)
    expect(inspection.category).toBe('mcp')
    expect(inspection.inspect(jsonOf(stdio))).toMatchObject({
      ok: { name: 'files', auth: 'none', transport: { kind: 'stdio' } },
    })
    expect(inspection.launchesLocalCommand(jsonOf(stdio))).toEqual({ ok: true })
    expect(inspection.launchesLocalCommand(jsonOf(http))).toEqual({ ok: false })
    expect(inspection.inspect(jsonOf({ name: 'files' }))).toEqual({ failure: 'malformed' })
    expect(inspection.launchesLocalCommand('nonsense')).toEqual({ failure: 'malformed' })
  })

  it('judges a read body like the contract and refuses other input', () => {
    const { inspection } = createMcp(world().ports, CONFIG)
    const read = readBodyText(JSON.stringify(stdio), LIMITS)
    if (read.kind !== 'ok') throw new Error('body did not read')
    expect(inspection.judge(read.value, { capabilityName: 'files' })).toEqual({ ok: true })
    expect(inspection.judge(jsonOf(stdio))).toMatchObject({ ok: false })
    expect(inspection.deriveDeclarations(read.value)).toEqual({
      entries: ['setting:preference:connect-timeout'],
    })
  })
})

describe('createInMemoryCatalogStore', () => {
  it('is a fresh, empty store each time', async () => {
    const store = createInMemoryCatalogStore()
    const key = {
      tenant: alice.tenant,
      account: { kind: 'anonymous' as const },
      holding: files.holding,
    }
    expect(await store.read(key)).toEqual({ ok: 'absent' })
  })
})
