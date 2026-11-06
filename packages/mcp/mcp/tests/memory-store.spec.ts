// The production in-memory catalog store runs the contract's conformance suite. It is never
// unavailable, so CS8 is not applicable; the three isolation cases make that key rule explicit.
import { describe, expect, it } from 'vitest'
import type { CatalogKey } from '@omne-harness/mcp-contract'
import {
  mcpCatalogStoreConformance,
  runConformanceCase,
  type CatalogStoreFixture,
} from '@omne-harness/mcp-contract/testing'
import { createInMemoryCatalogStore } from '../src/store/memory.ts'
import { credentialBindingOf, endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { away, home } from './doubles/identities.ts'
import { storedRecord, world } from './doubles/world.ts'

const files = endpointRefOf('files')
const key: CatalogKey = { tenant: home, account: { kind: 'anonymous' }, holding: files.holding }
const otherTenant: CatalogKey = { ...key, tenant: away }
const otherAccount: CatalogKey = {
  ...key,
  account: { kind: 'credential', binding: credentialBindingOf('main') },
}
const otherHolding: CatalogKey = { ...key, holding: endpointRefOf('files', 'org/files').holding }

function fixture(): CatalogStoreFixture {
  return {
    store: createInMemoryCatalogStore(),
    key,
    otherKeys: [otherTenant, otherAccount, otherHolding],
  }
}

describe('createInMemoryCatalogStore conformance', () => {
  for (const conformance of mcpCatalogStoreConformance())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const verdict = await runConformanceCase(conformance, fixture())
      expect(verdict).toEqual(
        conformance.clause === 'CS8'
          ? { kind: 'not-applicable', handle: 'unavailable' }
          : { kind: 'passed' },
      )
    })
})

describe('createInMemoryCatalogStore isolation', () => {
  it.each([
    ['tenant', otherTenant],
    ['peer account', otherAccount],
    ['holding', otherHolding],
  ])('keeps a record from a key that differs in the %s', async (_name, other) => {
    const store = createInMemoryCatalogStore()
    const w = world()
    const record = await storedRecord(
      { ...w, store: { ...w.store, read: store.read, write: store.write } },
      key,
      ['read'],
    )
    expect(await store.read(key)).toEqual({ ok: record })
    expect(await store.read(other)).toEqual({ ok: 'absent' })
    expect(await store.write(other, record, record.revision)).toEqual({
      failure: 'revision-conflict',
    })
  })

  it('refuses a tenant that did not come from legal-identity', async () => {
    const store = createInMemoryCatalogStore()
    const forged = { ...key, tenant: { ...home } }
    await expect(store.read(forged)).rejects.toThrow(TypeError)
  })
})
