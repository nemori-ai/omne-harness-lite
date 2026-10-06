import { expect, test, vi } from 'vitest'
import { appendFile } from 'node:fs/promises'
import * as resident from '../src/resident.ts'
import { openJsonlSessionLog } from '../src/index.ts'
import { root, entry, session, processOwnership, unfenced, unconditional } from './support.ts'

test.each([16, 128, 1024])(
  'actual warmed JSONL reads select an empty or bounded suffix across %i batches',
  { tags: ['slow'] },
  async count => {
    // Slow: creates and syncs real files. The probe counts actual resident index-row accesses.
    const log = await openJsonlSessionLog({ dir: await root(), processOwnership })
    const original = resident.rowsSince
    let accesses = 0
    const probe = vi.spyOn(resident, 'rowsSince').mockImplementation((value, after) => {
      const rows = new Proxy(value.rows, {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) accesses++
          return Reflect.get(target, key, receiver)
        },
      })
      return original({ ...value, rows }, after)
    })
    try {
      for (let i = 0; i < count; i++)
        expect(
          await log.append(session(), [entry(`cost-${i}`)], unfenced, unconditional),
        ).not.toHaveProperty('failure')
      accesses = 0
      expect(await log.readSince(session(), count)).toEqual({ entries: [], tail: count })
      expect(accesses).toBe(0)
      accesses = 0
      const delta = await log.readSince(session(), count - 1)
      expect(delta).toMatchObject({
        tail: count,
        entries: [{ position: count, dedupeKey: `cost-${count - 1}` }],
      })
      if ('failure' in delta) throw new Error('actual suffix read failed')
      expect(delta.entries).toHaveLength(1)
      expect(accesses).toBeGreaterThan(0)
      expect(accesses).toBeLessThanOrEqual(Math.ceil(Math.log2(count)) + 1)
      if (process.env.OMNE_CONTEXT_COST_REPORT)
        await appendFile(
          process.env.OMNE_CONTEXT_COST_REPORT,
          JSON.stringify({
            component: 'jsonl-resident',
            history: count,
            warmIndexAccesses: 0,
            deltaIndexAccesses: accesses,
            deltaRows: delta.entries.length,
            deltaBytes: Buffer.byteLength(JSON.stringify(delta.entries)),
          }) + '\n',
          { mode: 0o600 },
        )
    } finally {
      probe.mockRestore()
      await log.close()
    }
  },
)
