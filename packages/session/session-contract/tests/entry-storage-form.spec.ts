// @module-tag slow
import { describe, expect, it } from 'vitest'
import { decodeEntry, encodeEntry, fromJsonValue, toJsonValue } from '../src/entries.ts'
import * as entries from '../src/entries.ts'
import type { HistoryEntry } from '../src/faces.ts'
import { INITIAL_ADOPTION, RESIDENTS, SAMPLES } from './storage-form-fixture.ts'

const BATCH = 10
const ROUNDS = 400
const WARMUP = 200

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
