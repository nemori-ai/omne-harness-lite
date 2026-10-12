import { expect, test } from 'vitest'
import type { KyselyPlugin } from 'kysely'
import { scope, seed, host, init, reader } from './fixture.ts'

test('a warmed selected read transfers only selected SQL entries, including after unrelated log progress', async () => {
  let returnedEntries = 0
  const probe: KyselyPlugin = {
    transformQuery: ({ node }) => node,
    async transformResult({ result }) {
      if (result.rows.some(row => Object.hasOwn(row, 'registration')))
        returnedEntries += result.rows.length
      return result
    },
  }
  const h = await host(undefined, physical => ({
    read: fn => physical.read(tx => fn({ ...tx, db: tx.db.withPlugin(probe) })),
    write: fn => physical.write(fn),
  }))
  try {
    let revision = await init(h)
    const keys = Array.from({ length: 20 }, (_, i) => `key-${i}`)
    h.auth.setKeys(h.access, keys)
    h.auth.setKeys(h.publisher, keys)
    h.auth.setKeys(h.tool, keys)
    for (const key of keys) {
      const registered = await h.owner.operations.register(
        h.access,
        scope,
        { ...seed.required[0]!, key, required: false },
        revision,
      )
      if (registered.kind !== 'applied') throw new Error('fixture registration failed')
      revision = registered.revision
      expect(
        await h.owner.operations.update(h.publisher, scope, { key, value: key }, 'absent'),
      ).toHaveProperty('kind', 'applied')
    }
    const selected = await reader(h)
    const initial = await selected.read(['key-7'])
    expect(initial).toMatchObject({ kind: 'values', values: [{ key: 'key-7', value: 'key-7' }] })
    returnedEntries = 0
    expect(await selected.read(['key-7'])).toEqual(initial)
    expect(returnedEntries).toBe(2) // One selected SQL row for each of the two verified observations.
    expect(
      await h.log.append(
        scope.session,
        [{ tenant: scope.tenant, readKeys: [], payload: { kind: 'bookkeeping' } }],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      ),
    ).not.toHaveProperty('failure')
    returnedEntries = 0
    expect(await selected.read(['key-7'])).toEqual(initial)
    expect(returnedEntries).toBe(2)
    const listed = await h.owner.operations.registrations(h.access, scope)
    expect(listed.kind).toBe('registrations')
    if (listed.kind !== 'registrations') throw new Error('registration listing failed')
    expect(listed.entries.map(entry => entry.key).sort()).toEqual([...keys].sort())
  } finally {
    await h.close()
  }
})
