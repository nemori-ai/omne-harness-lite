// The large text columns of this member hold the packed text form of sql-contract §10.1: a value
// below 128 UTF-8 bytes keeps marker 0, a longer one is compressed under marker 1. That the reads
// give the committed values back is what the rest of this suite checks over the same rows.
import { describe, expect, it } from 'vitest'
import { app, TENANT_A } from './fixtures/app.ts'
import { unpacked } from './fixtures/packed.ts'

const SESSION = 'session-1'
const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

const COLUMNS = [
  ['sl_entry', 'entry'],
  ['sl_operation', 'receipt'],
  ['sl_operation', 'result'],
  ['sl_state_item', 'value'],
] as const

describe('the packed columns of the session log', () => {
  it('hold every value in the packed form, compressed from 128 UTF-8 bytes on', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    ok(await a.accept(TENANT_A, SESSION, 'x'.repeat(400)))
    const markers = new Set<number>()
    for (const [table, column] of COLUMNS) {
      const cells = a.provider.select('dom_0', `SELECT ${column} FROM ${table}`).rows
      expect(cells.length, `${table}.${column}`).toBeGreaterThan(0)
      for (const [cell] of cells) {
        const text = unpacked(cell)
        const marker = (cell as Uint8Array)[0] ?? -1
        expect(marker, `${table}.${column}`).toBe(Buffer.byteLength(text) < 128 ? 0 : 1)
        markers.add(marker)
      }
    }
    expect(markers.has(1)).toBe(true)
  })
})
