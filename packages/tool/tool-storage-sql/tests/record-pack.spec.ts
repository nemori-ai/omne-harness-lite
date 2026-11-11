// A ledger record is stored in the packed text form of sql-contract §10.1: a short record keeps
// marker 0, a long one is compressed under marker 1, and both read back as they were written.
import { afterEach, describe, expect, it } from 'vitest'
import type { LedgerDomain, LedgerRecord } from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { domainNameOf, openApp, TENANT_A, textOf, type App } from './fixtures/app.ts'

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

function decoded<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error('fixture identity is not legal')
  return answer.ok
}

const domain: LedgerDomain = {
  kind: 'call',
  tenant: TENANT_A,
  call: decoded(decodeToolCallId('packed')),
}
const record = (key: string, value: unknown): LedgerRecord => ({
  kind: 'host',
  host: { key, value },
})

function storedRecords(app: App): Map<string, Uint8Array> {
  const rows = app.sqlite.inspect(
    domainNameOf(TENANT_A),
    'SELECT key, record FROM tl_record WHERE tenant = ? ORDER BY key',
    [textOf(TENANT_A)],
  )
  return new Map(rows.map(row => [String(row['key']), row['record'] as Uint8Array]))
}

describe('the stored form of a ledger record', () => {
  it('keeps a short record as text, compresses a long one, and reads both back unchanged', async () => {
    const app = await openApp()
    opened.push(app)
    const short = record('short', 1)
    const long = record('long', 'a long value '.repeat(200))
    expect(
      await app.store.commit({
        domain,
        expected: decoded(decodeToolRevision('0')),
        revision: decoded(decodeToolRevision('1')),
        writes: [
          { kind: 'put', record: short },
          { kind: 'put', record: long },
        ],
      }),
    ).toEqual({ kind: 'committed' })

    const stored = storedRecords(app)
    const shortBytes = stored.get('host:short')
    const longBytes = stored.get('host:long')
    if (shortBytes === undefined || longBytes === undefined) throw new Error('a record is missing')
    expect(shortBytes[0]).toBe(0)
    expect(Buffer.byteLength(unpackText(shortBytes), 'utf8')).toBeLessThan(128)
    expect(longBytes[0]).toBe(1)
    expect(longBytes.byteLength).toBeLessThan(Buffer.byteLength(unpackText(longBytes), 'utf8'))

    const read = await app.store.read(domain)
    expect(read).toEqual({ kind: 'complete', revision: '1', records: [long, short] })
    expect(await app.store.readRecord(domain, 'host:long')).toEqual({
      kind: 'complete',
      revision: '1',
      record: long,
    })
  })
})
