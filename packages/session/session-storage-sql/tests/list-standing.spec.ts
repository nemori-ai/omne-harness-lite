import { describe, expect, it } from 'vitest'
import {
  RELATIONS_TO_REFERENCE,
  relationToReference,
  type DirectoryStanding,
  type Relation,
  type RelationToReference,
  type SessionCommand,
  type SessionDirectory,
  type SessionListFilter,
  type SessionListItem,
} from '@omne-harness/session-contract'
import { evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import { referenceOf } from '../src/worker/list-standing.ts'
import { listFilters, listStatements } from '../src/worker/read-session-list.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'

type Listing = Parameters<SessionDirectory<string>['list']>[0]

const basis = evidence('dispatch')
const child = (parent: string) => ({
  relation: { kind: 'child', parent: sessionId(parent), basis } satisfies Relation,
  attendance: 'unattended' as const,
})
const TREE = ['r', 'a', 'b', 'a1', 'a2', 'b1', 'x', 'h'] as const

// r has the children a and b; a has a1 and a2; b has b1; x is another root; a handed h off.
async function tree(a: App): Promise<void> {
  await a.create(TENANT_A, 'r')
  await a.create(TENANT_A, 'a', child('r'))
  await a.create(TENANT_A, 'b', child('r'))
  await a.create(TENANT_A, 'a1', child('a'))
  await a.create(TENANT_A, 'a2', child('a'))
  await a.create(TENANT_A, 'b1', child('b'))
  await a.create(TENANT_A, 'x')
  await a.create(TENANT_A, 'h', {
    relation: { kind: 'handoff', origin: sessionId('a'), basis },
  })
}

const directoryOf = (a: App): SessionDirectory<string> => {
  if (a.port.directory === undefined) throw new Error('the port offers no directory')
  return a.port.directory
}

const list = (a: App, input: Partial<Listing> = {}) =>
  directoryOf(a).list({ principal: 'tester', tenant: TENANT_A, after: null, limit: 100, ...input })

async function items(a: App, input: Partial<Listing> = {}): Promise<readonly SessionListItem[]> {
  const page = await list(a, input)
  if (!('ok' in page)) throw new Error(JSON.stringify(page))
  return page.ok.items
}

const sessions = async (a: App, input: Partial<Listing> = {}) =>
  (await items(a, input)).map(item => item.session as string).sort()

const port = (a: App) => ({
  execute: (sql: string, params: readonly unknown[]) =>
    a.provider.select('dom_0', sql, params as never),
})

const place = (a: App, session: string): DirectoryStanding => {
  const found = referenceOf(port(a) as never, textOf(TENANT_A), session)
  if (found === null) throw new Error(`no row of ${session}`)
  return found
}

describe('every row of the directory carries its standing', () => {
  it('answers relation, root, depth, attendance and definition from the creation', async () => {
    const a = await app()
    await tree(a)
    const rows = Object.fromEntries((await items(a)).map(item => [item.session, item]))
    expect(rows['r']).toMatchObject({
      relation: { kind: 'main' },
      root: 'r',
      depth: 0,
      attendance: 'attended',
      definition: 'assistant',
      toReference: null,
    })
    expect(rows['a1']).toMatchObject({
      relation: { kind: 'child', parent: 'a' },
      root: 'r',
      depth: 2,
      attendance: 'unattended',
    })
    expect(rows['h']).toMatchObject({
      relation: { kind: 'handoff', origin: 'a' },
      root: 'h',
      depth: 0,
      attendance: 'attended',
    })
  })

  it('filters by kind, parent, root, attendance, definition, lifecycle and title', async () => {
    const a = await app()
    await tree(a)
    await a.accept(TENANT_A, 'b', 'needle')
    port(a).execute(
      "UPDATE sl_session_list SET definition = 'worker' WHERE tenant = ? AND session = 'x'",
      [textOf(TENANT_A)],
    )
    const by = (filter: SessionListFilter) => sessions(a, { filter })
    expect(await by({ kind: 'child' })).toEqual(['a', 'a1', 'a2', 'b', 'b1'])
    expect(await by({ kind: 'handoff' })).toEqual(['h'])
    expect(await by({ parent: sessionId('a') })).toEqual(['a1', 'a2'])
    expect(await by({ root: sessionId('r') })).toEqual(['a', 'a1', 'a2', 'b', 'b1', 'r'])
    expect(await by({ attendance: 'attended' })).toEqual(['h', 'r', 'x'])
    expect(await by({ definition: 'worker' })).toEqual(['x'])
    expect(await by({ kind: 'child', root: sessionId('r'), parent: sessionId('b') })).toEqual([
      'b1',
    ])
    expect(await sessions(a, { titleContains: 'needle' })).toEqual(['b'])
    expect(await sessions(a, { lifecycle: 'frozen' })).toEqual([])
    expect(await sessions(a, { lifecycle: 'dormant' })).toHaveLength(TREE.length)
  })
})

describe('what each row is to a reference', () => {
  it('answers on every row the value the two rows give, for every reference', async () => {
    const a = await app()
    await tree(a)
    for (const reference of TREE) {
      const answered = Object.fromEntries(
        (await items(a, { reference: sessionId(reference) })).map(item => [
          item.session,
          item.toReference,
        ]),
      )
      const expected = Object.fromEntries(
        TREE.map(session => [session, relationToReference(place(a, session), place(a, reference))]),
      )
      expect(answered, reference).toEqual(expected)
    }
  })

  it('filters by each of the ten values to exactly the rows that carry it', async () => {
    const a = await app()
    await tree(a)
    const seen = new Set<RelationToReference>()
    for (const reference of TREE)
      for (const value of RELATIONS_TO_REFERENCE) {
        const expected = TREE.filter(
          session => relationToReference(place(a, session), place(a, reference)) === value,
        ).sort()
        const found = await sessions(a, {
          reference: sessionId(reference),
          filter: { toReference: value },
        })
        expect(found, `${value} of ${reference}`).toEqual(expected)
        if (found.length > 0) seen.add(value)
      }
    expect([...seen].sort()).toEqual([...RELATIONS_TO_REFERENCE].sort())
  })

  it('carries the relation into the archived list too', async () => {
    const a = await app()
    await tree(a)
    const archive: SessionCommand = {
      kind: 'control',
      input: {
        tenant: TENANT_A,
        session: sessionId('a1'),
        operation: operationId('archive'),
        intent: { kind: 'archive' },
      },
    }
    await a.port.commit({ access: a.access(TENANT_A, 'a1'), command: archive, guards: [] })
    const page = await directoryOf(a).listArchived({
      principal: 'tester',
      tenant: TENANT_A,
      after: null,
      limit: 10,
      from: null,
      to: null,
      by: null,
      titleContains: null,
      reference: sessionId('a'),
      filter: { toReference: 'child' },
    })
    expect(page).toMatchObject({
      ok: {
        items: [{ session: 'a1', relation: { kind: 'child', parent: 'a' }, toReference: 'child' }],
      },
    })
    expect(
      await sessions(a, { reference: sessionId('a'), filter: { toReference: 'child' } }),
    ).toEqual(['a2'])
  })

  it('denies a reference the tenant does not have, and one of another tenant alike', async () => {
    const a = await app()
    await tree(a)
    await a.create(TENANT_B, 'elsewhere')
    const denied = { failure: { kind: 'denied', action: 'directory.list' } }
    expect(await list(a, { reference: sessionId('nobody') })).toEqual(denied)
    expect(await list(a, { reference: sessionId('elsewhere') })).toEqual(denied)
    expect(await list(a, { filter: { toReference: 'child' } })).toEqual({
      failure: { kind: 'invalid', field: 'reference', reason: 'the filter names no reference' },
    })
    const unknown = { toReference: 'cousin' } as unknown as SessionListFilter
    expect(await list(a, { reference: sessionId('a'), filter: unknown })).toEqual({
      failure: { kind: 'invalid', field: 'filter.toReference', reason: 'not a relation' },
    })
  })

  it('binds a cursor to the filter it was made under', async () => {
    const a = await app()
    await tree(a)
    const filter = { kind: 'child' } as const
    const first = await list(a, { filter, limit: 2 })
    if (!('ok' in first) || first.ok.next === null) throw new Error('a second page was expected')
    const rest = await list(a, { filter, limit: 10, after: first.ok.next })
    expect(rest).toMatchObject({ ok: { next: null } })
    if (!('ok' in rest)) throw new Error('rest')
    const all = [...first.ok.items, ...rest.ok.items].map(item => item.session).sort()
    expect(all).toEqual(['a', 'a1', 'a2', 'b', 'b1'])
    expect(await list(a, { filter: { kind: 'main' }, limit: 10, after: first.ok.next })).toEqual({
      failure: { kind: 'invalid', field: 'after', reason: 'the cursor is of another filter' },
    })
  })
})

describe('the filters land on the indexes', () => {
  const plans = (a: App, filter: SessionListFilter, reference: string | null) => {
    const filters = listFilters({ filter }, reference === null ? null : place(a, reference))
    return listStatements({ tenant: textOf(TENANT_A), after: null }, filters).map(([sql, params]) =>
      port(a)
        .execute(`EXPLAIN QUERY PLAN ${sql}`, [...params, 10n])
        .rows.map(row => String(row[3]))
        .join(' | '),
    )
  }

  it.each([
    ['its children', { toReference: 'child' }, 'a', 'sl_session_list_parent_idx'],
    ['its siblings', { toReference: 'sibling' }, 'a', 'sl_session_list_parent_idx'],
    ['the layers below', { toReference: 'lower' }, 'r', 'sl_session_list_root_idx'],
    ['the layers above', { toReference: 'upper' }, 'a1', 'sl_session_list_root_idx'],
    ['the rest of its tree', { toReference: 'rest' }, 'a1', 'sl_session_list_root_idx'],
    ['one tree by its root', { root: sessionId('r') }, null, 'sl_session_list_root_idx'],
    ['one parent', { parent: sessionId('a') }, null, 'sl_session_list_parent_idx'],
  ] as const)('reads %s through an index of the list', async (_name, filter, reference, index) => {
    const a = await app()
    await tree(a)
    for (const plan of plans(a, filter, reference)) {
      expect(plan).toContain(`USING INDEX ${index}`)
      expect(plan).not.toMatch(/\bSCAN\b|SUBQUERY/u)
    }
  })

  it('reads what a session handed off through an index, never the whole table', async () => {
    const a = await app()
    await tree(a)
    for (const plan of plans(a, { toReference: 'handed-off' }, 'a')) {
      expect(plan).toMatch(/USING INDEX sl_session_list_(origin|activity)_idx/u)
      expect(plan).not.toMatch(/\bSCAN\b|SUBQUERY/u)
    }
  })
})

describe('a page of one tree costs the same among ten thousand other sessions', () => {
  const INSERT =
    "INSERT INTO sl_session_list (tenant, session, created_at, last_activity_at, lifecycle, title, version, relation_kind, parent, origin, root, depth, attendance, definition) VALUES (?, ?, ?, ?, 'dormant', NULL, 1, ?, ?, NULL, ?, ?, 'attended', 'assistant')"
  const at = (n: number) => `2026-01-01T00:${String(n % 60).padStart(2, '0')}:00.000Z`

  // One root, seven children, six grandchildren under each: fifty sessions.
  function seedTree(a: App): void {
    const tenant = textOf(TENANT_A)
    port(a).execute(INSERT, [tenant, 't', at(0), at(0), 'main', null, 't', 0n])
    for (let c = 0; c < 7; c += 1) {
      port(a).execute(INSERT, [tenant, `t-${c}`, at(c), at(c), 'child', 't', 't', 1n])
      for (let g = 0; g < 6; g += 1)
        port(a).execute(INSERT, [tenant, `t-${c}-${g}`, at(g), at(g), 'child', `t-${c}`, 't', 2n])
    }
  }

  function seedOthers(a: App, count: number): void {
    const tenant = textOf(TENANT_A)
    for (let n = 0; n < count; n += 1) {
      const id = `o-${String(n).padStart(5, '0')}`
      port(a).execute(INSERT, [tenant, id, at(n), at(n), 'main', null, id, 0n])
    }
  }

  // The least of many runs: what the read costs when nothing else holds the machine.
  function cost(a: App, filter: SessionListFilter): number {
    const filters = listFilters({ filter }, place(a, 't'))
    const statements = listStatements({ tenant: textOf(TENANT_A), after: null }, filters)
    let least = Number.POSITIVE_INFINITY
    for (let run = 0; run < 40; run += 1) {
      const started = performance.now()
      for (const [sql, params] of statements) port(a).execute(sql, [...params, 51n])
      least = Math.min(least, performance.now() - started)
    }
    return least
  }

  it.each([
    ['its children', { toReference: 'child' }, 7],
    ['the whole tree', { root: sessionId('t') }, 50],
  ] as const)(
    'reads %s in the same order of time with and without the others',
    { tags: ['slow'] },
    async (_name, filter, size) => {
      const alone = await app()
      seedTree(alone)
      const among = await app()
      seedTree(among)
      seedOthers(among, 10_000)
      const found = await sessions(among, { reference: sessionId('t'), filter, limit: 100 })
      expect(found).toHaveLength(size)
      expect(cost(among, filter) / cost(alone, filter)).toBeLessThan(10)
    },
  )
})
