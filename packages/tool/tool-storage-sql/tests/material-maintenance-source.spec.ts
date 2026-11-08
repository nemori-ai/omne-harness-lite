import { afterEach, expect, it } from 'vitest'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import type { LedgerRecord } from '@omne-harness/tool'
import { decodeToolMaterialInstant, decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createSqlToolLedgerStore, createSqlToolMaterialMaintenanceSource } from '../src/index.ts'
import { openApp, TENANT_A, TENANT_B, domainNameOf, textOf, type App } from './fixtures/app.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

const at = ok(decodeToolMaterialInstant('2026-11-08T00:00:00.000Z'))
const request = { tenant: TENANT_A, at, after: null, limit: 1 }
type Hint = Extract<LedgerRecord, { kind: 'material-maintenance-hint' }>['hint']
async function write(
  app: App,
  name: string,
  hint: Hint | null,
  expected = '0',
  revision = '1',
  tenant = TENANT_A,
) {
  return app.store.commit({
    domain: { kind: 'call', tenant, call: ok(decodeToolCallId(name)) },
    expected: ok(decodeToolRevision(expected)),
    revision: ok(decodeToolRevision(revision)),
    writes:
      hint === null ? [] : [{ kind: 'put', record: { kind: 'material-maintenance-hint', hint } }],
  })
}

it('discovers one ready call per page through the durable candidate port', async () => {
  const app = await openApp()
  opened.push(app)
  for (const name of ['first', 'second']) {
    expect(
      await app.store.commit({
        domain: { kind: 'call', tenant: TENANT_A, call: ok(decodeToolCallId(name)) },
        expected: ok(decodeToolRevision('0')),
        revision: ok(decodeToolRevision('1')),
        writes: [
          { kind: 'put', record: { kind: 'material-maintenance-hint', hint: { kind: 'ready' } } },
        ],
      }),
    ).toEqual({ kind: 'committed' })
  }
  const source = createSqlToolMaterialMaintenanceSource(app.options)
  const page = await source.scan({
    tenant: TENANT_A,
    at: ok(decodeToolMaterialInstant('2026-11-08T00:00:00.000Z')),
    after: null,
    limit: 1,
  })
  expect(page).toEqual({ ok: { calls: ['first'], next: expect.any(String) } })
})

it('finishes a fixed round despite new calls and discovers them in the next round', async () => {
  const app = await openApp()
  opened.push(app)
  for (const name of ['first', 'second', 'third'])
    expect(await write(app, name, { kind: 'ready' })).toHaveProperty('kind', 'committed')
  const source = createSqlToolMaterialMaintenanceSource(app.options)
  let page = ok(await source.scan(request))
  expect(page.calls).toEqual(['first'])
  expect(await write(app, 'new-before-first-lexically', { kind: 'ready' })).toHaveProperty(
    'kind',
    'committed',
  )
  page = ok(await source.scan({ ...request, after: page.next }))
  expect(page.calls).toEqual(['second'])
  page = ok(await source.scan({ ...request, after: page.next }))
  expect(page).toEqual({ calls: ['third'], next: null })
  expect(ok(await source.scan({ ...request, limit: 128 })).calls).toEqual([
    'first',
    'second',
    'third',
    'new-before-first-lexically',
  ])
})

it('advances an empty page past a future deadline without returning idle calls', async () => {
  const app = await openApp()
  opened.push(app)
  await write(app, 'idle', { kind: 'none' })
  await write(app, 'future', {
    kind: 'due',
    at: ok(decodeToolMaterialInstant('2026-11-09T00:00:00.000Z')),
  })
  await write(app, 'ready', { kind: 'ready' })
  const source = createSqlToolMaterialMaintenanceSource(app.options)
  const first = ok(await source.scan(request))
  expect(first).toEqual({ calls: [], next: expect.any(String) })
  expect(ok(await source.scan({ ...request, after: first.next }))).toEqual({
    calls: ['ready'],
    next: null,
  })
})

it('projects hint changes only when the same ledger CAS commits', async () => {
  const app = await openApp()
  opened.push(app)
  await write(app, 'call', { kind: 'ready' })
  const source = createSqlToolMaterialMaintenanceSource(app.options)
  expect(await write(app, 'call', { kind: 'none' }, '0', '2')).toEqual({
    kind: 'conflict',
    current: '1',
  })
  expect(ok(await source.scan(request)).calls).toEqual(['call'])
  expect(await write(app, 'call', { kind: 'none' }, '1', '2')).toHaveProperty('kind', 'committed')
  expect(ok(await source.scan(request))).toEqual({ calls: [], next: null })
})

it.each(['unknown-applied', 'unknown-dropped', 'rejected'] as const)(
  'keeps the index and ledger atomic across %s',
  async fault => {
    const app = await openApp()
    opened.push(app)
    app.faults.armCommit(fault)
    const committed = await write(app, 'call', { kind: 'ready' })
    expect(committed.kind).toBe(fault === 'rejected' ? 'unavailable' : 'unknown')
    const source = createSqlToolMaterialMaintenanceSource(app.options)
    const exists = fault === 'unknown-applied'
    expect(ok(await source.scan(request)).calls).toEqual(exists ? ['call'] : [])
    const ledger = await app.store.read({
      kind: 'call',
      tenant: TENANT_A,
      call: ok(decodeToolCallId('call')),
    })
    if (ledger.kind !== 'complete') throw new Error('ledger unavailable')
    expect(ledger.records).toHaveLength(exists ? 1 : 0)
  },
)

it('binds continuation to its tenant and cutoff and rejects invalid limits', async () => {
  const app = await openApp()
  opened.push(app)
  await write(app, 'first', { kind: 'ready' })
  await write(app, 'second', { kind: 'ready' })
  await write(app, 'foreign', { kind: 'ready' }, '0', '1', TENANT_B)
  app.sqlite.inspect(
    domainNameOf(TENANT_A),
    'INSERT INTO tl_material_maintenance (tenant, call, hint, due_at) VALUES (?, ?, ?, NULL)',
    [textOf(TENANT_B), 'foreign-in-shared-file', 'ready'],
  )
  const source = createSqlToolMaterialMaintenanceSource(app.options)
  expect(ok(await source.scan({ ...request, limit: 128 })).calls).toEqual(['first', 'second'])
  const first = ok(await source.scan(request))
  expect(await source.scan({ ...request, tenant: TENANT_B, after: first.next })).toHaveProperty(
    'failure.kind',
    'invalid',
  )
  expect(
    await source.scan({
      ...request,
      at: ok(decodeToolMaterialInstant('2026-11-09T00:00:00.000Z')),
      after: first.next,
    }),
  ).toHaveProperty('failure.kind', 'invalid')
  for (const limit of [0, -1, 129, 1.5, Infinity])
    expect(await source.scan({ ...request, limit })).toHaveProperty('failure.kind', 'invalid')
  expect(ok(await source.scan({ ...request, tenant: TENANT_B })).calls).toEqual(['foreign'])
})

it('resumes a cursor after reopening the database', async () => {
  const first = await openApp({ keep: true })
  let next: string | null = null
  try {
    await write(first, 'one', { kind: 'ready' })
    await write(first, 'two', { kind: 'ready' })
    next = ok(await createSqlToolMaterialMaintenanceSource(first.options).scan(request)).next
    expect(next).not.toBeNull()
  } finally {
    first.close()
  }
  const reopened = await openApp({ directory: first.directory })
  opened.push(reopened)
  expect(
    ok(
      await createSqlToolMaterialMaintenanceSource(reopened.options).scan({
        ...request,
        after: next,
      }),
    ),
  ).toEqual({ calls: ['two'], next: null })
})

it('migrates old call domains with and without a hint, then recognizes CAS backfill', async () => {
  const first = await openApp({ keep: true })
  try {
    await write(first, 'legacy', null)
    await write(first, 'idle', { kind: 'none' })
    first.sqlite.inspect(domainNameOf(TENANT_A), 'DROP TABLE tl_material_maintenance')
    first.sqlite.inspect(
      domainNameOf(TENANT_A),
      "DELETE FROM _sql_migration WHERE owner = 'tool' AND id = '003-tool-material-maintenance'",
    )
  } finally {
    first.close()
  }
  const reopened = await openApp({ directory: first.directory })
  opened.push(reopened)
  const source = createSqlToolMaterialMaintenanceSource(reopened.options)
  expect(ok(await source.scan(request))).toEqual({ calls: ['legacy'], next: null })
  expect(await write(reopened, 'legacy', { kind: 'none' }, '1', '2')).toHaveProperty(
    'kind',
    'committed',
  )
  expect(ok(await source.scan(request))).toEqual({ calls: [], next: null })
})

it('rolls back the ledger when the supplied hint is malformed', async () => {
  const app = await openApp()
  opened.push(app)
  const store = createSqlToolLedgerStore({
    ...app.options,
    storage: {
      ...app.options.storage,
      commit: input =>
        app.options.storage.commit({
          ...input,
          commands: input.commands.map(command => ({
            ...command,
            facts: {
              ...command.facts,
              writes: [
                {
                  op: 'put',
                  key: 'material-maintenance-hint',
                  record: {
                    kind: 'material-maintenance-hint',
                    hint: { kind: 'due', at: 'invalid' },
                  },
                },
              ],
            },
          })),
        }),
    },
  })
  expect(await write({ ...app, store }, 'call', { kind: 'ready' })).toHaveProperty(
    'kind',
    'unavailable',
  )
  expect(
    await app.store.read({ kind: 'call', tenant: TENANT_A, call: ok(decodeToolCallId('call')) }),
  ).toEqual({ kind: 'complete', revision: '0', records: [] })
  expect(ok(await createSqlToolMaterialMaintenanceSource(app.options).scan(request))).toEqual({
    calls: [],
    next: null,
  })
})

it('reports an unavailable read instead of declaring the scan complete', async () => {
  const app = await openApp()
  opened.push(app)
  await write(app, 'call', { kind: 'ready' })
  app.faults.failNextRead()
  expect(await createSqlToolMaterialMaintenanceSource(app.options).scan(request)).toHaveProperty(
    'failure.kind',
    'unavailable',
  )
})
