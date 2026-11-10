import type { JsonValue } from '@omne-harness/sql-contract'
import { expect, it } from 'vitest'
import { createSqlToolLedgerStore } from '../src/index.ts'
import { openApp, TENANT_A } from './fixtures/app.ts'

const wanted = { kind: 'host', host: { key: 'wanted', value: 'exact' } }
const other = { kind: 'host', host: { key: 'other', value: 'unrelated' } }
const stored = (record: typeof wanted) => ({ key: `host:${record.host.key}`, record })

const DOMAIN = { kind: 'host', tenant: TENANT_A, key: 'domain' } as const

/** A store whose SQL reads answer `output` once `forge()` is called. */
async function forging(output: JsonValue) {
  const app = await openApp()
  let forged = false
  const store = createSqlToolLedgerStore({
    ...app.options,
    storage: {
      ...app.options.storage,
      read: async input => {
        const answer = await app.options.storage.read(input)
        if (answer.kind !== 'read') throw new Error('fixture SQL read must succeed')
        return forged ? { ...answer, output } : answer
      },
    },
  })
  return {
    app,
    store,
    forge: () => {
      forged = true
    },
  }
}

// The first read of a domain reads the whole domain (the store keeps it), so an answer that is
// wrong only for a point read is not reachable there.
it.each<[string, JsonValue]>([
  ['unsupported record', { revision: '1', records: [{ key: 'host:wanted', record: {} }] }],
  ['invalid revision', { revision: 42, records: [stored(wanted)] }],
  ['missing rows', { revision: '1' }],
])('the first read of a domain refuses %s from the SQL boundary', async (_name, output) => {
  const { app, store, forge } = await forging(output)
  try {
    forge()
    expect(await store.readRecord(DOMAIN, 'host:wanted')).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.any(String),
    })
  } finally {
    app.close()
  }
})

// A record the kept domain does not hold is asked of the SQL storage by a point read.
it.each<[string, JsonValue]>([
  ['wrong key', { revision: '1', records: [stored(other)] }],
  ['multiple records', { revision: '1', records: [stored(wanted), stored(other)] }],
  ['unsupported record', { revision: '1', records: [{ key: 'host:wanted', record: {} }] }],
  ['invalid revision', { revision: 42, records: [stored(wanted)] }],
  ['missing rows', { revision: '1' }],
])('a point read refuses %s from the SQL boundary', async (_name, output) => {
  const { app, store, forge } = await forging(output)
  try {
    const seeded = await store.commit({
      domain: DOMAIN,
      expected: '0' as never,
      revision: '1' as never,
      writes: [{ kind: 'put', record: { kind: 'host', host: { key: 'seed', value: 1 } } }],
    })
    expect(seeded.kind).toBe('committed')
    expect(await store.read(DOMAIN)).toMatchObject({ kind: 'complete' })
    forge()
    expect(await store.readRecord(DOMAIN, 'host:wanted')).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.any(String),
    })
  } finally {
    app.close()
  }
})
