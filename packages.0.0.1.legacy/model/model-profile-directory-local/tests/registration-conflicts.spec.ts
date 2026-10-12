// Draft only. Copy into the owner after P2 terminal, then prove on original source before extraction.
import { describe, expect, it, vi } from 'vitest'
import { SelectQueryNode, TableNode, type KyselyPlugin, type QueryId } from 'kysely'
import { StorageDefect, StorageUnavailable, UniqueViolation } from '@omne-harness-lite/storage'
import { alice, scope, content, setup, expectRow } from './support.ts'

function profileConflictWindow(hiddenReads: Readonly<Record<string, number>>, insertError?: Error) {
  const hidden = new WeakSet<QueryId>()
  const remaining = new Map(Object.entries(hiddenReads))
  const trace: string[] = []
  const plugin: KyselyPlugin = {
    transformQuery({ node, queryId }) {
      if (SelectQueryNode.is(node)) {
        const from = node.from?.froms[0]
        if (from !== undefined && TableNode.is(from)) {
          const table = from.table.identifier.name
          trace.push(`read:${table}`)
          const count = remaining.get(table) ?? 0
          if (count > 0) {
            hidden.add(queryId)
            remaining.set(table, count - 1)
          }
        }
      }
      if (node.kind === 'InsertQueryNode' && node.into?.table.identifier.name === 'model_profile') {
        trace.push('insert:model_profile')
        if (insertError !== undefined) throw insertError
      }
      return node
    },
    async transformResult({ result, queryId }) {
      return hidden.has(queryId) ? { ...result, rows: [] } : result
    },
  }
  return { plugin, trace }
}

// This hides a query result in a real SQLite transaction to exercise the defensive conflict window.
// Inserts, unique violations, recovery reads and transaction completion still use the real driver.
// It is fault injection, not a claim that SQLite BEGIN IMMEDIATE allows this ordinary race.
describe('registration conflict recovery on an actual SQL transaction', () => {
  for (const mode of ['same', 'withdrawn', 'different'] as const) {
    it(`recovers only the listed identical row after the actual primary-key conflict: ${mode}`, async () => {
      const h = await setup(`conflict-${mode}`)
      let restore: () => void = () => {}
      try {
        const originalRow = expectRow(await h.catalog.registerProfile(alice, scope, content()))
        if (mode === 'withdrawn') await h.catalog.withdrawProfile(alice, originalRow.ref)
        const before = await h.read.readProfile(alice, originalRow.ref)
        const fault = profileConflictWindow({ model_profile: 1 })
        const original = h.storage.write.bind(h.storage)
        const write = vi
          .spyOn(h.storage, 'write')
          .mockImplementation(fn =>
            original(tx => fn({ ...tx, db: tx.db.withPlugin(fault.plugin) })),
          )
        restore = () => {
          write.mockRestore()
        }
        const input = mode === 'different' ? { ...content(), providers: ['different'] } : content()
        const result = await h.catalog.registerProfile(alice, scope, input)
        expect(result).toEqual(mode === 'same' ? originalRow : { failure: 'routeNameTaken' })
        expect(fault.trace).toEqual([
          'read:membership',
          'read:model_profile_configuration',
          'read:model_profile',
          'insert:model_profile',
          'read:model_profile',
          'read:model_profile_configuration',
        ])
        write.mockRestore()
        expect(await h.read.readProfile(alice, originalRow.ref)).toEqual(before)
        const histories = await h.storage.read(tx =>
          tx.db.selectFrom('model_profile_configuration').selectAll().execute(),
        )
        expect(histories).toHaveLength(1)
      } finally {
        restore()
        await h.close()
      }
    })
  }

  it('rechecks the historical revision on the recovered row before recognition', async () => {
    const h = await setup('raced-history')
    let restore: () => void = () => {}
    try {
      const first = expectRow(
        await h.catalog.registerProfile(alice, scope, content('route', 'c1', { v: 1 })),
      )
      const fault = profileConflictWindow({ model_profile_configuration: 1, model_profile: 1 })
      const original = h.storage.write.bind(h.storage)
      const write = vi
        .spyOn(h.storage, 'write')
        .mockImplementation(fn => original(tx => fn({ ...tx, db: tx.db.withPlugin(fault.plugin) })))
      restore = () => {
        write.mockRestore()
      }
      expect(
        await h.catalog.registerProfile(alice, scope, content('route', 'c1', { v: 2 })),
      ).toEqual({
        failure: 'invalidInput',
        reason: 'malformed',
      })
      expect(fault.trace.filter(x => x === 'read:model_profile_configuration')).toHaveLength(2)
      expect(fault.trace).toContain('insert:model_profile')
      write.mockRestore()
      expect(await h.read.readProfile(alice, first.ref)).toEqual(first)
      const history = await h.storage.read(tx =>
        tx.db.selectFrom('model_profile_configuration').selectAll().execute(),
      )
      expect(history).toHaveLength(1)
      expect(history[0]?.values_json).toBe('{"v":1}')
    } finally {
      restore()
      await h.close()
    }
  })

  for (const mode of ['missing-raced-row', 'other-constraint', 'unavailable', 'unknown'] as const) {
    it(`keeps the original failure category and leaves no profile or history: ${mode}`, async () => {
      const h = await setup(`insert-failure-${mode}`)
      let restore: () => void = () => {}
      try {
        const error =
          mode === 'missing-raced-row'
            ? new UniqueViolation('model_profile_pkey')
            : mode === 'other-constraint'
              ? new UniqueViolation('unrelated-private-constraint')
              : mode === 'unavailable'
                ? new StorageUnavailable('private dynamic detail')
                : new Error('private dynamic detail')
        const fault = profileConflictWindow({}, error)
        const original = h.storage.write.bind(h.storage)
        const write = vi
          .spyOn(h.storage, 'write')
          .mockImplementation(fn =>
            original(tx => fn({ ...tx, db: tx.db.withPlugin(fault.plugin) })),
          )
        restore = () => {
          write.mockRestore()
        }
        const work = h.catalog.registerProfile(alice, scope, content())
        if (mode === 'unavailable') expect(await work).toEqual({ failure: 'unavailable' })
        else {
          const caught: unknown = await work.catch((e: unknown) => e)
          expect(caught).toBeInstanceOf(
            mode === 'missing-raced-row'
              ? StorageDefect
              : mode === 'other-constraint'
                ? UniqueViolation
                : Error,
          )
          if (!(caught instanceof Error)) throw new Error('expected classified failure')
          expect(caught.message).not.toContain('private')
          if (caught instanceof UniqueViolation) expect(caught.constraint).toBe('unrecognized')
        }
        expect(fault.trace).toContain('insert:model_profile')
        write.mockRestore()
        const rows = await h.storage.read(tx =>
          tx.db.selectFrom('model_profile').selectAll().execute(),
        )
        const histories = await h.storage.read(tx =>
          tx.db.selectFrom('model_profile_configuration').selectAll().execute(),
        )
        expect(rows).toEqual([])
        expect(histories).toEqual([])
      } finally {
        restore()
        await h.close()
      }
    })
  }
})
