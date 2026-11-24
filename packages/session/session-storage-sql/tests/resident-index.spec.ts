import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type {
  ResidentKey,
  ResidentTool,
  SessionCommand,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { app, TENANT_A, textOf, type App } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'
import { maintainDerived } from '../src/worker/participant.ts'
import { SCHEMA_STATEMENTS } from '../src/worker/schema.ts'

const KEY = 'resident-key' as ResidentKey
const resident = (capability: string, shape = `shape of ${capability}`): ResidentTool => ({
  capability,
  version: '1',
  shape: { kind: 'string', value: shape },
  admitted: evidence(`admitted/${capability}`),
})

async function createResident(a: App, session: string, capabilities: readonly string[]) {
  const command: SessionCommand = {
    kind: 'create',
    input: {
      tenant: TENANT_A,
      session: sessionId(session),
      operation: operationId(`create-${session}`),
      creation: creation({
        residentAdoption: {
          residents: capabilities.map(capability => resident(capability)),
          keys: capabilities.map(capability => ({ capability, key: KEY })),
        },
      }),
    },
  }
  const guards = [
    initializationFixtureGuard(
      initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
    ),
  ]
  expect(
    kindOf(await a.port.commit({ access: a.access(TENANT_A, session), command, guards })),
  ).toBeUndefined()
}

const control = async (a: App, session: string, kind: 'archive' | 'unarchive') =>
  expect(
    kindOf(
      await a.port.commit({
        access: a.access(TENANT_A, session),
        command: {
          kind: 'control',
          input: {
            tenant: TENANT_A,
            session: sessionId(session),
            operation: operationId(`${kind}-${session}`),
            intent: { kind },
          },
        } as SessionCommand as never,
        guards: [],
      }),
    ),
  ).toBeUndefined()

const indexed = (a: App): string[] =>
  a.provider
    .select('dom_0', 'SELECT session, capability FROM sl_resident_idx ORDER BY session, capability')
    .rows.map(row => `${String(row[0])}/${String(row[1])}`)

async function referenced(a: App): Promise<string[]> {
  const out = await a.port.references({
    principal: 'tester',
    scope: 'system',
    key: KEY,
    after: null,
    limit: 100,
  })
  if (!('ok' in out)) throw new Error(`references failed: ${JSON.stringify(out)}`)
  return out.ok.sessions.map(row => `${row.session}/${row.capability}`)
}

async function referencedShapes(a: App) {
  const out = await a.port.references({
    principal: 'tester',
    scope: 'system',
    key: KEY,
    after: null,
    limit: 100,
  })
  if (!('ok' in out)) throw new Error(`references failed: ${JSON.stringify(out)}`)
  return out.ok.sessions.map(row => ({
    session: row.session,
    capability: row.capability,
    shape: row.shape,
  }))
}

const storedShapes = (a: App): unknown[] =>
  a.provider
    .select('dom_0', 'SELECT shape FROM sl_resident_shape ORDER BY shape')
    .rows.map(row => JSON.parse(String(row[0])))

const indexWrites = (a: App, from = 0): string[] =>
  a.provider.participantWrites
    .slice(from)
    .map(write => write.sql)
    .filter(sql => sql.includes('sl_resident_'))

function planOf(statement: string): string {
  const params = Array.from(statement.matchAll(/\?/g), () => 'x')
  const db = new DatabaseSync(':memory:')
  for (const text of SCHEMA_STATEMENTS) db.exec(text)
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${statement}`).all(...params) as { detail: string }[]
  db.close()
  return rows.map(row => row.detail).join('\n')
}

describe('the resident index over the commits of a session', () => {
  it('holds the registered capabilities, drops them on archive and restores them on unarchive', async () => {
    const a = await app()
    await createResident(a, 'one', ['fs', 'shell'])
    await createResident(a, 'two', ['fs'])
    expect(indexed(a)).toEqual(['one/fs', 'one/shell', 'two/fs'])
    expect(await referenced(a)).toEqual(['one/fs', 'one/shell', 'two/fs'])

    await control(a, 'one', 'archive')
    expect(indexed(a)).toEqual(['two/fs'])
    expect(await referenced(a)).toEqual(['two/fs'])

    await control(a, 'one', 'unarchive')
    expect(indexed(a)).toEqual(['one/fs', 'one/shell', 'two/fs'])
  })

  it('a commit that leaves the registrations alone runs no statement on the index', async () => {
    const a = await app()
    await createResident(a, 'one', ['fs', 'shell'])
    const from = a.provider.participantWrites.length
    expect(kindOf(await a.accept(TENANT_A, 'one', 'first'))).toBeUndefined()
    expect(kindOf(await a.accept(TENANT_A, 'one', 'second'))).toBeUndefined()
    expect(a.provider.participantWrites.length).toBeGreaterThan(from)
    expect(indexWrites(a, from)).toEqual([])
    expect(indexed(a)).toEqual(['one/fs', 'one/shell'])
  })

  it('seven sessions holding the same twelve capabilities store twelve shapes and read every one back', async () => {
    const a = await app()
    const capabilities = Array.from({ length: 12 }, (_, index) => `cap-${index}`)
    const sessions = Array.from({ length: 7 }, (_, index) => `s${index}`)
    for (const session of sessions) await createResident(a, session, capabilities)
    expect(indexed(a)).toHaveLength(84)
    expect(storedShapes(a)).toHaveLength(12)
    expect(await referencedShapes(a)).toEqual(
      sessions.flatMap(session =>
        [...capabilities]
          .sort()
          .map(capability => ({ session, capability, shape: resident(capability).shape })),
      ),
    )
  })

  it('the last row that holds a shape takes the shape with it; a shape another row holds stays', async () => {
    const a = await app()
    await createResident(a, 'one', ['fs', 'shell'])
    await createResident(a, 'two', ['fs'])
    expect(storedShapes(a)).toEqual([resident('fs').shape, resident('shell').shape])
    await control(a, 'one', 'archive')
    expect(storedShapes(a)).toEqual([resident('fs').shape])
    await control(a, 'two', 'archive')
    expect(storedShapes(a)).toEqual([])
  })

  it('a row whose shape is missing reads as a storage failure, not as a missing capability', async () => {
    const a = await app()
    await createResident(a, 'one', ['fs'])
    a.provider.seed('dom_0', 'DELETE FROM sl_resident_shape', [])
    const out = await a.port.references({
      principal: 'tester',
      scope: 'system',
      key: KEY,
      after: null,
      limit: 100,
    })
    expect(out).not.toHaveProperty('ok')
    expect(kindOf(out)).toBe('unavailable')
  })

  it('no statement on the index scans the table', async () => {
    const a = await app()
    await createResident(a, 'one', ['fs', 'shell'])
    await a.accept(TENANT_A, 'one', 'first')
    await control(a, 'one', 'archive')
    await control(a, 'one', 'unarchive')
    const statements = [...new Set(indexWrites(a))]
    expect(statements.some(sql => sql.startsWith('DELETE'))).toBe(true)
    expect(statements.some(sql => sql.startsWith('INSERT'))).toBe(true)
    for (const statement of statements) expect(planOf(statement)).not.toMatch(/\bSCAN\b/)
  })
})

describe('the resident index between two snapshots', () => {
  const tenant = textOf(TENANT_A)
  const snapshot = (
    keys: readonly (readonly [capability: string, key: string])[],
    residents: readonly ResidentTool[],
    lifecycle: WorkSnapshot['lifecycle'] = 'active',
  ): WorkSnapshot =>
    ({
      lifecycle,
      tasks: [],
      unresolved: [],
      controls: [],
      pending: [],
      run: { kind: 'none' },
      consumptions: [],
      residents,
      residentKeys: keys.map(([capability, key]) => ({ capability, key: key as ResidentKey })),
    }) as unknown as WorkSnapshot

  function scene() {
    const { port } = migratedPort()
    const statements: string[] = []
    const recording = {
      ...port,
      execute: (sql: string, params: Parameters<typeof port.execute>[1] = []) => {
        const written = /^(?:INSERT(?: OR \w+)? INTO|DELETE FROM) (sl_resident_\w+)/.exec(sql)?.[1]
        if (written !== undefined) statements.push(written)
        return port.execute(sql, params)
      },
    }
    const rows = () =>
      port
        .execute(
          `SELECT i.resident_key, i.session, i.capability, s.shape FROM sl_resident_idx i
            LEFT JOIN sl_resident_shape s ON s.tenant = i.tenant AND s.digest = i.shape_digest
            ORDER BY i.resident_key, i.session, i.capability`,
        )
        .rows.map(row => `${String(row[0])}/${String(row[1])}/${String(row[2])}=${String(row[3])}`)
    const shapes = () =>
      port
        .execute('SELECT shape FROM sl_resident_shape ORDER BY shape')
        .rows.map(row => String(row[0]))
    const step = (session: string, previous: WorkSnapshot | null, next: WorkSnapshot) => {
      statements.length = 0
      maintainDerived(recording, tenant, session, previous, next)
      return [...statements]
    }
    return { rows, shapes, step }
  }
  const indexRows = (written: readonly string[]) =>
    written.filter(table => table === 'sl_resident_idx')
  const shapeText = (value: string) => JSON.stringify({ kind: 'string', value })

  it('a replaced key moves the row of its capability and leaves the other rows alone', () => {
    const s = scene()
    const residents = [resident('fs', 'f'), resident('shell', 's')]
    const first = snapshot(
      [
        ['fs', 'k1'],
        ['shell', 'k1'],
      ],
      residents,
    )
    s.step('one', null, first)
    s.step('two', null, snapshot([['fs', 'k1']], [resident('fs', 'other')]))
    const second = snapshot(
      [
        ['fs', 'k2'],
        ['shell', 'k1'],
      ],
      residents,
    )
    const ran = s.step('one', first, second)
    expect(s.rows()).toEqual([
      `k1/one/shell=${shapeText('s')}`,
      `k1/two/fs=${shapeText('other')}`,
      `k2/one/fs=${shapeText('f')}`,
    ])
    expect(indexRows(ran)).toHaveLength(2)
    expect(s.shapes()).toEqual([shapeText('f'), shapeText('other'), shapeText('s')])
  })

  it('a new definition of a capability rewrites only the row of that capability', () => {
    const s = scene()
    const keys = [
      ['fs', 'k1'],
      ['shell', 'k1'],
    ] as const
    const shell = resident('shell', 's')
    const first = snapshot(keys, [resident('fs', 'f'), shell])
    s.step('one', null, first)
    const ran = s.step('one', first, snapshot(keys, [resident('fs', 'f2'), shell]))
    expect(s.rows()).toEqual([`k1/one/fs=${shapeText('f2')}`, `k1/one/shell=${shapeText('s')}`])
    expect(indexRows(ran)).toHaveLength(1)
    expect(s.shapes()).toEqual([shapeText('f2'), shapeText('s')])
  })

  it('a new definition keeps the old shape while a row of another session holds it', () => {
    const s = scene()
    const keys = [['fs', 'k1']] as const
    const first = snapshot(keys, [resident('fs', 'f')])
    s.step('one', null, first)
    s.step('two', null, snapshot(keys, [resident('fs', 'f')]))
    s.step('one', first, snapshot(keys, [resident('fs', 'f2')]))
    expect(s.rows()).toEqual([`k1/one/fs=${shapeText('f2')}`, `k1/two/fs=${shapeText('f')}`])
    expect(s.shapes()).toEqual([shapeText('f'), shapeText('f2')])
  })

  it('a key whose capability has no definition has no row', () => {
    const s = scene()
    const first = snapshot(
      [
        ['fs', 'k1'],
        ['shell', 'k1'],
      ],
      [resident('fs', 'f')],
    )
    s.step('one', null, first)
    expect(s.rows()).toEqual([`k1/one/fs=${shapeText('f')}`])
  })

  it('an equal definition in a new object runs no statement', () => {
    const s = scene()
    const first = snapshot([['fs', 'k1']], [resident('fs', 'f')])
    s.step('one', null, first)
    expect(s.step('one', first, snapshot([['fs', 'k1']], [resident('fs', 'f')]))).toEqual([])
  })
})
