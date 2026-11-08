import { afterEach, expect, it } from 'vitest'
import { createSqlToolHistoryCallSource } from '../src/index.ts'
import { openApp, TENANT_A, TENANT_B, domainNameOf, textOf, type App } from './fixtures/app.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

it('finds calls without due hints and orphan copies, once each across bounded pages', async () => {
  const app = await openApp()
  opened.push(app)
  const insert = (sql: string, call: string) =>
    app.sqlite.inspect(domainNameOf(TENANT_A), sql, [textOf(TENANT_A), call])
  insert("INSERT INTO tl_domain VALUES (?, 'call', ?, '1')", 'a-current')
  insert("INSERT INTO tl_domain VALUES (?, 'host', ?, '1')", 'not-a-call')
  insert("INSERT INTO tl_record VALUES (?, 'call', ?, 'result', '{}')", 'b-orphan-record')
  insert(
    "INSERT INTO tl_manifest VALUES (?, ?, 'op', 'raw', 'digest', 0, 0, 'hash', 'seal', '{}')",
    'c-old-manifest',
  )
  insert("INSERT INTO tl_chunk VALUES (?, ?, 'op', 0, X'01')", 'd-old-chunk')
  insert(
    "INSERT INTO tl_material VALUES (?, ?, 'm', 'op', 'digest', 'sealed', NULL, NULL, NULL, NULL)",
    'e-material',
  )
  insert("INSERT INTO tl_material_chunk VALUES (?, ?, 'm', 0, X'01')", 'f-material-chunk')
  insert("INSERT INTO tl_chunk VALUES (?, ?, 'op', 0, X'01')", 'a-current')
  const source = createSqlToolHistoryCallSource(app.options)
  const first = ok(await source.scan({ tenant: TENANT_A, after: null, limit: 2 }))
  expect(first).toEqual({ calls: ['a-current', 'b-orphan-record'], next: expect.any(String) })
  const second = ok(await source.scan({ tenant: TENANT_A, after: first.next, limit: 2 }))
  expect(second).toEqual({ calls: ['c-old-manifest', 'd-old-chunk'], next: expect.any(String) })
  expect(ok(await source.scan({ tenant: TENANT_A, after: second.next, limit: 2 }))).toEqual({
    calls: ['e-material', 'f-material-chunk'],
    next: null,
  })
})

it('rejects a corrupt empty call identity instead of skipping it and reporting an empty inventory', async () => {
  const app = await openApp()
  opened.push(app)
  app.sqlite.inspect(
    domainNameOf(TENANT_A),
    "INSERT INTO tl_chunk VALUES (?, '', 'op', 0, X'01')",
    [textOf(TENANT_A)],
  )
  expect(
    await createSqlToolHistoryCallSource(app.options).scan({
      tenant: TENANT_A,
      after: null,
      limit: 128,
    }),
  ).toHaveProperty('failure.kind', 'unavailable')
})

it('isolates tenant rows and cursors and keeps failures distinct from an empty inventory', async () => {
  const app = await openApp()
  opened.push(app)
  for (const call of ['a', 'b'])
    app.sqlite.inspect(domainNameOf(TENANT_A), "INSERT INTO tl_domain VALUES (?, 'call', ?, '1')", [
      textOf(TENANT_A),
      call,
    ])
  app.sqlite.inspect(
    domainNameOf(TENANT_A),
    "INSERT INTO tl_chunk VALUES (?, 'foreign', 'op', 0, X'01')",
    [textOf(TENANT_B)],
  )
  const source = createSqlToolHistoryCallSource(app.options)
  expect(ok(await source.scan({ tenant: TENANT_A, after: null, limit: 128 })).calls).toEqual([
    'a',
    'b',
  ])
  const first = ok(await source.scan({ tenant: TENANT_A, after: null, limit: 1 }))
  expect(await source.scan({ tenant: TENANT_B, after: first.next, limit: 1 })).toHaveProperty(
    'failure.kind',
    'invalid',
  )
  for (const limit of [0, -1, 129, 1.1, Infinity])
    expect(await source.scan({ tenant: TENANT_A, after: null, limit })).toHaveProperty(
      'failure.kind',
      'invalid',
    )
  expect(ok(await source.scan({ tenant: TENANT_B, after: null, limit: 128 }))).toEqual({
    calls: [],
    next: null,
  })
  app.faults.failNextRead()
  expect(await source.scan({ tenant: TENANT_A, after: null, limit: 128 })).toHaveProperty(
    'failure.kind',
    'unavailable',
  )
})

it('totalizes provider exceptions as unavailable', async () => {
  const app = await openApp()
  opened.push(app)
  const source = createSqlToolHistoryCallSource({
    ...app.options,
    storage: {
      ...app.options.storage,
      read: async () => {
        throw new Error('provider stopped')
      },
    },
  })
  await expect(source.scan({ tenant: TENANT_A, after: null, limit: 1 })).resolves.toHaveProperty(
    'failure.kind',
    'unavailable',
  )
})
