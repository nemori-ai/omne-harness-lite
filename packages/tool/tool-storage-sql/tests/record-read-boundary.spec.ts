import type { JsonValue } from '@omne-harness/sql-contract'
import { expect, it } from 'vitest'
import { createSqlToolLedgerStore } from '../src/index.ts'
import { openApp, TENANT_A } from './fixtures/app.ts'

const wanted = { kind: 'host', host: { key: 'wanted', value: 'exact' } }
const other = { kind: 'host', host: { key: 'other', value: 'unrelated' } }
const stored = (record: typeof wanted) => ({ key: `host:${record.host.key}`, record })

it.each<[string, JsonValue]>([
  ['wrong key', { revision: '1', records: [stored(other)] }],
  ['multiple records', { revision: '1', records: [stored(wanted), stored(other)] }],
  ['unsupported record', { revision: '1', records: [{ key: 'host:wanted', record: {} }] }],
  ['invalid revision', { revision: 42, records: [stored(wanted)] }],
  ['missing rows', { revision: '1' }],
])('a point read refuses %s from the SQL boundary', async (_name, output) => {
  const app = await openApp()
  try {
    const store = createSqlToolLedgerStore({
      ...app.options,
      storage: {
        ...app.options.storage,
        read: async input => {
          const answer = await app.options.storage.read(input)
          if (answer.kind !== 'read') throw new Error('fixture SQL read must succeed')
          return { ...answer, output }
        },
      },
    })
    expect(
      await store.readRecord({ kind: 'host', tenant: TENANT_A, key: 'domain' }, 'host:wanted'),
    ).toMatchObject({ kind: 'unavailable', diagnostic: expect.any(String) })
  } finally {
    app.close()
  }
})
