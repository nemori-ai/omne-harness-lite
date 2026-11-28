// @module-tag slow
// A record written before the storage closes is read again after it opens on the same directory (C106).
import { expect, it } from 'vitest'
import type { CatalogKey } from '@omne-harness/mcp-contract'
import {
  endpointRefOf,
  sampleCatalogRecord,
  sampleGrant,
  samplePending,
} from '@omne-harness/mcp-contract/testing'
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

it('a grant, a pending authorization and a client registration written before a restart are there after it', async () => {
  const key = { tenant: tenantOf('s'), holding: endpointRefOf('desk').holding, endpoint: 'desk' }
  const root = temporaryRoot()
  const first = await openSqlWorld(root)
  const pending = samplePending(key, 'state-1')
  const registration = { way: 'dynamic', clientId: 'c-1', authMethod: 'none' } as const
  expect(await first.grants.write(key, sampleGrant(1), 'absent')).toEqual({ ok: 'written' })
  expect(await first.grants.begin(pending)).toEqual({ ok: true })
  expect(await first.grants.register(key.tenant, 'https://auth.example', registration)).toEqual({
    ok: true,
  })
  await first.close()
  const second = await openSqlWorld(root)
  try {
    expect(await second.grants.read(key)).toEqual({ ok: sampleGrant(1) })
    expect(await second.grants.take(tenantOf('t'), 'state-1')).toEqual({ ok: 'absent' })
    expect(await second.grants.take(key.tenant, 'state-1')).toEqual({ ok: pending })
    expect(await second.grants.registration(key.tenant, 'https://auth.example')).toEqual({
      ok: registration,
    })
  } finally {
    await second.close()
  }
})

it('a grant write whose commit outcome is not known is written only when the row now holds its revision', async () => {
  const key = { tenant: tenantOf('s'), holding: endpointRefOf('desk').holding, endpoint: 'desk' }
  const world = await openSqlWorld()
  try {
    world.blur(false)
    expect(await world.grants.write(key, sampleGrant(1), 'absent')).toEqual({
      failure: 'unavailable',
    })
    expect(await world.grants.read(key)).toEqual({ ok: 'absent' })
    world.blur(true)
    expect(await world.grants.write(key, sampleGrant(1), 'absent')).toEqual({ ok: 'written' })
    world.blur(true)
    expect(await world.grants.take(key.tenant, 'any')).toEqual({ failure: 'unavailable' })
  } finally {
    await world.close()
  }
})
