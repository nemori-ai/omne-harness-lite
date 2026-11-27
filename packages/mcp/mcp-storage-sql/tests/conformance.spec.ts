// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { afterEach, describe, expect, it } from 'vitest'
import type { CatalogKey } from '@omne-harness/mcp-contract'
import {
  credentialBindingOf,
  endpointRefOf,
  mcpCatalogStoreConformance,
  mcpContinuationRecordsConformance,
  mcpTaskRecordsConformance,
  mcpAuthorizationRecordsConformance,
  mcpEventRecordsConformance,
  runConformanceCase,
  sampleCatalogRecord,
} from '@omne-harness/mcp-contract/testing'
import { openSqlWorld, tenantOf, type SqlWorld } from './world.ts'

const files = endpointRefOf('files')
const key: CatalogKey = {
  tenant: tenantOf('s'),
  account: { kind: 'anonymous' },
  holding: files.holding,
}
const otherKeys: CatalogKey[] = [
  { ...key, tenant: tenantOf('t') },
  { ...key, account: { kind: 'credential', binding: credentialBindingOf('main') } },
  { ...key, holding: endpointRefOf('files', 'org/files').holding },
]

describe('the SQL catalog store conforms to the store contract (MC-31)', () => {
  const open: SqlWorld[] = []
  afterEach(async () => {
    await Promise.all(open.splice(0).map(world => world.close()))
  })

  for (const conformance of mcpCatalogStoreConformance())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const world = await openSqlWorld()
      open.push(world)
      const verdict = await runConformanceCase(conformance, {
        store: world.store,
        key,
        otherKeys,
        unavailable: async () => world.unbind(),
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })

  it('a write whose commit outcome is not known is written only when the row now holds its revision', async () => {
    const world = await openSqlWorld()
    open.push(world)
    const first = sampleCatalogRecord(1, ['read'])
    world.blur(false)
    expect(await world.store.write(key, first, 'absent')).toEqual({ failure: 'unavailable' })
    expect(await world.store.read(key)).toEqual({ ok: 'absent' })
    world.blur(true)
    expect(await world.store.write(key, first, 'absent')).toEqual({ ok: true })
    expect(await world.store.read(key)).toEqual({ ok: first })
  })
})

describe('the SQL continuation records conform to their contract (MC-27, MC-31)', () => {
  const open: SqlWorld[] = []
  afterEach(async () => {
    await Promise.all(open.splice(0).map(world => world.close()))
  })

  for (const conformance of mcpContinuationRecordsConformance())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const world = await openSqlWorld()
      open.push(world)
      const verdict = await runConformanceCase(conformance, {
        records: world.continuations,
        tenant: tenantOf('s'),
        otherTenant: tenantOf('t'),
        unavailable: async () => world.unbind(),
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })
})

describe('the SQL task table conforms to its contract (MC-28, MC-31)', () => {
  const open: SqlWorld[] = []
  afterEach(async () => {
    await Promise.all(open.splice(0).map(world => world.close()))
  })

  for (const conformance of mcpTaskRecordsConformance())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const world = await openSqlWorld()
      open.push(world)
      const verdict = await runConformanceCase(conformance, {
        records: world.tasks,
        tenant: tenantOf('s'),
        otherTenant: tenantOf('t'),
        unavailable: async () => world.unbind(),
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })
})

describe('the SQL grants conform to their contract (MC-31, C202)', () => {
  const open: SqlWorld[] = []
  afterEach(async () => {
    await Promise.all(open.splice(0).map(world => world.close()))
  })

  for (const conformance of mcpAuthorizationRecordsConformance())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const world = await openSqlWorld()
      open.push(world)
      const verdict = await runConformanceCase(conformance, {
        records: world.grants,
        tenant: tenantOf('s'),
        otherTenant: tenantOf('t'),
        unavailable: async () => world.unbind(),
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })
})

describe('the SQL event records conform to their contract (MC-36, C302, C303, C307)', () => {
  const worlds: SqlWorld[] = []
  afterEach(async () => {
    await Promise.all(worlds.splice(0).map(world => world.close()))
  })
  for (const conformance of mcpEventRecordsConformance()) {
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const world = await openSqlWorld()
      worlds.push(world)
      const verdict = await runConformanceCase(conformance, {
        records: world.subscriptions,
        tenant: tenantOf('s'),
        otherTenant: tenantOf('t'),
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })
  }
})
