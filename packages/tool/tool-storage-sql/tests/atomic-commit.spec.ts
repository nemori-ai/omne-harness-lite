// A6: one ledger commit is one SQL commit. A statement that fails half way rolls back every write
// of the commit, and a revision conflict writes nothing; the database is checked directly, not only
// through the port.
import { afterEach, describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { LedgerDomain, LedgerRecord } from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { domainNameOf, openApp, TENANT_A, textOf, type App } from './fixtures/app.ts'

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function app(): Promise<App> {
  const created = await openApp()
  opened.push(created)
  return created
}

function decoded<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error('fixture identity is not legal')
  return answer.ok
}

const revision = (text: string) => decoded(decodeToolRevision(text))
const domain: LedgerDomain = {
  kind: 'call',
  tenant: TENANT_A,
  call: decoded(decodeToolCallId('call-1')),
}
const host = (key: string): LedgerRecord<ContentBlock> => ({
  kind: 'host',
  host: { key, value: key },
})
const puts = (...keys: string[]) => keys.map(key => ({ kind: 'put' as const, record: host(key) }))

function rows(a: App) {
  const name = domainNameOf(TENANT_A)
  const tenant = textOf(TENANT_A)
  return {
    records: a.sqlite.inspect(name, 'SELECT key FROM tl_record WHERE tenant = ? ORDER BY key', [
      tenant,
    ]),
    domains: a.sqlite.inspect(name, 'SELECT revision FROM tl_domain WHERE tenant = ?', [tenant]),
  }
}

describe('a commit that fails half way', () => {
  it('leaves no write of it in the database', async () => {
    const a = await app()
    // Statement 1 reads the revision, statement 2 writes `a`, statement 3 (writing `b`) fails.
    a.sqlite.failStatement(3)
    const answer = await a.store.commit({
      domain,
      expected: revision('0'),
      revision: revision('1'),
      writes: puts('a', 'b', 'c'),
    })
    expect(answer.kind).toBe('unavailable')
    expect(rows(a)).toEqual({ records: [], domains: [] })
    expect(await a.store.read(domain)).toEqual({ kind: 'complete', revision: '0', records: [] })
  })
})

describe('a commit whose expected revision is not the current one', () => {
  it('answers conflict with the current revision and writes nothing', async () => {
    const a = await app()
    expect(
      await a.store.commit({
        domain,
        expected: revision('0'),
        revision: revision('1'),
        writes: puts('a'),
      }),
    ).toEqual({ kind: 'committed' })
    const before = rows(a)
    expect(
      await a.store.commit({
        domain,
        expected: revision('0'),
        revision: revision('2'),
        writes: puts('b'),
      }),
    ).toEqual({ kind: 'conflict', current: '1' })
    expect(rows(a)).toEqual(before)
    expect(before).toEqual({ records: [{ key: 'host:a' }], domains: [{ revision: '1' }] })
  })
})
