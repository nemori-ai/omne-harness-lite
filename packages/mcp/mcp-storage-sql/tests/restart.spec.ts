// @module-tag slow
// A record written before the storage closes is read again after it opens on the same directory (C106).
import { expect, it } from 'vitest'
import type { CatalogKey } from '@omne-harness/mcp-contract'
import { endpointRefOf, sampleCatalogRecord } from '@omne-harness/mcp-contract/testing'
import { openSqlWorld, temporaryRoot, tenantOf } from './world.ts'

it('a catalog written before a restart is read after it, with the freshness it was acquired with', async () => {
  const key: CatalogKey = {
    tenant: tenantOf('s'),
    account: { kind: 'anonymous' },
    holding: endpointRefOf('files').holding,
  }
  const root = temporaryRoot()
  const first = await openSqlWorld(root)
  const record = sampleCatalogRecord(1, ['read', 'write'])
  expect(await first.store.write(key, record, 'absent')).toEqual({ ok: true })
  await first.close()
  const second = await openSqlWorld(root)
  try {
    expect(await second.store.read(key)).toEqual({ ok: record })
    expect(await second.store.read({ ...key, tenant: tenantOf('t') })).toEqual({ ok: 'absent' })
  } finally {
    await second.close()
  }
})
