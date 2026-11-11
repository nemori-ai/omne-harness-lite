// The Agent fact family (`er_fact`) and the content blocks (`sl_blob`) of the `execution-record`
// participant, over the node:sqlite test provider and over one migrated database. A publication
// appends one batch and the blocks it needs, all or nothing. Two gates guard a concurrent write:
// the publication count and the primary key; the envelope and event indexes keep one batch per
// operation and one row per event sequence. A tenant holds one block per digest. The reads give the
// batches after a publication, the open executions, the events after a sequence, one block and the
// batch of one operation; a session or a key of another tenant answers as if it did not exist.
import { readFileSync } from 'node:fs'
import type { JsonValue, SqlIdentity } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import type { TenantId } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { evidence, sessionId } from '@omne-harness/session-contract/testing'
import {
  blobDigest,
  decodeExecutionBlobsReply,
  decodeExecutionRecordBlob,
  decodeExecutionRecordEvents,
  decodeExecutionRecordFacts,
  decodeExecutionRecordOpen,
  decodeExecutionRecordOperation,
  decodeExecutionRecordReply,
  EXECUTION_BATCH_MAX_FACTS,
  EXECUTION_FACT_MAX_BYTES,
  executionRecordBlobFacts,
  executionRecordFacts,
  type ExecutionBlobRecord,
  type ExecutionFactRecord,
  type ExecutionRecordWrite,
} from '../src/participants.ts'
import { canonicalText } from '../src/codec.ts'
import { sessionStorageMaterials } from '../src/materials.ts'
import factBlobMigration from '../src/worker/fact-blob-migration.ts'
import executionRecord from '../src/worker/execution-record.ts'
import readBlob from '../src/worker/read-blob.ts'
import readExecutionBatches from '../src/worker/read-execution-batches.ts'
import readExecutionEvents from '../src/worker/read-execution-events.ts'
import readExecutionOpen from '../src/worker/read-execution-open.ts'
import readExecutionOperation from '../src/worker/read-execution-operation.ts'
import { app, TENANT_A, TENANT_B, TENANT_C, textOf, type App } from './fixtures/app.ts'
import { FIXTURE_READ_OUTPUT_LIMIT_BYTES } from './fixtures/read-limit.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const SESSION = 'session-1'

const block = (payload: string, media = 'application/json'): ExecutionBlobRecord => ({
  digest: blobDigest(payload),
  media,
  payload,
})

/** The envelope of publication `n` and, unless `event` is false, event `n` of the execution. */
function factsOf(n: number, execution: string, event = true): ExecutionFactRecord[] {
  const envelope: ExecutionFactRecord = { kind: 'batch', body: { n } }
  if (!event) return [envelope]
  return [
    envelope,
    {
      execution,
      kind: 'event',
      event: {
        sequence: String(n),
        source: evidence(`agent/${execution}/event/${String(n)}`),
        kinds: ['observed'],
        consequences: [{ kind: 'observed' }],
      },
      body: { event: n },
    },
  ]
}

/** Publication `n` (from 1) of execution `exe_1` in `session-1` of `tenant`. */
function nth(n: number, over: Partial<ExecutionRecordWrite> = {}): ExecutionRecordWrite {
  const execution = over.execution ?? 'exe_1'
  return {
    tenant: TENANT_A,
    session: sessionId(SESSION),
    execution,
    expected: n === 1 ? null : String(n - 1),
    revision: String(n),
    published: String(n - 1),
    operation: `aop_${String(n)}`,
    digest: `sha256:op-${String(n)}`,
    facts: factsOf(n, execution),
    blobs: [],
    boundaries: [
      {
        execution,
        revision: String(n),
        receipt: evidence(`agent/${execution}/${String(n)}`),
        emittedThrough: String(n),
        ended: null,
      },
    ],
    admissions: [],
    ...over,
  }
}

// ---------------------------------------------------------------------------------------------
// Over the test provider: one storage commit per publication

const identity = (name: string, tenant: TenantId = TENANT_A): SqlIdentity => ({
  scope: { kind: 'tenant', tenant: textOf(tenant) },
  transactionDomain: tenant === TENANT_A ? 'dom_0' : 'dom_1',
  operation: name,
  protocolVersion: '2',
  operationKey: `${name}#1`,
})

async function commit(a: App, write: ExecutionRecordWrite, name: string = write.operation) {
  const result = await a.provider.storage.commit({
    identity: identity(name, write.tenant),
    combinationVersion: 'c1',
    manifestDigest: 'a'.repeat(64),
    commands: [executionRecordFacts(write)],
  })
  if (result.kind !== 'committed' && result.kind !== 'rolled_back')
    throw new Error(`the commit did not end: ${JSON.stringify(result)}`)
  const reply = result.responses[0]?.reply
  if (reply === undefined) throw new Error('no reply')
  return { kind: result.kind, reply: decodeExecutionRecordReply(reply) }
}

async function read(a: App, handler: string, input: JsonValue, tenant: TenantId = TENANT_A) {
  const result = await a.provider.storage.read({
    domain: {
      scope: { kind: 'tenant', tenant: textOf(tenant) },
      transactionDomain: tenant === TENANT_A ? 'dom_0' : 'dom_1',
    },
    handler,
    protocol: '1',
    requestKey: 'r',
    input,
  })
  if (result.kind !== 'read') throw new Error(`read ${handler}: ${JSON.stringify(result)}`)
  return result.output
}

const count = (a: App, table: string, domain = 'dom_0'): number =>
  Number(a.provider.select(domain, `SELECT COUNT(*) AS n FROM ${table}`).rows[0]?.[0] ?? 0)

/** The rows of the Agent side of one domain that a failed commit must not leave. */
const agentRows = (a: App) => ({
  facts: count(a, 'er_fact'),
  blobs: count(a, 'sl_blob'),
  operations: count(a, 'er_operation'),
  roots: count(a, 'er_root'),
  heads: count(a, 'er_execution'),
})

async function session(tenant: TenantId = TENANT_A): Promise<App> {
  const a = await app()
  const created = await a.create(tenant, SESSION)
  if (!('ok' in created)) throw new Error('create failed')
  return a
}

const factsRead = async (a: App, after: string, execution?: string) =>
  decodeExecutionRecordFacts(
    await read(a, 'execution-record.facts', {
      tenant: textOf(TENANT_A),
      session: SESSION,
      after,
      ...(execution === undefined ? {} : { execution }),
    }),
  )

describe('the migration execution-record/006-fact-blob', () => {
  const materials = sessionStorageMaterials({
    readOutputLimitBytes: FIXTURE_READ_OUTPUT_LIMIT_BYTES,
  })

  it('runs after the migrations whose tables it drops', () => {
    const descriptor = materials.migrations.find(item => item.id === '006-fact-blob')
    expect(descriptor?.owner).toBe('execution-record')
    expect(descriptor?.requires.map(ref => ref.id).sort()).toEqual([
      '001-execution-record',
      '004-state-parts',
      '005-fact-body',
    ])
  })

  it('leaves er_fact and sl_blob, an er_operation without answer, and none of the retired tables', () => {
    const { port } = migratedPort()
    const names = port
      .execute(`SELECT name, sql FROM sqlite_schema WHERE type = 'table' LIMIT 100`)
      .rows.map(row => [String(row[0]), String(row[1])] as const)
    const tables = new Map(names)
    expect(tables.has('er_fact')).toBe(true)
    expect(tables.has('sl_blob')).toBe(true)
    for (const retired of [
      'er_state',
      'er_state_part',
      'er_fact_idx',
      'er_fact_body',
      'er_batch_idx',
    ])
      expect(tables.has(retired), retired).toBe(false)
    expect(tables.get('er_operation')).not.toMatch(/\banswer\b/)
    expect(factBlobMigration.verify(port as never)).toEqual({ kind: 'verified' })
  })

  it('verify fails on a database where it did not run', () => {
    const { port } = migratedPort()
    port.execute('DROP TABLE sl_blob')
    expect(factBlobMigration.verify(port as never).kind).toBe('failed')
  })

  it('the participant owns er_fact and sl_blob, and the session participant reads er_fact', () => {
    const record = materials.participants.find(value => value.participant === 'execution-record')
    const sessionParticipant = materials.participants.find(value => value.participant === 'session')
    expect(record?.ownedTables).toEqual(expect.arrayContaining(['er_fact', 'sl_blob']))
    expect(sessionParticipant?.readTables).toContain('er_fact')
    expect(sessionParticipant?.readTables).not.toContain('er_fact_idx')
  })
})

describe('one publication appends one batch', () => {
  it('writes the batch at the next publication, the envelope alone names the operation, and no answer is stored', async () => {
    const a = await session()
    const write = nth(1, { blobs: [block('{"content":"hello"}')] })
    expect(await commit(a, write)).toEqual({
      kind: 'committed',
      reply: { kind: 'published', published: '1', digest: 'sha256:op-1' },
    })
    const rows = a.provider.select(
      'dom_0',
      'SELECT pub, ord, execution, kind, eseq, op, kinds, event, body FROM er_fact ORDER BY pub, ord',
    ).rows
    expect(rows).toEqual([
      [1n, 0n, 'exe_1', 'batch', null, 'aop_1', '[]', null, '{"n":1}'],
      [
        1n,
        1n,
        'exe_1',
        'event',
        1n,
        null,
        '["observed"]',
        canonicalText({
          consequences: [{ kind: 'observed' }],
          control: null,
          source: evidence('agent/exe_1/event/1'),
        }),
        '{"event":1}',
      ],
    ])
    expect(a.provider.select('dom_0', 'SELECT * FROM er_operation').rows).toEqual([
      [textOf(TENANT_A), 'aop_1', SESSION, 'exe_1', 'sha256:op-1', 1n],
    ])
    expect(count(a, 'sl_blob')).toBe(1)
    expect(a.provider.select('dom_0', 'SELECT published FROM er_root').rows).toEqual([[1n]])
  })

  it('the participant only appends facts: no statement updates, replaces or deletes a fact row', () => {
    const source = readFileSync(
      new URL('../src/worker/execution-record.ts', import.meta.url),
      'utf8',
    )
    expect(source).toMatch(/'INSERT INTO er_fact \(/u)
    expect(source).not.toMatch(/(UPDATE|DELETE FROM|REPLACE INTO|OR IGNORE INTO) er_fact\b/u)
  })

  it('the statements of a later publication carry as many bytes as an earlier one: nothing is rewritten', () => {
    const { port } = migratedPort()
    const bytes: number[] = []
    for (let n = 1; n <= 50; n += 1) {
      let written = 0
      const counting = {
        ...port,
        execute: (sql: string, params: readonly SqlValue[] = []) => {
          if (!/^\s*SELECT/i.test(sql))
            written += params.reduce<number>(
              (total, value) => total + (typeof value === 'string' ? value.length : 8),
              0,
            )
          return port.execute(sql, params)
        },
      }
      // The same widths at every n: two-digit counts from the 10th publication on.
      const reply = executionRecord.execute(
        structuredClone(executionRecordFacts(nth(n)).facts) as never,
        counting as never,
      )
      expect(reply.kind).toBe('participated')
      bytes.push(written)
    }
    expect(bytes[49]).toBe(bytes[10])
  })

  it.each([
    ['no fact', { facts: [] }],
    [
      'more facts than a batch holds',
      {
        facts: Array.from({ length: EXECUTION_BATCH_MAX_FACTS + 1 }, (_, index) => ({
          kind: 'fact',
          body: index,
        })),
      },
    ],
    [
      'a body past the bound',
      { facts: [{ kind: 'batch', body: 'x'.repeat(EXECUTION_FACT_MAX_BYTES) }] },
    ],
    [
      'two events of one sequence',
      { facts: [...factsOf(1, 'exe_1'), ...factsOf(1, 'exe_1').slice(1)] },
    ],
    ['a block whose digest is not its payload', { blobs: [{ ...block('a'), payload: 'b' }] }],
  ] satisfies readonly (readonly [string, Partial<ExecutionRecordWrite>])[])(
    'refuses %s as unsupported and writes nothing',
    async (_, over) => {
      const a = await session()
      const result = await commit(a, nth(1, over))
      expect(result).toMatchObject({ kind: 'rolled_back', reply: { kind: 'unsupported' } })
      expect(agentRows(a)).toEqual({ facts: 0, blobs: 0, operations: 0, roots: 0, heads: 0 })
    },
  )

  it('a fact without a body or a kind is refused', () => {
    const { port } = migratedPort()
    const { facts } = executionRecordFacts(nth(1))
    const raw = facts['write'] as Readonly<Record<string, JsonValue>>
    for (const fact of [{ kind: 'batch' }, { body: 1 }, { kind: '', body: 1 }]) {
      const command = { ...facts, write: { ...raw, facts: [fact] } }
      expect(executionRecord.execute(command as never, port as never).kind).toBe('unsupported')
    }
    expect(port.execute('SELECT COUNT(*) FROM er_fact').rows).toEqual([[0n]])
  })

  it('a body at the bound is taken', async () => {
    const a = await session()
    // The body is a JSON text: two quotes around the characters.
    const body = 'x'.repeat(EXECUTION_FACT_MAX_BYTES - 2)
    expect((await commit(a, nth(1, { facts: [{ kind: 'batch', body }] }))).kind).toBe('committed')
  })
})

describe('the two gates of a concurrent write', () => {
  it('two writers prepared on one count: the second is a revision conflict, reads after its head and appends next', async () => {
    const a = await session()
    const first = nth(1, { operation: 'aop_writer_1', digest: 'sha256:w1' })
    const second = nth(1, {
      operation: 'aop_writer_2',
      digest: 'sha256:w2',
      facts: [{ kind: 'batch', body: { writer: 2 } }],
    })
    expect((await commit(a, first)).reply.kind).toBe('published')
    expect(await commit(a, second)).toEqual({
      kind: 'rolled_back',
      reply: { kind: 'revision-conflict', revision: '1', published: '1' },
    })
    // The loser reads only what it missed and prepares on the new head.
    const missed = await factsRead(a, '0')
    expect(missed?.kind === 'facts' ? missed.batches.map(batch => batch.operation) : null).toEqual([
      'aop_writer_1',
    ])
    expect(
      await commit(a, { ...second, expected: '1', revision: '2', published: '1' }, 'aop_writer_2b'),
    ).toEqual({
      kind: 'committed',
      reply: { kind: 'published', published: '2', digest: 'sha256:w2' },
    })
    expect(count(a, 'er_fact')).toBe(3)
  })

  it('a writer of another execution on a stale count is a revision conflict: the count is the gate of the session', async () => {
    const a = await session()
    expect((await commit(a, nth(1))).reply.kind).toBe('published')
    // A new execution: its head check passes (no head yet), only the count is stale.
    const other = nth(1, {
      execution: 'exe_2',
      operation: 'aop_other',
      digest: 'sha256:other',
      facts: factsOf(1, 'exe_2'),
      boundaries: [],
    })
    expect(await commit(a, other)).toEqual({
      kind: 'rolled_back',
      reply: { kind: 'revision-conflict', revision: null, published: '1' },
    })
    expect(count(a, 'er_fact')).toBe(2)
  })

  it('a write that passes the count check at a taken position collides on the primary key and leaves nothing', async () => {
    const a = await session()
    // A row at publication 1 whose count was not written: the count check passes, the key does not.
    a.provider.seed(
      'dom_0',
      `INSERT INTO er_fact (tenant, session, pub, ord, execution, kind, eseq, op, kinds, event, body)
       VALUES (?, ?, 1, 0, 'exe_0', 'batch', NULL, 'aop_seed', '[]', NULL, '{"seed":true}')`,
      [textOf(TENANT_A), SESSION],
    )
    const result = await commit(a, nth(1, { blobs: [block('{"collides":true}')] }))
    expect(result).toMatchObject({ kind: 'rolled_back', reply: { kind: 'failed' } })
    expect(agentRows(a)).toEqual({ facts: 1, blobs: 0, operations: 0, roots: 0, heads: 0 })
    expect(a.provider.select('dom_0', 'SELECT op, body FROM er_fact').rows).toEqual([
      ['aop_seed', '{"seed":true}'],
    ])
  })

  it('an operation with a batch is a conflict that names its digest and publication', async () => {
    const a = await session()
    await commit(a, nth(1))
    expect(
      await commit(a, nth(1, { published: '1', expected: '1', revision: '2' }), 'again'),
    ).toEqual({
      kind: 'rolled_back',
      reply: { kind: 'operation-conflict', digest: 'sha256:op-1', published: '1' },
    })
  })

  it('an operation whose key row is lost still has one batch: the envelope index refuses a second', async () => {
    const a = await session()
    await commit(a, nth(1))
    a.provider.seed('dom_0', 'DELETE FROM er_operation')
    const again = nth(1, {
      published: '1',
      expected: '1',
      revision: '2',
      facts: [{ kind: 'batch', body: { again: true } }],
    })
    expect(await commit(a, again, 'again')).toMatchObject({
      kind: 'rolled_back',
      reply: { kind: 'failed' },
    })
    expect(count(a, 'er_fact')).toBe(2)
  })

  it('an event sequence of an execution is written once', async () => {
    const a = await session()
    await commit(a, nth(1))
    const repeat = nth(2, { facts: factsOf(1, 'exe_1') })
    expect(await commit(a, repeat)).toMatchObject({
      kind: 'rolled_back',
      reply: { kind: 'failed' },
    })
    expect(count(a, 'er_fact')).toBe(2)
  })
})

describe('a failure inside the commit leaves neither the batch nor its blocks', () => {
  it.each([
    ['the second fact row', /INSERT INTO er_fact/u, 2],
    ['the block', /INSERT OR IGNORE INTO sl_blob/u, 1],
    ['the operation key', /INSERT INTO er_operation/u, 1],
    ['the head row', /INTO er_execution/u, 1],
    ['the publication count', /INTO er_root/u, 1],
  ] as const)('a failure at %s', async (_, pattern, nthStatement) => {
    const a = await session()
    const write = nth(1, { blobs: [block('{"content":"kept once"}')] })
    // A constraint failure: a data error, so the commit rolls back explicitly (sql-contract §7.6).
    a.provider.failWrite(pattern, nthStatement, 19)
    expect(await commit(a, write)).toMatchObject({ kind: 'rolled_back', reply: { kind: 'failed' } })
    expect(agentRows(a)).toEqual({ facts: 0, blobs: 0, operations: 0, roots: 0, heads: 0 })
    expect(await factsRead(a, '0')).toEqual({
      kind: 'facts',
      published: '0',
      batches: [],
      next: null,
    })
    expect((await commit(a, write, 'retry')).reply.kind).toBe('published')
    expect(agentRows(a)).toEqual({ facts: 2, blobs: 1, operations: 1, roots: 1, heads: 1 })
  })
})

describe('content blocks', () => {
  it('a tenant holds one row per digest: twice in one write, again later, and by the blocks intent', async () => {
    const a = await session()
    const one = block('{"content":"same"}')
    expect((await commit(a, nth(1, { blobs: [one, one] }))).kind).toBe('committed')
    expect((await commit(a, nth(2, { blobs: [one] }))).kind).toBe('committed')
    const stored = await a.provider.storage.commit({
      identity: identity('aop_blocks'),
      combinationVersion: 'c1',
      manifestDigest: 'a'.repeat(64),
      commands: [executionRecordBlobFacts({ tenant: TENANT_A, blobs: [one, block('other')] })],
    })
    if (stored.kind !== 'committed') throw new Error(JSON.stringify(stored))
    expect(decodeExecutionBlobsReply(stored.responses[0]!.reply)).toEqual({
      kind: 'stored',
      digests: [one.digest, blobDigest('other')],
    })
    expect(count(a, 'sl_blob')).toBe(2)
    expect(
      decodeExecutionRecordBlob(
        await read(a, 'execution-record.blob', { tenant: textOf(TENANT_A), digest: one.digest }),
      ),
    ).toEqual({
      kind: 'blob',
      digest: one.digest,
      media: 'application/json',
      size: String(Buffer.byteLength(one.payload)),
      payload: one.payload,
    })
  })

  it('blocks alone without a valid block are refused and write nothing', async () => {
    const a = await session()
    const refused = await a.provider.storage.commit({
      identity: identity('aop_blocks_bad'),
      combinationVersion: 'c1',
      manifestDigest: 'a'.repeat(64),
      commands: [
        executionRecordBlobFacts({ tenant: TENANT_A, blobs: [{ ...block('a'), payload: 'b' }] }),
      ],
    })
    expect(refused.kind).toBe('rolled_back')
    expect(count(a, 'sl_blob')).toBe(0)
  })
})

describe('the reads of the fact family', () => {
  it('after a publication: only the batches after it, whole, with the count of the snapshot', async () => {
    const a = await session()
    for (let n = 1; n <= 3; n += 1) await commit(a, nth(n))
    const page = await factsRead(a, '1')
    expect(page).toMatchObject({ kind: 'facts', published: '3', next: null })
    expect(page?.kind === 'facts' ? page.batches.map(batch => batch.published) : null).toEqual([
      '2',
      '3',
    ])
    expect(page?.kind === 'facts' ? page.batches[0] : null).toEqual({
      published: '2',
      operation: 'aop_2',
      facts: [
        {
          ord: 0,
          execution: 'exe_1',
          kind: 'batch',
          sequence: null,
          kinds: [],
          event: null,
          body: { n: 2 },
        },
        expect.objectContaining({ ord: 1, sequence: '2', kinds: ['observed'], body: { event: 2 } }),
      ],
    })
    expect(await factsRead(a, '3')).toEqual({
      kind: 'facts',
      published: '3',
      batches: [],
      next: null,
    })
  })

  it('a page holds whole batches: the batch the row bound cuts goes to the next page', () => {
    const { port } = migratedPort()
    seedSession(port, TENANT_A)
    const wide = (n: number) =>
      Array.from({ length: EXECUTION_BATCH_MAX_FACTS }, (_, index) => ({
        kind: index === 0 ? 'batch' : 'fact',
        body: { n, index },
      }))
    for (let n = 1; n <= 3; n += 1) publishOn(port, nth(n, { facts: wide(n) }))
    const first = decodeExecutionRecordFacts(
      handlerRead(port, readExecutionBatches, factsInput(TENANT_A, '0')),
    )
    expect(first?.kind === 'facts' ? first.batches.map(batch => batch.facts.length) : null).toEqual(
      [EXECUTION_BATCH_MAX_FACTS, EXECUTION_BATCH_MAX_FACTS],
    )
    expect(first).toMatchObject({ next: '2' })
    const second = decodeExecutionRecordFacts(
      handlerRead(port, readExecutionBatches, factsInput(TENANT_A, '2')),
    )
    expect(second).toMatchObject({ kind: 'facts', next: null })
    expect(second?.kind === 'facts' ? second.batches.map(batch => batch.published) : null).toEqual([
      '3',
    ])
  })

  it('a gap after the publication answers missing, not a shorter log', async () => {
    const a = await session()
    for (let n = 1; n <= 3; n += 1) await commit(a, nth(n))
    a.provider.seed('dom_0', 'DELETE FROM er_fact WHERE pub = 2')
    expect(await factsRead(a, '0')).toEqual({ kind: 'missing', published: '3' })
    // A batch without its envelope is a gap too.
    a.provider.seed('dom_0', 'DELETE FROM er_fact WHERE pub = 3 AND ord = 0')
    expect(await factsRead(a, '2')).toEqual({ kind: 'missing', published: '3' })
  })

  it('a session published before the fact family answers missing on every read', async () => {
    const a = await session()
    // What the migration leaves of an old session: its count and its head rows, no fact.
    a.provider.seed('dom_0', 'INSERT INTO er_root (tenant, session, published) VALUES (?, ?, 7)', [
      textOf(TENANT_A),
      SESSION,
    ])
    a.provider.seed(
      'dom_0',
      `INSERT INTO er_execution (tenant, execution, session, revision, receipt, emitted_through, ended)
       VALUES (?, 'exe_old', ?, 3, '{}', 3, NULL)`,
      [textOf(TENANT_A), SESSION],
    )
    const missing = { kind: 'missing', published: '7' }
    expect(await factsRead(a, '0')).toEqual(missing)
    expect(await factsRead(a, '0', 'exe_old')).toEqual(missing)
    expect(
      await read(a, 'execution-record.open-executions', {
        tenant: textOf(TENANT_A),
        session: SESSION,
      }),
    ).toEqual(missing)
    expect(
      await read(a, 'execution-record.events', {
        tenant: textOf(TENANT_A),
        session: SESSION,
        execution: 'exe_old',
        after: '0',
      }),
    ).toEqual(missing)
  })

  it('with an execution: only the facts of that execution, and the open executions without the ended one', async () => {
    const a = await session()
    await commit(a, nth(1))
    await commit(
      a,
      nth(2, {
        execution: 'exe_2',
        expected: null,
        revision: '1',
        operation: 'aop_e2',
        facts: factsOf(1, 'exe_2'),
        boundaries: [
          {
            execution: 'exe_2',
            revision: '1',
            receipt: evidence('agent/exe_2/1'),
            emittedThrough: '1',
            ended: null,
          },
        ],
      }),
    )
    await commit(
      a,
      nth(3, {
        expected: '1',
        revision: '2',
        boundaries: [
          {
            execution: 'exe_1',
            revision: '2',
            receipt: evidence('agent/exe_1/2'),
            emittedThrough: '3',
            ended: { sequence: '3', source: evidence('agent/exe_1/event/3') },
          },
        ],
      }),
    )
    const own = await factsRead(a, '0', 'exe_2')
    expect(own?.kind === 'facts' ? own.batches.map(batch => batch.published) : null).toEqual(['2'])
    expect(
      own?.kind === 'facts'
        ? own.batches.flatMap(batch => batch.facts.map(fact => fact.execution))
        : null,
    ).toEqual(['exe_2', 'exe_2'])
    expect(
      decodeExecutionRecordOpen(
        await read(a, 'execution-record.open-executions', {
          tenant: textOf(TENANT_A),
          session: SESSION,
        }),
      ),
    ).toEqual({
      kind: 'open',
      published: '3',
      executions: [
        {
          execution: 'exe_2',
          revision: '1',
          receipt: evidence('agent/exe_2/1'),
          emittedThrough: '1',
        },
      ],
      next: null,
    })
  })

  it('the events after a sequence, by the event index, with the head of the execution', () => {
    const { port } = migratedPort()
    seedSession(port, TENANT_A)
    for (let n = 1; n <= 5; n += 1) publishOn(port, nth(n))
    const rows: number[] = []
    const output = handlerRead(
      port,
      readExecutionEvents,
      { tenant: textOf(TENANT_A), session: SESSION, execution: 'exe_1', after: '3' },
      rows,
    )
    const page = decodeExecutionRecordEvents(output)
    expect(page).toMatchObject({ kind: 'events', revision: '5', emittedThrough: '5', next: null })
    expect(page?.kind === 'events' ? page.events.map(event => event.sequence) : null).toEqual([
      '4',
      '5',
    ])
    expect(page?.kind === 'events' ? page.events[0] : null).toEqual({
      sequence: '4',
      published: '4',
      ord: 1,
      kind: 'event',
      kinds: ['observed'],
      source: evidence('agent/exe_1/event/4'),
      consequences: [{ kind: 'observed' }],
      control: null,
      batch: null,
      body: { event: 4 },
    })
    // Gate (two point reads and the first batch), head, and the two events after the sequence.
    expect(rows.at(-1)).toBe(2)
  })

  it('the batch of an operation is read with its key; no answer is stored', async () => {
    const a = await session()
    await commit(a, nth(1))
    const found = decodeExecutionRecordOperation(
      await read(a, 'execution-record.operation', { tenant: textOf(TENANT_A), operation: 'aop_1' }),
    )
    expect(found).toMatchObject({
      digest: 'sha256:op-1',
      session: SESSION,
      execution: 'exe_1',
      published: '1',
    })
    expect(
      found !== null && found !== 'malformed' ? found.facts.map(fact => fact.ord) : null,
    ).toEqual([0, 1])
    expect(
      await read(a, 'execution-record.operation', {
        tenant: textOf(TENANT_A),
        operation: 'aop_none',
      }),
    ).toBeNull()
  })

  it('a session that does not exist and an execution of another session answer denied', async () => {
    const a = await session()
    await commit(a, nth(1))
    expect(
      await read(a, 'execution-record.facts', {
        tenant: textOf(TENANT_A),
        session: 'session-x',
        after: '0',
      }),
    ).toEqual({ kind: 'denied' })
    expect(
      await read(a, 'execution-record.open-executions', {
        tenant: textOf(TENANT_A),
        session: 'session-x',
      }),
    ).toEqual({ kind: 'denied' })
    expect(await a.create(TENANT_A, 'session-2')).toHaveProperty('ok')
    expect(
      await read(a, 'execution-record.events', {
        tenant: textOf(TENANT_A),
        session: 'session-2',
        execution: 'exe_1',
        after: '0',
      }),
    ).toEqual({ kind: 'denied' })
  })

  it('malformed inputs are refused, not read as the start', () => {
    const { port } = migratedPort()
    seedSession(port, TENANT_A)
    for (const input of [
      factsInput(TENANT_A, '-1'),
      factsInput(TENANT_A, '1.5'),
      { ...factsInput(TENANT_A, '0'), execution: '' },
    ])
      expect(() => handlerRead(port, readExecutionBatches, input)).toThrow('invalid input')
  })
})

// ---------------------------------------------------------------------------------------------
// Over one migrated database: two tenants share the tables, only the predicates keep them apart

type Port = ReturnType<typeof migratedPort>['port']
type Handler = typeof readExecutionBatches

function seedSession(port: Port, tenant: TenantId, name = SESSION): void {
  port.execute(
    `INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, 0, 0, '0')`,
    [textOf(tenant), name],
  )
}

function publishOn(port: Port, write: ExecutionRecordWrite): void {
  const reply = executionRecord.execute(
    structuredClone(executionRecordFacts(write).facts) as never,
    port as never,
  )
  expect(reply.kind).toBe('participated')
}

const factsInput = (tenant: TenantId, after: string) => ({
  tenant: textOf(tenant),
  session: SESSION,
  after,
})

function handlerRead(
  port: Port,
  module: Handler,
  input: JsonValue,
  rows: number[] = [],
): JsonValue {
  const outcome = module.read(input, {
    execute: (sql: string, params: readonly SqlValue[]) => {
      const result = port.execute(sql, params)
      rows.push(result.rows.length)
      return result
    },
  } as never)
  if (outcome.kind !== 'read') throw new Error('the handler did not read')
  return outcome.output
}

describe('another tenant in the same tables', () => {
  /** Tenants A and B each hold session-1, exe_1, operation aop_1 and one block of the same digest. */
  function shared() {
    const { port } = migratedPort()
    const one = block('{"content":"shared"}')
    for (const tenant of [TENANT_A, TENANT_B]) {
      seedSession(port, tenant)
      publishOn(
        port,
        nth(1, {
          tenant,
          blobs: [{ ...one, media: `text/${textOf(tenant).slice(0, 7)}` }],
          facts: [
            { kind: 'batch', body: { owner: textOf(tenant) } },
            { ...factsOf(1, 'exe_1')[1]!, body: { event: textOf(tenant) } },
          ],
        }),
      )
    }
    return { port, one }
  }

  it('each tenant reads its own rows of the same names', () => {
    const { port, one } = shared()
    for (const tenant of [TENANT_A, TENANT_B]) {
      const facts = decodeExecutionRecordFacts(
        handlerRead(port, readExecutionBatches, factsInput(tenant, '0')),
      )
      expect(facts?.kind === 'facts' ? facts.batches[0]?.facts[0]?.body : null).toEqual({
        owner: textOf(tenant),
      })
      const found = decodeExecutionRecordBlob(
        handlerRead(port, readBlob, { tenant: textOf(tenant), digest: one.digest }),
      )
      expect(found).toMatchObject({ media: `text/${textOf(tenant).slice(0, 7)}` })
      const operation = decodeExecutionRecordOperation(
        handlerRead(port, readExecutionOperation, { tenant: textOf(tenant), operation: 'aop_1' }),
      )
      expect(
        operation !== null && operation !== 'malformed' ? operation.facts[0]?.body : null,
      ).toEqual({
        owner: textOf(tenant),
      })
      const events = decodeExecutionRecordEvents(
        handlerRead(port, readExecutionEvents, {
          tenant: textOf(tenant),
          session: SESSION,
          execution: 'exe_1',
          after: '0',
        }),
      )
      expect(events?.kind === 'events' ? events.events.map(event => event.body) : null).toEqual([
        { event: textOf(tenant) },
      ])
      expect(
        port.execute('SELECT COUNT(*) FROM sl_blob WHERE tenant = ?', [textOf(tenant)]).rows,
      ).toEqual([[1n]])
    }
  })

  it('a tenant without the names gets the answers of names that do not exist', () => {
    const { port, one } = shared()
    const c = textOf(TENANT_C)
    expect(handlerRead(port, readExecutionBatches, factsInput(TENANT_C, '0'))).toEqual({
      kind: 'denied',
    })
    expect(handlerRead(port, readExecutionOpen, { tenant: c, session: SESSION })).toEqual({
      kind: 'denied',
    })
    expect(
      handlerRead(port, readExecutionEvents, {
        tenant: c,
        session: SESSION,
        execution: 'exe_1',
        after: '0',
      }),
    ).toEqual({ kind: 'denied' })
    expect(handlerRead(port, readBlob, { tenant: c, digest: one.digest })).toEqual({
      kind: 'denied',
    })
    expect(handlerRead(port, readExecutionOperation, { tenant: c, operation: 'aop_1' })).toBeNull()
  })

  it('a tenant with the session but not the execution or the block gets the answers of names that do not exist', () => {
    const { port, one } = shared()
    seedSession(port, TENANT_C)
    const c = textOf(TENANT_C)
    expect(
      decodeExecutionRecordFacts(
        handlerRead(port, readExecutionBatches, factsInput(TENANT_C, '0')),
      ),
    ).toEqual({
      kind: 'facts',
      published: '0',
      batches: [],
      next: null,
    })
    expect(handlerRead(port, readExecutionOpen, { tenant: c, session: SESSION })).toEqual({
      kind: 'open',
      published: '0',
      executions: [],
      next: null,
    })
    expect(
      handlerRead(port, readExecutionEvents, {
        tenant: c,
        session: SESSION,
        execution: 'exe_1',
        after: '0',
      }),
    ).toEqual({ kind: 'denied' })
    expect(handlerRead(port, readBlob, { tenant: c, digest: one.digest })).toEqual({
      kind: 'denied',
    })
  })

  it('a write of one tenant never meets the rows of another: its count, operation and block are its own', () => {
    const { port } = shared()
    // Tenant B's second publication: the count of B, the operation of B; A is unchanged.
    publishOn(port, nth(2, { tenant: TENANT_B, blobs: [block('{"content":"shared"}')] }))
    const counts = port.execute(
      'SELECT tenant, published FROM er_root ORDER BY tenant LIMIT 10',
    ).rows
    expect(new Map(counts.map(row => [String(row[0]), row[1]]))).toEqual(
      new Map([
        [textOf(TENANT_A), 1n],
        [textOf(TENANT_B), 2n],
      ]),
    )
  })
})
