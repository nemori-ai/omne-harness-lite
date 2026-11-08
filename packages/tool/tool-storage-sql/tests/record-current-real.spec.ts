// Real SQLite Workers and original local source issuance. Identity authority is a fixture.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { canonicalDigest, recordKey } from '@omne-harness/tool'
import {
  createLocalInvocationSource,
  createLocalInvocationQualifier,
  type LocalInvocationSourceInput,
} from '@omne-harness/tool-host-local'
import { toolRecordCurrentFacts } from '../src/index.ts'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { openStorage } from './windows-composition/storage.ts'
import { TENANT_A, TENANT_B, textOf } from './fixtures/app.ts'
import { ledgerWorld } from './fixtures/ledger.ts'
import { forwardingFixture, ok } from '../../tool-host-local/tests/forwarding-values.ts'

type App = Awaited<ReturnType<typeof openStorage>>
const opened = new Set<App>()
const roots: string[] = []
afterEach(async () => {
  for (const app of opened) await app.close()
  opened.clear()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const participants = ['tool', 'tool-record-current']
const sourceDomain = { kind: 'host', tenant: TENANT_A, key: 'invocation-source' } as const
const markerDomain = { kind: 'host', tenant: TENANT_A, key: 'capture-fixture' } as const

async function open(root?: string) {
  if (root === undefined) {
    root = await realpath(await mkdtemp(join(tmpdir(), 'tool-record-current-')))
    roots.push(root)
  }
  const app = await openStorage(root, [TENANT_A], { participants })
  opened.add(app)
  return { app, root }
}
const sourceInput = (app: App): LocalInvocationSourceInput<string> => ({
  store: app.store,
  authority: {
    qualify: async () => ({ kind: 'allowed' }),
    samePrincipal: async ({ current, original }) =>
      current === original ? { kind: 'allowed' } : { kind: 'denied', reason: 'subject' },
  },
  principalCodec: {
    encode: value => value,
    decode: value => (typeof value === 'string' ? { ok: value } : { failure: { reason: 'shape' } }),
  },
  commitAttempts: 2,
})

async function issue(app: App, position = 'first') {
  const world = await ledgerWorld(TENANT_A)
  const { invocation: _invocation, ...original } = world.input.request
  const request = { ...original, consumer: { ...original.consumer, position } }
  const source = createLocalInvocationSource(sourceInput(app))
  const issued = await source.issuer.resolve({ principal: 'alice', tenant: TENANT_A, request })
  if (issued.kind !== 'bound') throw new Error(JSON.stringify(issued))
  const fixed = { ...request, invocation: issued.invocation }
  expect(
    await source.guard.verify({
      principal: 'alice',
      tenant: TENANT_A,
      call: issued.call,
      operation: issued.admission,
      request: fixed,
    }),
  ).toEqual({ kind: 'trusted' })
  const read = await app.store.read(sourceDomain)
  if (read.kind !== 'complete') throw new Error(read.diagnostic)
  const { owner, work, position: at, purpose } = request.consumer
  const key = `source:${JSON.stringify([owner, work, at, purpose])}`
  const record = read.records.find(row => row.kind === 'host' && row.host.key === key)
  if (record === undefined) throw new Error('Missing original source binding')
  const qualified = await createLocalInvocationQualifier(sourceInput(app)).qualify({
    principal: 'alice',
    tenant: TENANT_A,
    call: issued.call,
    admission: issued.admission,
    request: fixed,
  })
  if ('failure' in qualified) throw new Error(JSON.stringify(qualified))
  expect(qualified.ok.records).toEqual([
    { domain: sourceDomain, key: recordKey(record), digest: canonicalDigest(record) },
  ])
  const fact = toolRecordCurrentFacts({
    tenant: textOf(TENANT_A),
    records: qualified.ok.records.map(item => ({
      kind: item.domain.kind,
      name: item.domain.kind === 'call' ? item.domain.call : item.domain.key,
      key: item.key,
      digest: item.digest,
    })),
  })
  return {
    issued,
    record,
    fact,
    observation: {
      kind: 'host',
      name: sourceDomain.key,
      key: recordKey(record),
      digest: canonicalDigest(record),
    } as const,
  }
}

function guard(
  records: readonly { kind: string; name: string; key: string; digest: string }[],
  tenant = textOf(TENANT_A),
): FactCommandV2 {
  return { participant: 'tool-record-current', facts: { request: { tenant, records } } }
}
async function commit(app: App, commands: readonly FactCommandV2[], operationKey = randomUUID()) {
  const lookup = await app.domains.lookup({ tenant: textOf(TENANT_A) })
  if (lookup.kind !== 'ready') throw new Error('Missing tenant fixture')
  return app.storage.commit({
    ...app.combination,
    identity: { ...lookup.domain, operation: 'record-current', protocolVersion: '2', operationKey },
    commands,
  })
}
function marker(): FactCommandV2 {
  return {
    participant: 'tool',
    facts: {
      tenant: textOf(TENANT_A),
      kind: 'host',
      name: markerDomain.key,
      intent: 'ledger',
      expected: '0',
      revision: '1',
      writes: [
        {
          op: 'put',
          key: 'host:captured',
          record: { kind: 'host', host: { key: 'captured', value: true } },
        },
      ],
    },
  }
}

it('checks an issued binding before any call exists, ignores unrelated issuance, and survives reopen', async () => {
  const { app, root } = await open()
  const original = await issue(app)
  const db = new DatabaseSync(
    join(root, 'domains', `${Buffer.from('windows-tool-0').toString('hex')}.sqlite`),
    { readOnly: true },
  )
  try {
    const detail = db
      .prepare(
        'EXPLAIN QUERY PLAN SELECT record FROM tl_record WHERE tenant = ? AND kind = ? AND name = ? AND key = ? LIMIT 1',
      )
      .all(textOf(TENANT_A), 'host', sourceDomain.key, original.observation.key)
      .map(row => row['detail'])
      .join('\n')
    expect(detail).toContain('SEARCH tl_record')
    expect(detail).toContain('tenant=? AND kind=? AND name=? AND key=?')
    expect(detail).not.toContain('SCAN')
  } finally {
    db.close()
  }
  expect(
    await app.store.read({ kind: 'call', tenant: TENANT_A, call: original.issued.call }),
  ).toMatchObject({ kind: 'complete', records: [] })
  expect(await commit(app, [original.fact])).toHaveProperty('kind', 'committed')
  await issue(app, 'unrelated')
  expect(await commit(app, [guard([original.observation])])).toHaveProperty('kind', 'committed')
  await app.close()
  opened.delete(app)
  const reopened = (await open(root)).app
  expect(await commit(reopened, [guard([original.observation])])).toHaveProperty(
    'kind',
    'committed',
  )
}, 30_000)

it('rechecks all three original forwarding records and rejects a changed parent', async () => {
  const { app } = await open()
  const f = await forwardingFixture({ store: app.store })
  const forward = await f.source.forwarding.resolve({
    ...f.parent,
    target: f.target,
    intent: f.intent,
  })
  if (forward.kind !== 'bound') throw new Error(JSON.stringify(forward))
  const qualified = ok(
    await createLocalInvocationQualifier(f.input).qualify({
      principal: 'alice',
      tenant: TENANT_A,
      call: forward.call,
      admission: forward.admission,
      request: forward.request,
    }),
  )
  expect(qualified.records).toHaveLength(3)
  const records = qualified.records.map(item => ({
    kind: item.domain.kind,
    name: item.domain.kind === 'call' ? item.domain.call : item.domain.key,
    key: item.key,
    digest: item.digest,
  }))
  expect(
    await commit(app, [toolRecordCurrentFacts({ tenant: textOf(TENANT_A), records })]),
  ).toHaveProperty('kind', 'committed')
  for (let index = 0; index < records.length; index++) {
    const changed = records.map((item, at) =>
      index === at ? { ...item, digest: `sha256:${'0'.repeat(64)}` } : item,
    )
    expect(
      await commit(app, [
        marker(),
        toolRecordCurrentFacts({ tenant: textOf(TENANT_A), records: changed }),
      ]),
    ).toHaveProperty('kind', 'rolled_back')
  }
  expect(
    await commit(app, [
      {
        participant: 'tool',
        facts: {
          tenant: textOf(TENANT_A),
          kind: 'call',
          name: f.parent.call,
          intent: 'ledger',
          expected: '1',
          revision: '2',
          writes: [{ op: 'delete', key: 'call' }],
        },
      },
    ]),
  ).toHaveProperty('kind', 'committed')
  expect(
    await commit(app, [marker(), toolRecordCurrentFacts({ tenant: textOf(TENANT_A), records })]),
  ).toHaveProperty('kind', 'rolled_back')
  expect(await app.store.read(markerDomain)).toMatchObject({ kind: 'complete', records: [] })
}, 30_000)

it('rolls back coupled writes for wrong or changed evidence, including changes in the same transaction', async () => {
  const { app } = await open()
  const original = await issue(app)
  const current = original.observation
  for (const command of [
    guard([{ ...current, name: 'missing' }]),
    guard([{ ...current, key: 'missing' }]),
    guard([{ ...current, digest: `sha256:${'0'.repeat(64)}` }]),
    guard([current], textOf(TENANT_B)),
    guard([]),
    guard([current, current]),
  ]) {
    expect(await commit(app, [marker(), command])).toHaveProperty('kind', 'rolled_back')
    expect(await app.store.read(markerDomain)).toMatchObject({ kind: 'complete', records: [] })
  }
  const change: FactCommandV2 = {
    participant: 'tool',
    facts: {
      tenant: textOf(TENANT_A),
      kind: 'host',
      name: sourceDomain.key,
      intent: 'ledger',
      expected: '1',
      revision: '2',
      writes: [{ op: 'delete', key: current.key }],
    },
  }
  expect(await commit(app, [change, guard([current])])).toHaveProperty('kind', 'rolled_back')
  const operationKey = randomUUID()
  const receipt = await commit(app, [guard([current])], operationKey)
  expect(receipt).toHaveProperty('kind', 'committed')
  expect(await commit(app, [change])).toHaveProperty('kind', 'committed')
  expect(await commit(app, [guard([current])], operationKey)).toEqual(receipt)
  expect(await commit(app, [marker(), guard([current])])).toHaveProperty('kind', 'rolled_back')
  expect(await app.store.read(markerDomain)).toMatchObject({ kind: 'complete', records: [] })
}, 30_000)
