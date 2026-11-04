// @module-tag slow
// Slow tier: it times thousands of encodings and decodings of each representative entry (heavy CPU,
// several seconds), so the fast tier does not run it.
//
// The cost of the revision 4 stored form (SPEC「条目的存储形式」, R2-D357, R2-D353): per entry, the
// encode time, the decode time with the reference targets already in memory, and the expansion of a
// history page that holds references. It prints one JSON table (median and p95 in microseconds, and
// the plain JSON bytes of each payload) so a later run can be compared with the figures recorded at
// adoption. The assertions guard the relative claim inside one run: resolving a reference never
// costs more than decoding the full value it stands for.
import { describe, expect, it } from 'vitest'
import { decodeEntry, encodeEntry, fromJsonValue, toJsonValue } from '../src/entries.ts'
import * as entries from '../src/entries.ts'
import type { HistoryEntry } from '../src/faces.ts'
import { INITIAL_ADOPTION, RESIDENTS, SAMPLES } from './storage-form-fixture.ts'

const BATCH = 10
const ROUNDS = 400
const WARMUP = 200

/** Median and p95 of one operation, in microseconds, over ROUNDS batches of BATCH calls. */
function timed(run: () => unknown): Readonly<{ median: number; p95: number }> {
  for (let i = 0; i < WARMUP; i++) run()
  const samples: number[] = []
  for (let round = 0; round < ROUNDS; round++) {
    const start = process.hrtime.bigint()
    for (let i = 0; i < BATCH; i++) run()
    samples.push(Number(process.hrtime.bigint() - start) / 1000 / BATCH)
  }
  samples.sort((a, b) => a - b)
  const at = (q: number) =>
    Number(samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]!.toFixed(2))
  return { median: at(0.5), p95: at(0.95) }
}

const refs = { created: INITIAL_ADOPTION, residents: RESIDENTS }
const plainBytes = (payload: HistoryEntry['payload']): number =>
  Buffer.byteLength(JSON.stringify(fromJsonValue(payload)), 'utf8')

describe('the stored form of revision 4 costs no more than the full form', () => {
  it('times encode, decode and page expansion of each representative entry', () => {
    const encode = encodeEntry as (...args: unknown[]) => ReturnType<typeof encodeEntry>
    const decode = decodeEntry as (...args: unknown[]) => ReturnType<typeof decodeEntry>
    const rows = SAMPLES.map(sample => ({
      id: `e-${sample.name}`,
      revision: '1',
      ...encode(sample.entry, sample.origin, refs),
    })) as HistoryEntry[]
    const table = SAMPLES.map((sample, index) => {
      const row = rows[index]!
      const decoded = decode(row, refs)
      expect('ok' in (decoded as object)).toBe(true)
      return {
        entry: sample.name,
        plainBytes: plainBytes(row.payload),
        storedBytes: Buffer.byteLength(JSON.stringify(row), 'utf8'),
        encode: timed(() => encode(sample.entry, sample.origin, refs)),
        decode: timed(() => decode(row, refs)),
        // The full form as revision 3 stored it: the codec of the whole plain payload.
        fullCodec: timed(() => fromJsonValue(toJsonValue(sample.entry))),
      }
    })
    const expand = (entries as Record<string, unknown>)['expandHistoryEntries'] as
      | ((rows: readonly HistoryEntry[], created: unknown) => readonly HistoryEntry[])
      | undefined
    const page =
      expand === undefined
        ? null
        : {
            withReferences: timed(() => expand(rows, INITIAL_ADOPTION)),
            withoutReferences: timed(() => expand(rows.slice(-1), INITIAL_ADOPTION)),
          }
    console.log(`STORAGE-FORM ${JSON.stringify({ table, page }, null, 1)}`)
    for (const line of table)
      expect(line.decode.median, line.entry).toBeLessThanOrEqual(line.fullCodec.median * 1.05)
  })
})
