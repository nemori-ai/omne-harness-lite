// `createMcpCore`: the configuration is checked at construction (SPEC S3), the four services share
// one connection table, and the inspection port is the category port plus the two readers.
import { describe, expect, it } from 'vitest'
import { readBodyText } from '@omne-harness/assets'
import type { McpServices } from '@omne-harness/mcp-contract'
import { createInMemoryCatalogStore, createMcpCore, type McpCore } from '../src/index.ts'
import { alice, json, ref, type Principal } from './doubles/values.ts'
import { CONFIG, adoptStdio, usualScript, world } from './doubles/world.ts'

const files = ref('files')

describe('createMcpCore', () => {
  it('throws RangeError for an unlawful configuration and builds nothing', () => {
    const w = world()
    expect(() => createMcpCore(w.ports, { ...CONFIG, maxListingPages: 0 })).toThrow(RangeError)
    expect(() => createMcpCore(w.ports, { ...CONFIG, maxActions: 1.5 })).toThrow(RangeError)
    expect(() => createMcpCore(w.ports, { ...CONFIG, instructionsByteLimit: -1 })).toThrow(
      RangeError,
    )
    const broken: unknown = { ...CONFIG, principalKey: 'alice' }
    expect(() => createMcpCore(w.ports, broken as typeof CONFIG)).toThrow(RangeError)
    expect(w.adoption.calls()).toBe(0)
  })

  it('gives the four core services, which share one connection table', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const mcp = createMcpCore(w.ports, CONFIG)
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

  it('stamps the acquisition time from the clock it is given', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const mcp = createMcpCore(w.ports, CONFIG, { now: () => new Date('2026-11-03T08:00:00Z') })
    await mcp.discovery.refresh(alice, { ref: files })
    const read = await w.store.read({
      tenant: alice.tenant,
      account: { kind: 'anonymous' },
      holding: files.holding,
    })
    expect(read).toMatchObject({ ok: { freshness: { acquiredAt: '2026-11-03T08:00:00.000Z' } } })
  })

  it('is the service set of the contract without the invoker', () => {
    const w = world()
    const mcp: McpCore<Principal, string> = createMcpCore(w.ports, CONFIG)
    const services: Omit<McpServices<Principal, string>, 'invoker'> = mcp
    expect(services.discovery).toBe(mcp.discovery)
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
    const { inspection } = createMcpCore(world().ports, CONFIG)
    expect(inspection.category).toBe('mcp')
    expect(inspection.inspect(json(stdio))).toMatchObject({
      ok: { name: 'files', auth: 'none', transport: { kind: 'stdio' } },
    })
    expect(inspection.launchesLocalCommand(json(stdio))).toEqual({ ok: true })
    expect(inspection.launchesLocalCommand(json(http))).toEqual({ ok: false })
    expect(inspection.inspect(json({ name: 'files' }))).toEqual({ failure: 'malformed' })
    expect(inspection.launchesLocalCommand('nonsense')).toEqual({ failure: 'malformed' })
  })

  it('judges a read body like the contract and refuses other input', () => {
    const { inspection } = createMcpCore(world().ports, CONFIG)
    const read = readBodyText(JSON.stringify(stdio), LIMITS)
    if (read.kind !== 'ok') throw new Error('body did not read')
    expect(inspection.judge(read.value, { capabilityName: 'files' })).toEqual({ ok: true })
    expect(inspection.judge(json(stdio))).toMatchObject({ ok: false })
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
