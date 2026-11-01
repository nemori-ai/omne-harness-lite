// A4: tenant isolation. Each tenant reaches only the transaction domain the published directory
// names for it, and inside a domain every statement filters on the tenant, so rows of another tenant
// planted in the same database (a corrupt or mixed store) are never read, recalled or overwritten.
// A tenant the directory does not hold is not read and not written.
import { afterEach, describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { LedgerDomain, LedgerRecord } from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type DurableEvidence,
} from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import type { TenantId } from '@omne-harness/legal-identity'
import { createSqlToolOutputCustody } from '../src/index.ts'
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
const record = (value: unknown): LedgerRecord<ContentBlock> => ({
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

  it('the custody of one tenant is invisible to the other, and the same operation is its own', async () => {
    const a = await app()
    const custody = createSqlToolOutputCustody<string>(a.custodyOptions())
    const raw = ok(
      await custody.preserve({ ...mutation(TENANT_A), codec, bytes: bytesOf('A'), source }),
    )
    expect(ok(await custody.inspect(mutation(TENANT_B)))).toEqual({ kind: 'unknown' })
    const foreign = ok(
      await custody.preserve({
        ...mutation(TENANT_B),
        codec,
        bytes: bytesOf('B, other bytes'),
        source,
      }),
    )
    expect(foreign).not.toEqual(raw)
    expect(ok(await custody.inspect(mutation(TENANT_A)))).toEqual({ kind: 'retained', raw })
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
      [b, 'call', 'shared', 'host:same', JSON.stringify(record('of B'))],
    )
    a.sqlite.inspect(
      domain,
      `INSERT INTO tl_manifest (tenant, call, operation, kind, digest, bytes, chunks, sha256, seal, answer)
       VALUES (?, 'shared', 'preserve-1', 'raw', 'planted', 1, 1, 'planted', 'planted', '{}')`,
      [b],
    )
    a.sqlite.inspect(
      domain,
      "INSERT INTO tl_chunk (tenant, call, operation, idx, data) VALUES (?, 'shared', 'preserve-1', 0, x'42')",
      [b],
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

  it('inspect of tenant A answers as for an operation never preserved, and its preserve is its own', async () => {
    const a = await planted()
    const custody = createSqlToolOutputCustody<string>(a.custodyOptions())
    expect(ok(await custody.inspect(mutation(TENANT_A)))).toEqual({ kind: 'unknown' })
    const raw = ok(
      await custody.preserve({ ...mutation(TENANT_A), codec, bytes: bytesOf('A'), source }),
    )
    expect(raw.content.bytes).toBe('1')
    expect(ok(await custody.inspect(mutation(TENANT_A)))).toEqual({ kind: 'retained', raw })
  })
})

describe('a tenant that the directory does not hold', () => {
  it('is neither read nor written', async () => {
    const a = await app()
    const domain = callDomain(UNREGISTERED)
    expect((await a.store.read(domain)).kind).toBe('unavailable')
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
    const custody = createSqlToolOutputCustody<string>(a.custodyOptions())
    const answer = await custody.preserve({
      ...mutation(UNREGISTERED),
      codec,
      bytes: bytesOf('x'),
      source,
    })
    expect('failure' in answer && answer.failure.kind).toBe('unavailable')
    expect(a.faults.commits()).toBe(0)
  })
})
