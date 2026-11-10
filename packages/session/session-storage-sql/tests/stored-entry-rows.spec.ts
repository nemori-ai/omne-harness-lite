// The `sl_entry` rows through the port (src/entry-codec.ts): a committed row holds the codec text
// in the packed text form of sql-contract §10.1 and its true UTF-8 size in `bytes`; a row the codec cannot read, such as a row of the retired
// value-tree encoding, answers `unavailable` with its diagnostic on the read and on the commit that
// reads it, and is never read as a plain payload.
import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import { encodeValue } from '../src/codec.ts'
import { readEntryText } from '../src/entry-codec.ts'
import { app, TENANT_A, textOf, type App } from './fixtures/app.ts'
import { packText, unpacked } from './fixtures/packed.ts'

const SESSION = 'session-1'
const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): Record<string, unknown> => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: Record<string, unknown> }).failure
}

/** The rows of the session: position, kind, the stored text, its size and its format marker. */
const rows = (a: App) =>
  (
    a.provider.select(
      'dom_0',
      'SELECT position, kind, entry, bytes FROM sl_entry WHERE tenant = ? AND session = ? ORDER BY position',
      [textOf(TENANT_A), SESSION],
    ).rows as unknown as [bigint, string, Uint8Array, bigint][]
  ).map(
    ([position, kind, entry, bytes]) => [position, kind, unpacked(entry), bytes, entry[0]] as const,
  )

const begin = (a: App) =>
  a.port.history.begin({
    ...a.access(TENANT_A),
    kinds: [],
    from: null,
    direction: 'forward',
    pageBytes: 1 << 20,
  })

/** Rewrites the row of `kind` into the retired encoding: the whole entry as `encodeValue` JSON. */
function retire(a: App, kind: string): bigint {
  const row = rows(a).find(item => item[1] === kind)
  if (row === undefined) throw new Error(`no ${kind} row`)
  const entry: HistoryEntry = readEntryText(row[2])
  const text = JSON.stringify(encodeValue(entry))
  a.provider.seed(
    'dom_0',
    'UPDATE sl_entry SET entry = ?, bytes = ? WHERE tenant = ? AND session = ? AND position = ?',
    [packText(text), BigInt(Buffer.byteLength(text)), textOf(TENANT_A), SESSION, row[0]],
  )
  return row[0]
}

describe('committed rows', () => {
  it('hold the codec text, packed from 128 UTF-8 bytes on, and its UTF-8 size; the history page reads them back', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-é'))
    const stored = rows(a)
    expect(stored.length).toBeGreaterThan(1)
    for (const [, , text, size, marker] of stored) {
      expect(size).toBe(BigInt(Buffer.byteLength(text)))
      expect(marker).toBe(Buffer.byteLength(text) < 128 ? 0 : 1)
      expect(JSON.parse(text)).toHaveProperty('body')
    }
    expect(stored.some(row => row[4] === 1)).toBe(true)
    const page = ok<{ entries: HistoryEntry[] }>(await begin(a))
    expect(page.entries).toEqual(stored.map(row => readEntryText(row[2])))
  })
})

describe('a row of the retired encoding', () => {
  it('makes the history read unavailable with the diagnostic', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    const position = retire(a, 'intake.routed')
    const failure = failureOf(await begin(a))
    expect(failure).toMatchObject({ kind: 'unavailable' })
    expect(String(failure['diagnostic'])).toMatch(/retired value-tree encoding/u)
    expect(position).toBeGreaterThan(0n)
  })

  it('makes the commit that reads it unavailable and writes nothing', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    const before = rows(a).length
    retire(a, 'intake.routed')
    const refused = await a.accept(TENANT_A, SESSION, 'input-2')
    expect(failureOf(refused)).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(refused)).toMatch(/retired value-tree encoding/u)
    expect(rows(a).length).toBe(before)
  })

  it('makes the binding read of the creating batch unavailable', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    retire(a, rows(a)[0]?.[1] as string)
    const read = await a.bindings.read({ tenant: TENANT_A, session: sessionId(SESSION) })
    expect(JSON.stringify(read)).toMatch(/retired value-tree encoding/u)
    expect(read).not.toHaveProperty('ok.kind', 'bound')
  })
})
