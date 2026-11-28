// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { expect, it } from 'vitest'
import type { CatalogKey, CatalogRevision, EventCatalogRecord } from '@omne-harness/mcp-contract'
import { endpointRefOf, jsonOf, sampleCatalogRecord } from '@omne-harness/mcp-contract/testing'
import { openSqlWorld, temporaryRoot, tenantOf } from './world.ts'

const key: CatalogKey = {
  tenant: tenantOf('s'),
  account: { kind: 'anonymous' },
  holding: endpointRefOf('desk').holding,
}
const events = (revision: number): EventCatalogRecord => ({
  revision: revision as CatalogRevision,
  basis: sampleCatalogRecord(1, []).basis,
  freshness: { acquiredAt: '2026-11-27T22:00:00.000Z', changedNotified: false },
  declared: true,
  types: [
    {
      name: 'incident.created',
      description: { untrusted: 'An incident was opened.' },
      delivery: ['poll', 'push'],
      inputSchema: jsonOf({ type: 'object' }),
      payloadSchema: jsonOf({ type: 'object' }),
    },
  ],
})

it('C301 the event types of a peer are kept beside its actions under the same key, by revision, across a restart', async () => {
  const root = temporaryRoot()
  const first = await openSqlWorld(root)
  const actions = sampleCatalogRecord(1, ['read'])
  expect(await first.store.write(key, actions, 'absent')).toEqual({ ok: true })
  expect(await first.events.read(key)).toEqual({ ok: 'absent' })
  expect(await first.events.write(key, events(1), 'absent')).toEqual({ ok: true })
  expect(await first.events.write(key, events(2), 'absent')).toEqual({
    failure: 'revision-conflict',
  })
  await first.close()
  const second = await openSqlWorld(root)
  try {
    expect(await second.events.read(key)).toEqual({ ok: events(1) })
    expect(await second.store.read(key)).toEqual({ ok: actions })
    expect(await second.events.read({ ...key, tenant: tenantOf('t') })).toEqual({ ok: 'absent' })
  } finally {
    await second.close()
  }
})
