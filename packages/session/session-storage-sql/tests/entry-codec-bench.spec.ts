// The speed of the `sl_entry` text codec on a fixed session (tests/fixtures/session-scenario.ts,
// 30 turns, 541 entries), over one migrated node:sqlite database in memory. Four measures, each run
// many times after a warm-up; the mean, the median and the 95th percentile are printed as one JSON line
// (`entry-codec-bench`) so that two trees can be compared by running this file in each:
//
// - write: the text of one entry and its INSERT, per entry;
// - decode: the entry of one stored text, per entry;
// - index: the Session rows of the history index built from nothing (a fresh module instance);
// - pages: `session.history` read forward to the end in 256 KiB pages, with the port-side decode.
//
// The file asserts only that each measure did its work; a time bound here would be a flaky test.
// The comparison against a baseline is the reader's, with both trees on one machine.
// @module-tag slow
// Why slow: heavy CPU, several thousand timed repetitions.
import { describe, expect, it, vi } from 'vitest'
import type { SessionInputScope, WorkSnapshot } from '@omne-harness/session-contract'
import historyHandler from '../src/worker/read-history.ts'
import { entryOfText, pageEntries, storedText } from './fixtures/entry-text.ts'
import { packText, unpacked } from './fixtures/packed.ts'
import { scenarioEntries } from './fixtures/session-scenario.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const TURNS = 30
const RUNS = 25
const WARM = 5

type Db = ReturnType<typeof migratedPort>['port']

const quantile = (values: readonly number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number
}
const stats = (values: readonly number[]) => ({
  mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)),
  median: Number(quantile(values, 0.5).toFixed(4)),
  p95: Number(quantile(values, 0.95).toFixed(4)),
  n: values.length,
})

const INSERT =
  'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)'

/** Writes the scenario into `db`; the time of each entry (text and INSERT) in microseconds. */
function writeAll(db: Db, session: string, entries: readonly Record<string, unknown>[]): number[] {
  const times: number[] = []
  for (const entry of entries) {
    const start = performance.now()
    const body = storedText(entry)
    db.execute(INSERT, [
      't',
      session,
      BigInt(entry['id'] as string),
      BigInt(entry['revision'] as string),
      entry['kind'] as string,
      packText(body),
      BigInt(Buffer.byteLength(body)),
    ])
    times.push((performance.now() - start) * 1000)
  }
  const last = entries[entries.length - 1] as Record<string, unknown>
  db.execute(
    'INSERT OR REPLACE INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
    ['t', session, BigInt(last['revision'] as string), 1n, 'epoch:0'],
  )
  return times
}

const snapshotOf = (session: string) =>
  ({ tenant: 't', session, revision: '1' }) as unknown as WorkSnapshot
const scope = { kind: 'pending', inputs: [] } as unknown as SessionInputScope

/** Reads the session forward to its end; the number of entries decoded. */
function readPages(db: Db, session: string): number {
  let input: Record<string, unknown> = {
    tenant: 't',
    session,
    mode: 'begin',
    kinds: [],
    direction: 'forward',
    from: null,
    edge: null,
    upper: null,
    pageBytes: 256 * 1024,
  }
  let count = 0
  for (;;) {
    const outcome = historyHandler.read(input as never, db as never)
    if (outcome.kind !== 'read') throw new Error('the history read failed')
    const output = outcome.output as Record<string, unknown>
    count += pageEntries(output).length
    const next = output['next'] as { edge: string; upper: string } | null
    if (next === null) return count
    input = { ...input, mode: 'next', edge: next.edge, upper: next.upper }
  }
}

describe('entry-codec-bench', () => {
  it('measures write, decode, index build and paging on the fixed session', async () => {
    const entries = scenarioEntries(TURNS)
    const write: number[] = []
    const decode: number[] = []
    const index: number[] = []
    const pages: number[] = []
    let bytes = 0
    const { port: db } = migratedPort()
    for (let run = 0; run < WARM + RUNS; run += 1) {
      const session = `s-${run}`
      const times = writeAll(db, session, entries)
      if (run >= WARM) write.push(...times)
      const texts = db
        .execute(
          'SELECT entry, bytes FROM sl_entry WHERE tenant = ? AND session = ? ORDER BY position LIMIT 100000',
          ['t', session],
        )
        .rows.map(row => {
          if (run === 0) bytes += Number(row[1])
          return unpacked(row[0])
        })
      for (const text of texts) {
        const start = performance.now()
        const entry = entryOfText(text)
        const spent = (performance.now() - start) * 1000
        if (run >= WARM) decode.push(spent)
        expect(entry.kind).toBeTypeOf('string')
      }
      vi.resetModules()
      const fresh = await import('../src/worker/history-index.ts')
      const built = performance.now()
      const answer = fresh.readHistory(db as never, 't', session, snapshotOf(session), scope)
      const spent = performance.now() - built
      if (run >= WARM) index.push(spent)
      expect(answer).not.toBe('too-many')
      const paged = performance.now()
      const count = readPages(db, session)
      if (run >= WARM) pages.push(performance.now() - paged)
      expect(count).toBe(entries.length)
    }
    const result = {
      bench: 'entry-codec-bench',
      entries: entries.length,
      storedBytes: bytes,
      writeMicrosPerEntry: stats(write),
      decodeMicrosPerEntry: stats(decode),
      indexBuildMillis: stats(index),
      pagesMillis: stats(pages),
    }
    console.log(JSON.stringify(result))
  })
})
