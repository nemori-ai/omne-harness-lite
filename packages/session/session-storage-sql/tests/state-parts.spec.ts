// The state parts of the `execution-record` participant (session-adapters K-8): a write in parts
// replaces or drops only the parts it names, in the transaction of the rest of the publication;
// `replace` and a whole write each leave one form; `execution-record.parts` reads every part page by
// page, or the parts it names, in one snapshot per page and only of the tenant of the read.
import { describe, expect, it } from 'vitest'
import type { JsonValue, SqlIdentity } from '@omne-harness/sql-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  evidence,
  guard,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import type { SessionCommand } from '@omne-harness/session-contract'
import {
  decodeExecutionRecordParts,
  decodeExecutionRecordReply,
  executionRecordFacts,
  sessionCommandFacts,
  type ExecutionRecordPart,
  type ExecutionRecordWrite,
} from '../src/participants.ts'
import { sessionStorageMaterials } from '../src/materials.ts'
import { PART_PAGE_ROWS, PART_PAGE_TEXT } from '../src/worker/read-execution-parts.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'

const SESSION = sessionId('session-1')
const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

const identity = (operation: string, tenant: TenantId = TENANT_A): SqlIdentity => ({
  scope: { kind: 'tenant', tenant: textOf(tenant) },
  transactionDomain: tenant === TENANT_A ? 'dom_0' : 'dom_1',
  operation,
  protocolVersion: '2',
  operationKey: `${operation}#1`,
})

/** The n-th publication of execution `exe_1`, with the parts it names. */
function write(
  n: number,
  parts: readonly ExecutionRecordPart[],
  replace = false,
  tenant: TenantId = TENANT_A,
): ExecutionRecordWrite {
  return {
    tenant,
    session: SESSION,
    execution: 'exe_1',
    expected: n === 1 ? null : String(n - 1),
    revision: String(n),
    published: String(n - 1),
    operation: `aop_${n}`,
    digest: `sha256:${n}`,
    answer: { n },
    parts,
    replace,
    boundaries: [
      {
        execution: 'exe_1',
        revision: String(n),
        receipt: evidence(`agent/exe_1/${n}`),
        emittedThrough: '0',
        ended: null,
      },
    ],
    facts: [],
    batches: [],
    admissions: [],
  }
}

async function commit(a: App, name: string, facts: ExecutionRecordWrite, tenant = TENANT_A) {
  return a.provider.storage.commit({
    identity: identity(name, tenant),
    combinationVersion: 'c1',
    manifestDigest: 'a'.repeat(64),
    commands: [executionRecordFacts(facts)],
  })
}

async function read(a: App, input: Record<string, JsonValue>, tenant: TenantId = TENANT_A) {
  const result = await a.provider.storage.read({
    domain: {
      scope: { kind: 'tenant', tenant: textOf(tenant) },
      transactionDomain: tenant === TENANT_A ? 'dom_0' : 'dom_1',
    },
    handler: 'execution-record.parts',
    protocol: '1',
    requestKey: 'r',
    input: { tenant: textOf(tenant), session: SESSION, ...input },
  })
  if (result.kind !== 'read') throw new Error(`read: ${JSON.stringify(result)}`)
  const page = decodeExecutionRecordParts(result.output)
  if (page === null) throw new Error('the page does not decode')
  return page
}

/** Every part, following `next`; also how many pages it took. */
async function readAll(a: App, tenant: TenantId = TENANT_A) {
  const parts: { part: string; state: JsonValue }[] = []
  let after: string | null = null
  let pages = 0
  for (;;) {
    const page = await read(a, { after }, tenant)
    pages += 1
    parts.push(...page.parts)
    if (page.next === null) return { published: page.published, parts, pages }
    after = page.next
  }
}

const rows = (a: App, table: string) =>
  a.provider.select('dom_0', `SELECT * FROM ${table} ORDER BY 1, 2, 3`).rows

describe('the migration and the read handler of the state parts', () => {
  it('004-state-parts requires the records migration and its table is owned by execution-record', () => {
    const { migrations, participants, readHandlers } = sessionStorageMaterials()
    const found = migrations.find(item => item.id === '004-state-parts')
    expect(found?.owner).toBe('execution-record')
    expect(found?.requires).toEqual([{ owner: 'execution-record', id: '001-execution-record' }])
    const owner = participants.find(item => item.participant === 'execution-record')
    expect(owner?.ownedTables).toContain('er_state_part')
    const reader = readHandlers.find(item => item.handler === 'execution-record.parts')
    expect(reader?.readTables).toEqual(['er_root', 'er_state', 'er_state_part'])
    expect(reader?.requiresMigrations).toContainEqual({
      owner: 'execution-record',
      id: '004-state-parts',
    })
  })
})

describe('a write in parts', () => {
  it('replaces the parts it names, drops a part with a null state and leaves the others', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const first = await commit(
      a,
      'aop_1',
      write(1, [
        { part: 'x:exe_1', state: { v: 1 } },
        { part: 'o:exe_1', state: { v: 1 } },
        { part: 's', state: { v: 1 } },
      ]),
    )
    expect(first.kind).toBe('committed')
    const second = await commit(
      a,
      'aop_2',
      write(2, [
        { part: 'x:exe_1', state: { v: 2 } },
        { part: 's', state: null },
      ]),
    )
    expect(second.kind).toBe('committed')
    expect(await readAll(a)).toEqual({
      published: '2',
      pages: 1,
      parts: [
        { part: 'o:exe_1', state: { v: 1 } },
        { part: 'x:exe_1', state: { v: 2 } },
      ],
    })
    // A write in parts never writes the whole form.
    expect(rows(a, 'er_state')).toEqual([])
  })

  it('with replace, the parts are the whole state: every other part goes', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await commit(
      a,
      'aop_1',
      write(1, [
        { part: 'x:exe_0', state: 0 },
        { part: 'x:exe_1', state: 1 },
      ]),
    )
    expect((await commit(a, 'aop_2', write(2, [{ part: 'x:exe_2', state: 2 }], true))).kind).toBe(
      'committed',
    )
    expect((await readAll(a)).parts).toEqual([{ part: 'x:exe_2', state: 2 }])
    expect((await read(a, { since: '1' })).parts).toEqual([
      { part: 'x:exe_0', state: null },
      { part: 'x:exe_1', state: null },
      { part: 'x:exe_2', state: 2 },
    ])
  })

  it('a whole write drops every part, and the read gives its state on the first page', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await commit(a, 'aop_1', write(1, [{ part: 'x:exe_1', state: 1 }]))
    const { parts: _parts, replace: _replace, ...base } = write(2, [])
    expect((await commit(a, 'aop_2', { ...base, state: { whole: true } })).kind).toBe('committed')
    expect(await read(a, { after: null })).toEqual({
      published: '2',
      state: { whole: true },
      parts: [],
      next: null,
    })
    // The dropped part stays as a mark for a reader of an earlier count.
    expect(await read(a, { since: '1' })).toMatchObject({
      parts: [{ part: 'x:exe_1', state: null }],
    })
  })

  it('with since, a read gives only the parts written or dropped after that count', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await commit(
      a,
      'aop_1',
      write(1, [
        { part: 'a', state: 1 },
        { part: 'b', state: 1 },
        { part: 'c', state: 1 },
      ]),
    )
    await commit(a, 'aop_2', write(2, [{ part: 'b', state: 2 }]))
    await commit(a, 'aop_3', write(3, [{ part: 'c', state: null }]))
    expect((await read(a, { since: '0' })).parts).toEqual([
      { part: 'a', state: 1 },
      { part: 'b', state: 2 },
      { part: 'c', state: null },
    ])
    expect((await read(a, { since: '1' })).parts).toEqual([
      { part: 'b', state: 2 },
      { part: 'c', state: null },
    ])
    expect((await read(a, { since: '2' })).parts).toEqual([{ part: 'c', state: null }])
    expect((await read(a, { since: '3' })).parts).toEqual([])
    // Without since the dropped part is not read.
    expect((await readAll(a)).parts.map(item => item.part)).toEqual(['a', 'b'])
  })

  for (const [name, facts] of [
    ['both state and parts', { state: 1, parts: [] }],
    ['a part without a name', { parts: [{ part: '', state: 1 }] }],
    ['a part without a state', { parts: [{ part: 'x:exe_1' }] }],
    [
      'the same part twice',
      {
        parts: [
          { part: 'p', state: 1 },
          { part: 'p', state: 2 },
        ],
      },
    ],
    ['replace that is not a boolean', { parts: [], replace: 'yes' }],
    ['neither state nor parts', {}],
    ['an operation without a name', { parts: [], operation: '' }],
    ['a revision that is not a count', { parts: [], revision: 'one' }],
  ] as const)
    it(`${name} is unsupported and writes nothing`, async () => {
      const a = await app()
      ok(await a.create(TENANT_A))
      const valid = executionRecordFacts(write(1, []))
      const raw = valid.facts['write'] as Record<string, JsonValue>
      const { parts: _parts, replace: _replace, ...rest } = raw
      const result = await a.provider.storage.commit({
        identity: identity(`aop_bad_${name}`),
        combinationVersion: 'c1',
        manifestDigest: 'a'.repeat(64),
        commands: [
          {
            participant: valid.participant,
            facts: { intent: 'publish', write: { ...rest, ...(facts as object) } as JsonValue },
          },
        ],
      })
      expect(result.kind).toBe('rolled_back')
      if (result.kind !== 'rolled_back') return
      expect(decodeExecutionRecordReply(result.responses[0]!.reply).kind).toBe('unsupported')
      expect(rows(a, 'er_state_part')).toEqual([])
      expect(rows(a, 'er_operation')).toEqual([])
    })

  it('a failure after the parts are written leaves no part, no answer and no count, with the Session command of the same commit', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await commit(a, 'aop_1', write(1, [{ part: 'x:exe_1', state: 1 }]))
    const accept: SessionCommand = {
      kind: 'accept',
      input: {
        tenant: TENANT_A,
        session: SESSION,
        operation: operationId('accept-parts'),
        value: ordinaryInput('parts'),
      },
    }
    a.provider.failWrite(/INSERT INTO sl_operation/)
    const result = await a.provider.storage.commit({
      identity: identity('aop_2'),
      combinationVersion: 'c1',
      manifestDigest: 'a'.repeat(64),
      commands: [
        executionRecordFacts(
          write(2, [
            { part: 'x:exe_1', state: 2 },
            { part: 'o:exe_1', state: 2 },
          ]),
        ),
        sessionCommandFacts(accept, [guard('login', 'login-entry', 'present')]),
      ],
    })
    expect(result.kind).toBe('rolled_back')
    expect(await readAll(a)).toEqual({
      published: '1',
      pages: 1,
      parts: [{ part: 'x:exe_1', state: 1 }],
    })
  })
})

describe('reading the parts', () => {
  it('pages by part name within the row and text budget, and every part is read once', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const big = 'b'.repeat(PART_PAGE_TEXT / 3)
    const parts = Array.from({ length: PART_PAGE_ROWS + 6 }, (_, index) => ({
      part: `x:exe_${String(index).padStart(3, '0')}`,
      state: index < 6 ? big : index,
    }))
    expect((await commit(a, 'aop_1', write(1, parts))).kind).toBe('committed')
    const all = await readAll(a)
    expect(all.parts.map(item => item.part)).toEqual(parts.map(item => item.part))
    // Two big parts fill a page (a third would pass the text budget). The third page has the last
    // two big parts and small ones up to 64 rows; the last two small parts make the fourth page.
    expect(all.pages).toBe(4)
  })

  it('a part larger than the budget comes alone on its page', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const huge = 'h'.repeat(PART_PAGE_TEXT + 10)
    await commit(
      a,
      'aop_1',
      write(1, [
        { part: 'a', state: 1 },
        { part: 'b', state: huge },
        { part: 'c', state: 3 },
      ]),
    )
    const first = await read(a, { after: null })
    expect(first.parts.map(item => item.part)).toEqual(['a'])
    const second = await read(a, { after: first.next })
    expect(second.parts.map(item => item.part)).toEqual(['b'])
    expect(second.state).toBeNull()
  })

  it('reads only the parts it names', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await commit(
      a,
      'aop_1',
      write(1, [
        { part: 'x:exe_1', state: 1 },
        { part: 'o:exe_1', state: 2 },
        { part: 'x:exe_2', state: 3 },
      ]),
    )
    expect(await read(a, { parts: ['x:exe_1'] })).toEqual({
      published: '1',
      state: null,
      parts: [{ part: 'x:exe_1', state: 1 }],
      next: null,
    })
    expect((await read(a, { parts: ['x:none'] })).parts).toEqual([])
  })

  it('another tenant reads no part of this tenant, under the same session name', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await commit(a, 'aop_1', write(1, [{ part: 'x:exe_1', state: 'a' }]))
    expect(await read(a, { after: null }, TENANT_B)).toEqual({
      published: '0',
      state: null,
      parts: [],
      next: null,
    })
    expect(await read(a, { parts: ['x:exe_1'] }, TENANT_B)).toMatchObject({ parts: [] })
  })
})

// The rows of tenant B are planted in the domain of tenant A, with the session and part names of
// tenant A, so a statement without its tenant condition reaches them (defence in depth, as in
// `handler-tenant-filter.spec.ts`): the other test above cannot tell, because tenant B has its own
// domain there.
const OTHER = textOf(TENANT_B)
const OWN = textOf(TENANT_A)

function plantTenantB(a: App): void {
  const into = (sql: string, params: readonly (string | bigint)[]) =>
    a.provider.seed('dom_0', sql, params)
  into('INSERT INTO er_root (tenant, session, published) VALUES (?, ?, ?)', [OTHER, SESSION, 99n])
  into('INSERT INTO er_state (tenant, session, state) VALUES (?, ?, ?)', [
    OTHER,
    SESSION,
    '"b-whole"',
  ])
  for (const part of ['x:exe_1', 'x:exe_2'])
    into(
      'INSERT INTO er_state_part (tenant, session, part, state, published) VALUES (?, ?, ?, ?, ?)',
      [OTHER, SESSION, part, '"b"', 99n],
    )
}
const ofTenantB = (a: App, table: string) =>
  a.provider.select('dom_0', `SELECT * FROM ${table} WHERE tenant = ? ORDER BY 1, 2, 3`, [OTHER])
    .rows

describe('the tenant condition of the statements, with both tenants in one domain', () => {
  it('a read gives the count, the whole state and the parts of its own tenant only', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await commit(a, 'aop_1', write(1, [{ part: 'x:exe_1', state: 'a' }]))
    plantTenantB(a)
    // Each tenant reads its own; the one that has no whole state reads none, and the one that has
    // a part reads only its part, so neither the first page, the part list, nor `after` and
    // `since` cross over, whichever row the engine reaches first.
    expect(await read(a, {})).toEqual({
      published: '1',
      state: null,
      parts: [{ part: 'x:exe_1', state: 'a' }],
      next: null,
    })
    expect(await read(a, { parts: ['x:exe_1', 'x:exe_2'] })).toMatchObject({
      parts: [{ part: 'x:exe_1', state: 'a' }],
    })
    expect(await read(a, { after: 'x:exe_1' })).toMatchObject({ published: '1', parts: [] })
    expect((await read(a, { since: '0' })).parts).toEqual([{ part: 'x:exe_1', state: 'a' }])
    // Tenant B in the same domain: its own rows, and only those (the input names tenant B).
    const own = {
      published: '99',
      state: 'b-whole',
      parts: [
        { part: 'x:exe_1', state: 'b' },
        { part: 'x:exe_2', state: 'b' },
      ],
      next: null,
    }
    const other = await a.provider.storage.read({
      domain: { scope: { kind: 'tenant', tenant: OWN }, transactionDomain: 'dom_0' },
      handler: 'execution-record.parts',
      protocol: '1',
      requestKey: 'r',
      input: { tenant: OTHER, session: SESSION },
    })
    expect(other.kind === 'read' && decodeExecutionRecordParts(other.output)).toEqual(own)
  })

  it('a write replaces, drops and counts only the rows of its own tenant', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await commit(a, 'aop_1', write(1, [{ part: 'x:exe_1', state: 'a' }]))
    plantTenantB(a)
    const planted = {
      parts: ofTenantB(a, 'er_state_part'),
      whole: ofTenantB(a, 'er_state'),
      root: ofTenantB(a, 'er_root'),
    }
    expect(planted.parts).toHaveLength(2)
    // A write with replace deletes the whole form and drops every other part of tenant A ...
    expect(
      (await commit(a, 'aop_2', write(2, [{ part: 'x:exe_3', state: 'a3' }], true))).kind,
    ).toBe('committed')
    // ... and a whole write drops every part of tenant A.
    const { parts: _parts, replace: _replace, ...base } = write(3, [])
    expect((await commit(a, 'aop_3', { ...base, state: 'a-whole' })).kind).toBe('committed')
    expect({
      parts: ofTenantB(a, 'er_state_part'),
      whole: ofTenantB(a, 'er_state'),
      root: ofTenantB(a, 'er_root'),
    }).toEqual(planted)
    expect(await read(a, {})).toMatchObject({ published: '3', state: 'a-whole', parts: [] })
  })
})

describe('refused inputs of the parts read', () => {
  it('an input that names no session, an empty part list or an empty after is refused', async () => {
    const a = await app()
    for (const input of [
      { session: '' },
      { parts: [] },
      { after: '' },
      { parts: [''] },
      { since: '-1' },
      { since: 1 },
    ]) {
      // The handler throws; the test provider passes the throw on, a real one answers unavailable.
      const kind = await Promise.resolve()
        .then(() =>
          a.provider.storage.read({
            domain: {
              scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
              transactionDomain: 'dom_0',
            },
            handler: 'execution-record.parts',
            protocol: '1',
            requestKey: 'r',
            input: { tenant: textOf(TENANT_A), session: SESSION, ...input },
          }),
        )
        .then(
          result => result.kind,
          () => 'threw',
        )
      expect(kind, JSON.stringify(input)).not.toBe('read')
    }
  })
})
