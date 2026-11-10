// A4: tenant isolation. Each tenant reaches only the transaction domain the published directory
// names for it, and inside a domain every statement filters on the tenant, so rows of another tenant
// planted in the same database (a corrupt or mixed store) are never read, recalled or overwritten.
// A tenant the directory does not hold is not read and not written.
import { afterEach, describe, expect, it } from 'vitest'

import type { LedgerDomain, LedgerRecord } from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type DurableEvidence,
} from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import type { TenantId } from '@omne-harness/legal-identity'
import { packText } from '@omne-harness/sql-contract/worker'
import { createSqlToolLedgerStore } from '../src/index.ts'
import { domainRef } from './fixtures/sqlite-storage.ts'
import {
  domainNameOf,
  openApp,
  TENANT_A,
  TENANT_B,
  textOf,
  UNREGISTERED,
  type App,
} from './fixtures/app.ts'

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
const callDomain = (tenant: TenantId): LedgerDomain => ({
  kind: 'call',
  tenant,
  call: decoded(decodeToolCallId('shared')),
})
const record = (value: unknown): LedgerRecord => ({
  kind: 'host',
  host: { key: 'same', value },
})
const codec = { owner: 'test', name: 'bytes', revision: '1', digest: 'sha256:bytes' }
const source: DurableEvidence = {
  owner: 'test',
  record: 'final',
  revision: '1',
  digest: 'sha256:final',
}
const mutation = (tenant: TenantId) => ({
  principal: 'tester',
  tenant,
  call: decoded(decodeToolCallId('shared')),
  operation: decoded(decodeToolOperationId('preserve-1')),
})
const bytesOf = (text: string) => new TextEncoder().encode(text)

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer)
    throw new Error(`expected success, got ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

const commit = (a: App, tenant: TenantId, value: unknown) =>
  a.store.commit({
    domain: callDomain(tenant),
    expected: revision('0'),
    revision: revision('1'),
    writes: [{ kind: 'put', record: record(value) }],
  })

describe('two tenants that use the same call key', () => {
  it('each ledger domain holds only the records and revision of its own tenant', async () => {
    const a = await app()
    expect(await commit(a, TENANT_A, 'of A')).toEqual({ kind: 'committed' })
    expect(await a.store.read(callDomain(TENANT_B))).toEqual({
      kind: 'complete',
      revision: '0',
      records: [],
    })
    expect(await commit(a, TENANT_B, 'of B')).toEqual({ kind: 'committed' })
    expect(await a.store.read(callDomain(TENANT_A))).toEqual({
      kind: 'complete',
      revision: '1',
      records: [record('of A')],
    })
  })
})

describe('rows of tenant B planted in the database of tenant A', () => {
  async function planted(): Promise<App> {
    const a = await app()
    const b = textOf(TENANT_B)
    const domain = domainNameOf(TENANT_A)
    a.sqlite.inspect(
      domain,
      'INSERT INTO tl_domain (tenant, kind, name, revision) VALUES (?, ?, ?, ?)',
      [b, 'call', 'shared', '5'],
    )
    a.sqlite.inspect(
      domain,
      'INSERT INTO tl_record (tenant, kind, name, key, record) VALUES (?, ?, ?, ?, ?)',
      [b, 'call', 'shared', 'host:same', packText(JSON.stringify(record('of B')))],
    )
    return a
  }

  it('a domain read of tenant A sees nothing of them', async () => {
    const a = await planted()
    expect(await a.store.read(callDomain(TENANT_A))).toEqual({
      kind: 'complete',
      revision: '0',
      records: [],
    })
  })

  it('a single-record read of tenant A ignores another tenant at the same key', async () => {
    const a = await planted()
    expect(await a.store.readRecord(callDomain(TENANT_A), 'host:same')).toEqual({
      kind: 'complete',
      revision: '0',
      record: null,
    })
    expect(await commit(a, TENANT_A, 'of A')).toEqual({ kind: 'committed' })
    expect(await a.store.readRecord(callDomain(TENANT_A), 'host:same')).toEqual({
      kind: 'complete',
      revision: '1',
      record: record('of A'),
    })
  })

  it('a commit of tenant A is judged on its own revision and does not touch them', async () => {
    const a = await planted()
    expect(await commit(a, TENANT_A, 'of A')).toEqual({ kind: 'committed' })
    const rows = a.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT revision FROM tl_domain WHERE tenant = ? AND kind = 'call' AND name = 'shared'",
      [textOf(TENANT_B)],
    )
    expect(rows).toEqual([{ revision: '5' }])
  })
})

describe('a tenant that the directory does not hold', () => {
  it('is neither read nor written', async () => {
    const a = await app()
    const domain = callDomain(UNREGISTERED)
    expect((await a.store.read(domain)).kind).toBe('unavailable')
    expect((await a.store.readRecord(domain, 'host:same')).kind).toBe('unavailable')
    expect(
      (
        await a.store.commit({
          domain,
          expected: revision('0'),
          revision: revision('1'),
          writes: [{ kind: 'put', record: record('x') }],
        })
      ).kind,
    ).toBe('unavailable')
    expect(a.faults.commits()).toBe(0)
  })
})

describe('a directory that answers the scope of another tenant', () => {
  it('leaves the tenant unavailable and writes nothing', async () => {
    const a = await app()
    const foreign = domainRef(textOf(TENANT_B), domainNameOf(TENANT_B))
    const store = createSqlToolLedgerStore({
      ...a.options,
      domains: { lookup: () => Promise.resolve({ kind: 'ready', domain: foreign }) },
    })
    expect((await store.read(callDomain(TENANT_A))).kind).toBe('unavailable')
    expect(
      (
        await store.commit({
          domain: callDomain(TENANT_A),
          expected: revision('0'),
          revision: revision('1'),
          writes: [{ kind: 'put', record: record('x') }],
        })
      ).kind,
    ).toBe('unavailable')
    expect(a.faults.commits()).toBe(0)
  })
})
