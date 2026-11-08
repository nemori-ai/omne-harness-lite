import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { openApp, TENANT_A, domainNameOf, textOf, type App } from './fixtures/app.ts'
import { fixedRequest } from './fixtures/ledger.ts'
import { encodeToolMaterial } from '@omne-harness/tool'
import { createSqlToolHistoryLedgerStore } from '../src/index.ts'

// Produced by f1ea8a298's runtime and SQL participant. Only the native-file path is redacted.
// These are format fixtures, not proof of the original source digest or custody.
const historical: readonly { kind: string; key: string; record: unknown }[] = JSON.parse(
  readFileSync(new URL('./fixtures/pre-w3-records.json', import.meta.url), 'utf8'),
)
const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

type StoredFixture = Readonly<{ key: string; record: unknown }>

async function stored(fixtures: readonly StoredFixture[]) {
  const call = decodeToolCallId('legacy-ordinary')
  if ('failure' in call) throw new Error('invalid fixture call')
  const app = await openApp()
  opened.push(app)
  const database = new DatabaseSync(join(app.directory, `${domainNameOf(TENANT_A)}.db`))
  try {
    database
      .prepare('INSERT INTO tl_domain (tenant, kind, name, revision) VALUES (?, ?, ?, ?)')
      .run(textOf(TENANT_A), 'call', call.ok, '1')
    for (const fixture of fixtures)
      database
        .prepare('INSERT INTO tl_record (tenant, kind, name, key, record) VALUES (?, ?, ?, ?, ?)')
        .run(textOf(TENANT_A), 'call', call.ok, fixture.key, JSON.stringify(fixture.record))
  } finally {
    database.close()
  }
  const domain = { kind: 'call' as const, tenant: TENANT_A, call: call.ok }
  return {
    read: () => app.store.read(domain),
    history: () => createSqlToolHistoryLedgerStore(app.options).read(domain),
    rows: () =>
      app.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT key, record FROM tl_record ORDER BY key'),
  }
}

it('exposes unconverted records only through the maintenance store without writing them', async () => {
  const app = await stored(historical)
  const before = app.rows()
  const result = await app.history()
  expect(result.kind).toBe('complete')
  if (result.kind !== 'complete') throw new Error('historical read unavailable')
  expect(result.revision).toBe('1')
  expect(result.records).toEqual(
    expect.arrayContaining(historical.map(({ key, record }) => ({ key, record }))),
  )
  expect(result.records).toHaveLength(historical.length)
  await expect(app.read()).resolves.toMatchObject({ kind: 'unavailable' })
  expect(app.rows()).toEqual(before)
})

it.each(historical)('refuses a pre-W3 $kind without changing stored bytes', async fixture => {
  const app = await stored([fixture])
  const before = app.rows()
  await expect(app.read()).resolves.toMatchObject({ kind: 'unavailable' })
  expect(app.rows()).toEqual(before)
})

it('does not interpret opaque host values as Tool records', async () => {
  const record = { kind: 'host', host: { key: 'foreign', value: historical[0]?.record } }
  const app = await stored([{ key: 'host:foreign', record }])
  await expect(app.read()).resolves.toMatchObject({ kind: 'complete', records: [record] })
})

it('refuses the whole read when current and historical records are mixed', async () => {
  const fixture = historical.find(row => row.kind === 'result')
  if (!fixture) throw new Error('missing historical result')
  const app = await stored([
    { key: 'host:foreign', record: { kind: 'host', host: { key: 'foreign', value: null } } },
    fixture,
  ])
  const before = app.rows()
  await expect(app.read()).resolves.toMatchObject({ kind: 'unavailable' })
  expect(app.rows()).toEqual(before)
})

it.each([false, true])(
  'refuses historical custody even with a new materialized field=%s',
  async materialized => {
    const fixture = historical.find(row => row.kind === 'result')
    if (!fixture) throw new Error('missing historical result')
    const record = fixture.record as { result: Record<string, unknown> }
    const custody = record.result.custody as Record<string, unknown>
    const app = await stored([
      {
        key: fixture.key,
        record: {
          ...record,
          result: {
            ...record.result,
            value: { kind: 'channels', value: { codec: 'tool-canonical-json-v1' } },
            custody: materialized ? { ...custody, materialized: custody.retained } : custody,
          },
        },
      },
    ])
    await expect(app.read()).resolves.toMatchObject({ kind: 'unavailable' })
  },
)

it.each([false, true])('checks every command return format, historical command=%s', async old => {
  const fixture = historical.find(row => row.kind === 'call')
  if (!fixture) throw new Error('missing historical call')
  const request = fixedRequest()
  const definition = request.availability.definition
  if (definition.kind !== 'function') throw new Error('fixture must be a function')
  const record = fixture.record as { call: Record<string, unknown> }
  const commands = ['first', 'second'].map((name, index) => ({
    name,
    summary: name,
    parameters: { kind: 'declared', value: definition.parameters },
    returns:
      old && index === 1 ? { kind: 'ordinary', program: { kind: 'none' } } : definition.returns,
  }))
  const app = await stored([
    {
      key: fixture.key,
      record: {
        ...record,
        call: {
          ...record.call,
          request: {
            ...request,
            availability: {
              ...request.availability,
              definition: {
                kind: 'commands',
                encoding: 'wrapped',
                commands,
                adoption: definition.adoption,
                name: definition.name,
                description: definition.description,
                requiredCapabilities: definition.requiredCapabilities,
                backgroundAllowed: definition.backgroundAllowed,
                declarations: definition.declarations,
              },
            },
          },
        },
      },
    },
  ])
  await expect(app.read()).resolves.toMatchObject({ kind: old ? 'unavailable' : 'complete' })
})

it('refuses a current fact fingerprint around an old inline final result', async () => {
  const fixture = historical.find(row => row.kind === 'fact-event')
  if (!fixture) throw new Error('missing historical final fact')
  const record = fixture.record as { fact: Record<string, unknown> }
  const encoded = encodeToolMaterial(record.fact.fact)
  if ('failure' in encoded) throw new Error('invalid historical fact fixture')
  const app = await stored([
    {
      key: fixture.key,
      record: { ...record, fact: { ...record.fact, value: encoded.ok.fingerprint } },
    },
  ])
  await expect(app.read()).resolves.toMatchObject({ kind: 'unavailable' })
})

it.each(['settled', 'running'])(
  'accepts marked historical requests only after settlement, phase=%s',
  async phase => {
    const original = historical.find(row => row.kind === 'call')!
    const value = original.record as { kind: 'call'; call: Record<string, unknown> }
    const record = {
      kind: 'call',
      call: { ...value.call, requestFormat: 'historical-result', state: { phase } },
    }
    const app = await stored([{ key: original.key, record }])
    await expect(app.read()).resolves.toMatchObject({
      kind: phase === 'settled' ? 'complete' : 'unavailable',
    })
  },
)
