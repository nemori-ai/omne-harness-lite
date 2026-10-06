// @module-tag slow
// Three history sizes use actual synced JSONL batches and SQLite queries.
import { performance } from 'node:perf_hooks'
import { appendFile } from 'node:fs/promises'
import { expect, test } from 'vitest'
import type { KyselyPlugin } from 'kysely'
import { createRuntimeContext } from '../src/index.ts'
import { host, init, reader, scope, at } from './fixture.ts'

for (const history of [16, 128, 1024])
  test(
    `fixed current key costs across ${history} unrelated history batches`,
    { tags: ['slow'] },
    async () => {
      let queries = 0,
        entryRows = 0,
        sqlBytes = 0
      const probe: KyselyPlugin = {
        transformQuery({ node }) {
          queries++
          return node
        },
        async transformResult({ result }) {
          sqlBytes += Buffer.byteLength(JSON.stringify(result.rows))
          if (result.rows.some(row => Object.hasOwn(row, 'registration')))
            entryRows += result.rows.length
          return result
        },
      }
      const h = await host(undefined, physical => ({
        read: fn => physical.read(tx => fn({ ...tx, db: tx.db.withPlugin(probe) })),
        write: fn => physical.write(tx => fn({ ...tx, db: tx.db.withPlugin(probe) })),
      }))
      const costs: Record<string, unknown> = {}
      async function measure(name: string, action: () => Promise<unknown>) {
        queries = 0
        entryRows = 0
        sqlBytes = 0
        h.observedLog.readSince.mockClear()
        const started = performance.now(),
          result = await action()
        const reads = await Promise.all(
          h.observedLog.readSince.mock.results.map(item => item.value),
        )
        const logRows = reads.reduce(
          (count, read) => count + ('failure' in read ? 0 : read.entries.length),
          0,
        )
        const logBytes = reads.reduce(
          (bytes, read) =>
            bytes + ('failure' in read ? 0 : Buffer.byteLength(JSON.stringify(read.entries))),
          0,
        )
        costs[name] = {
          queries,
          entryRows,
          sqlBytes,
          logReads: reads.length,
          logRows,
          logBytes,
          milliseconds: Number((performance.now() - started).toFixed(3)),
        }
        return { result, logRows, entryRows }
      }
      async function append() {
        expect(
          await h.log.append(
            scope.session,
            [{ tenant: scope.tenant, readKeys: [], payload: { kind: 'bookkeeping' } }],
            { kind: 'unfenced' },
            { kind: 'unconditional' },
          ),
        ).not.toHaveProperty('failure')
      }
      try {
        await init(h)
        const selected = await reader(h)
        const original = await selected.read(['identity'])
        for (let i = 0; i < history; i++) await append()
        const delta = await measure('catchUp', () => selected.read(['identity']))
        expect(delta.result).toEqual(original)
        expect(delta.logRows).toBe(history)
        const warm = await measure('warm', () => selected.read(['identity']))
        expect(warm.result).toEqual(original)
        expect(warm.logRows).toBe(0)
        expect(warm.entryRows).toBe(2)
        await append()
        const suffix = await measure('oneNewRow', () => selected.read(['identity']))
        expect(suffix.result).toEqual(original)
        expect(suffix.logRows).toBe(1)
        expect(suffix.entryRows).toBe(2)
        await measure('list', () => h.owner.operations.registrations(h.access, scope))
        h.owner.closeAdmission()
        await h.owner.drain()
        const next = createRuntimeContext({
          log: h.observedLog,
          storage: {
            read: fn => h.storage.read(tx => fn({ ...tx, db: tx.db.withPlugin(probe) })),
            write: fn => h.storage.write(tx => fn({ ...tx, db: tx.db.withPlugin(probe) })),
          },
          access: h.auth.operations,
          now: () => at,
        })
        next.sources.registerSource({
          name: 'session',
          recovery: 'persisted',
          consumers: ['model', 'tool', 'extension'],
          requiredKeys: ['identity'],
          read: async () => ({ kind: 'values', values: [] }),
        })
        try {
          const bound = await next.operations.bind(h.tool, scope, 'tool')
          if (bound.kind !== 'bound') throw new Error('cost reader not bound')
          const cold = await measure('coldOwner', () => bound.reader.read(['identity']))
          expect(cold.result).toEqual(original)
          expect(cold.logRows).toBe(history + 2)
        } finally {
          next.closeAdmission()
          await next.drain()
        }
        if (process.env.OMNE_CONTEXT_COST_REPORT)
          await appendFile(
            process.env.OMNE_CONTEXT_COST_REPORT,
            JSON.stringify({
              history,
              currentKeys: 1,
              source: 'persisted, no callback work',
              costs,
            }) + '\n',
            { mode: 0o600 },
          )
      } finally {
        await h.close()
      }
    },
  )
