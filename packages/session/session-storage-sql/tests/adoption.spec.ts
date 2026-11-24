import type { JsonValue, SqlIdentity } from '@omne-harness/sql-contract'
import { evidence, sessionId } from '@omne-harness/session-contract/testing'
import { describe, expect, it } from 'vitest'
import { canonicalText } from '../src/codec.ts'
import { sessionStorageMaterials } from '../src/materials.ts'
import {
  blobDigest,
  decodeExecutionRequestChoices,
  decodeExecutionSessionAdoption,
  decodeExecutionRecordReply,
  decodeExecutionSweepReply,
  executionRecordFacts,
  executionRecordSweepFacts,
  type ExecutionBlobRecord,
  type ExecutionRecordWrite,
} from '../src/participants.ts'
import adoptionMigration from '../src/worker/adoption-migration.ts'
import { app, TENANT_A, textOf, type App } from './fixtures/app.ts'
import { FIXTURE_READ_OUTPUT_LIMIT_BYTES } from './fixtures/read-limit.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const SESSION = 'session-1'

const block = (payload: string): ExecutionBlobRecord => ({
  digest: blobDigest(payload),
  media: 'application/json',
  payload,
})
const recordOf = (tag: string) => block(canonicalText({ fixed: tag }))
const adoptionOf = (tag: string) => ({
  fixed: evidence(`fixed/${tag}`),
  coverage: evidence(`coverage/${tag}`),
  schema: { owner: 'test', name: 'agent-context', revision: '1', digest: `schema-${tag}` },
})
const choicesOf = (tag: string): JsonValue[] => [
  { message: `msg-${tag}`, block: 'b-1', choice: 'derived', mediaType: 'image/png' },
]

type At = Readonly<{
  n: number
  execution: string
  revision: number
  settledBy?: string
}>

// Publication n of the session: revision `revision` of the execution, ending and settling it when settledBy is given.
function write(at: At, over: Partial<ExecutionRecordWrite> = {}): ExecutionRecordWrite {
  const { n, execution, revision } = at
  const settledBy = at.settledBy ?? null
  return {
    tenant: TENANT_A,
    session: sessionId(SESSION),
    execution,
    expected: revision === 1 ? null : String(revision - 1),
    revision: String(revision),
    published: String(n - 1),
    operation: `aop_${execution}_${String(revision)}`,
    digest: `sha256:${execution}-${String(revision)}`,
    facts: [
      { kind: 'batch', body: { n } },
      {
        execution,
        kind: 'event',
        event: {
          sequence: String(revision),
          source: evidence(`agent/${execution}/event/${String(revision)}`),
          kinds: ['observed'],
        },
        body: { event: revision },
      },
    ],
    blobs: [],
    items: [],
    boundaries: [
      {
        execution,
        revision: String(revision),
        receipt: evidence(`agent/${execution}/${String(revision)}`),
        emittedThrough: String(revision),
        acknowledged: settledBy === null ? '0' : String(revision),
        ended:
          settledBy === null
            ? null
            : { sequence: String(revision), source: evidence(`agent/${execution}/ended`) },
      },
    ],
    admissions: [],
    settledBy,
    ...over,
  }
}

const identity = (name: string): SqlIdentity => ({
  scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
  transactionDomain: 'dom_0',
  operation: name,
  protocolVersion: '2',
  operationKey: `${name}#1`,
})

async function commit(a: App, value: ExecutionRecordWrite) {
  const result = await a.provider.storage.commit({
    identity: identity(value.operation),
    combinationVersion: 'c1',
    manifestDigest: 'a'.repeat(64),
    commands: [executionRecordFacts(value)],
  })
  if (result.kind !== 'committed' && result.kind !== 'rolled_back')
    throw new Error(`the commit did not end: ${JSON.stringify(result)}`)
  const reply = result.responses[0]?.reply
  if (reply === undefined) throw new Error('no reply')
  return { kind: result.kind, reply: decodeExecutionRecordReply(reply) }
}

async function read(a: App, handler: string, input: JsonValue) {
  const result = await a.provider.storage.read({
    domain: { scope: { kind: 'tenant', tenant: textOf(TENANT_A) }, transactionDomain: 'dom_0' },
    handler,
    protocol: '1',
    requestKey: 'r',
    input,
  })
  if (result.kind !== 'read') throw new Error(`read ${handler}: ${JSON.stringify(result)}`)
  return result.output
}

const kept = async (a: App) =>
  decodeExecutionSessionAdoption(
    await read(a, 'execution-record.session-adoption', {
      tenant: textOf(TENANT_A),
      session: SESSION,
    }),
  )

const choicesFor = async (a: App, reference: string) =>
  decodeExecutionRequestChoices(
    await read(a, 'execution-record.request-choices', {
      tenant: textOf(TENANT_A),
      session: SESSION,
      reference,
    }),
  )

const count = (a: App, sql: string): number =>
  Number(a.provider.select('dom_0', sql).rows[0]?.[0] ?? -1)

async function session(): Promise<App> {
  const a = await app()
  const created = await a.create(TENANT_A, SESSION)
  if (!('ok' in created)) throw new Error('create failed')
  return a
}

const retainOf = (reference: string, pub: number, tag: string) => ({
  reference,
  pub: String(pub),
  digest: recordOf(tag).digest,
  adoption: adoptionOf(tag),
})

async function published(a: App, value: ExecutionRecordWrite) {
  const answer = await commit(a, value)
  expect(answer, value.operation).toMatchObject({
    kind: 'committed',
    reply: { kind: 'published' },
  })
}

describe('the session keeps its latest adoption when the execution that made it settles', () => {
  it('the settling publication moves the record block its retain names into the session, and the block of the execution leaves', async () => {
    const a = await session()
    await published(
      a,
      write(
        { n: 1, execution: 'exe_1', revision: 1 },
        { blobs: [recordOf('1')], choices: [{ reference: 'mcall_1', payload: choicesOf('1') }] },
      ),
    )
    expect(await kept(a)).toEqual({ kind: 'adoption', value: null })
    await published(
      a,
      write(
        { n: 2, execution: 'exe_1', revision: 2, settledBy: 'gen_1' },
        { retain: retainOf('mcall_1', 1, '1') },
      ),
    )
    expect(count(a, "SELECT COUNT(*) FROM er_block WHERE execution = 'exe_1'")).toBe(0)
    expect(count(a, "SELECT COUNT(*) FROM er_fact WHERE execution = 'exe_1'")).toBe(0)
    expect(await kept(a)).toEqual({
      kind: 'adoption',
      value: {
        reference: 'mcall_1',
        pub: '1',
        execution: 'exe_1',
        digest: recordOf('1').digest,
        media: 'application/json',
        payload: recordOf('1').payload,
        adoption: adoptionOf('1'),
      },
    })
    expect(await choicesFor(a, 'mcall_1')).toEqual({ kind: 'choices', value: choicesOf('1') })
    expect(await choicesFor(a, 'mcall_never')).toEqual({ kind: 'choices', value: null })
  })

  it('a later adoption replaces the kept one, an earlier one leaves it, and a block the settling publication writes itself is kept', async () => {
    const a = await session()
    await published(a, write({ n: 1, execution: 'exe_a', revision: 1 }, { blobs: [recordOf('a')] }))
    await published(a, write({ n: 2, execution: 'exe_b', revision: 1 }, { blobs: [recordOf('b')] }))
    await published(
      a,
      write(
        { n: 3, execution: 'exe_b', revision: 2, settledBy: 'gen_1' },
        { retain: retainOf('mcall_b', 2, 'b') },
      ),
    )
    expect((await kept(a))?.value).toMatchObject({ reference: 'mcall_b', pub: '2' })
    await published(
      a,
      write(
        { n: 4, execution: 'exe_a', revision: 2, settledBy: 'gen_1' },
        { retain: retainOf('mcall_a', 1, 'a') },
      ),
    )
    expect((await kept(a))?.value).toMatchObject({
      reference: 'mcall_b',
      pub: '2',
      execution: 'exe_b',
      payload: recordOf('b').payload,
      adoption: adoptionOf('b'),
    })
    await published(
      a,
      write(
        { n: 5, execution: 'exe_c', revision: 1, settledBy: 'gen_1' },
        { blobs: [recordOf('c')], retain: retainOf('mcall_c', 5, 'c') },
      ),
    )
    expect((await kept(a))?.value).toMatchObject({
      reference: 'mcall_c',
      pub: '5',
      execution: 'exe_c',
      payload: recordOf('c').payload,
      adoption: adoptionOf('c'),
    })
  })

  it('a settle without retain and the sweep of the next writer generation leave both tables as they are', async () => {
    const a = await session()
    await published(
      a,
      write(
        { n: 1, execution: 'exe_a', revision: 1, settledBy: 'gen_1' },
        {
          blobs: [recordOf('a')],
          choices: [{ reference: 'mcall_a', payload: choicesOf('a') }],
          retain: retainOf('mcall_a', 1, 'a'),
        },
      ),
    )
    const before = await kept(a)
    await published(
      a,
      write(
        { n: 2, execution: 'exe_b', revision: 1, settledBy: 'gen_1' },
        { blobs: [recordOf('b')] },
      ),
    )
    expect(await kept(a)).toEqual(before)
    const swept = await a.provider.storage.commit({
      identity: identity('sweep-gen_2'),
      combinationVersion: 'c1',
      manifestDigest: 'a'.repeat(64),
      commands: [executionRecordSweepFacts(TENANT_A, 'gen_2')],
    })
    if (swept.kind !== 'committed') throw new Error(`the sweep did not commit: ${swept.kind}`)
    expect(decodeExecutionSweepReply(swept.responses[0]!.reply)).toEqual({
      kind: 'swept',
      swept: '2',
    })
    expect(await kept(a)).toEqual(before)
    expect(before?.value).toMatchObject({ reference: 'mcall_a', execution: 'exe_a' })
    expect(await choicesFor(a, 'mcall_a')).toEqual({ kind: 'choices', value: choicesOf('a') })
  })
})

describe('the choices of a model call are written once', () => {
  it('the same choices again are taken; other choices fail the publication and nothing of it lands', async () => {
    const a = await session()
    const choices = (tag: string) => [{ reference: 'mcall_1', payload: choicesOf(tag) }]
    await published(a, write({ n: 1, execution: 'exe_1', revision: 1 }, { choices: choices('1') }))
    await published(a, write({ n: 2, execution: 'exe_1', revision: 2 }, { choices: choices('1') }))
    const refused = await commit(
      a,
      write({ n: 3, execution: 'exe_1', revision: 3 }, { choices: choices('2') }),
    )
    expect(refused.kind).toBe('rolled_back')
    expect(refused.reply).toMatchObject({ kind: 'failed' })
    expect(JSON.stringify(refused.reply)).toContain('mcall_1')
    expect(count(a, 'SELECT MAX(published) FROM er_root')).toBe(2)
    expect(await choicesFor(a, 'mcall_1')).toEqual({ kind: 'choices', value: choicesOf('1') })
  })
})

describe('a retain is a defect outside a settle that holds its block', () => {
  it('a retain without a settle is malformed, and one naming no block of the execution fails the settle', async () => {
    const a = await session()
    await published(a, write({ n: 1, execution: 'exe_o', revision: 1 }, { blobs: [recordOf('a')] }))
    await published(a, write({ n: 2, execution: 'exe_1', revision: 1 }))
    const unsettled = await commit(
      a,
      write({ n: 3, execution: 'exe_1', revision: 2 }, { retain: retainOf('mcall_a', 1, 'a') }),
    )
    expect(unsettled.reply).toEqual({
      kind: 'unsupported',
      reason: 'the publication is malformed: a retained adoption without settling',
    })
    const blockless = await commit(
      a,
      write(
        { n: 3, execution: 'exe_1', revision: 2, settledBy: 'gen_1' },
        { operation: 'aop_exe_1_settle', retain: retainOf('mcall_a', 1, 'a') },
      ),
    )
    expect(blockless.kind).toBe('rolled_back')
    expect(blockless.reply).toMatchObject({ kind: 'failed' })
    expect(JSON.stringify(blockless.reply)).toContain('no block of the execution')
    expect(count(a, "SELECT COUNT(*) FROM er_fact WHERE execution = 'exe_1'")).toBeGreaterThan(0)
    expect(
      count(a, "SELECT COUNT(*) FROM er_execution WHERE execution = 'exe_1' AND settled IS NULL"),
    ).toBe(1)
    expect(await kept(a)).toEqual({ kind: 'adoption', value: null })
  })
})

describe('a retained record kept in the shared blocks of the tenant', () => {
  it('the settle copies it from sl_blob into the session and leaves the shared row where it is', async () => {
    const a = await session()
    const shared = { ...recordOf('s'), shared: true }
    await published(a, write({ n: 1, execution: 'exe_1', revision: 1 }, { blobs: [shared] }))
    expect(count(a, "SELECT COUNT(*) FROM er_block WHERE execution = 'exe_1'")).toBe(0)
    const sharedRows = `SELECT COUNT(*) FROM sl_blob WHERE digest = '${shared.digest}'`
    expect(count(a, sharedRows)).toBe(1)
    await published(
      a,
      write(
        { n: 2, execution: 'exe_1', revision: 2, settledBy: 'gen_1' },
        { retain: retainOf('mcall_s', 1, 's') },
      ),
    )
    expect(await kept(a)).toEqual({
      kind: 'adoption',
      value: {
        reference: 'mcall_s',
        pub: '1',
        execution: 'exe_1',
        digest: shared.digest,
        media: 'application/json',
        payload: shared.payload,
        adoption: adoptionOf('s'),
      },
    })
    expect(count(a, sharedRows)).toBe(1)
  })

  it('a retained digest in neither the blocks of the execution nor the shared ones refuses the settle, and nothing of it lands', async () => {
    const a = await session()
    await published(a, write({ n: 1, execution: 'exe_1', revision: 1 }))
    const refused = await commit(
      a,
      write(
        { n: 2, execution: 'exe_1', revision: 2, settledBy: 'gen_1' },
        { retain: retainOf('mcall_none', 1, 'none') },
      ),
    )
    expect(refused.kind).toBe('rolled_back')
    expect(refused.reply).toMatchObject({ kind: 'failed' })
    expect(JSON.stringify(refused.reply)).toContain(recordOf('none').digest)
    expect(count(a, 'SELECT MAX(published) FROM er_root')).toBe(1)
    expect(
      count(a, "SELECT COUNT(*) FROM er_execution WHERE execution = 'exe_1' AND settled IS NULL"),
    ).toBe(1)
    expect(await kept(a)).toEqual({ kind: 'adoption', value: null })
  })
})

describe('the migration execution-record/009-adoption', () => {
  const materials = sessionStorageMaterials({
    readOutputLimitBytes: FIXTURE_READ_OUTPUT_LIMIT_BYTES,
  })

  it('runs after the blocks, the participant owns both tables, and the reads need it', () => {
    const descriptor = materials.migrations.find(item => item.id === '009-adoption')
    expect(descriptor?.owner).toBe('execution-record')
    expect(descriptor?.requires.map(ref => ref.id)).toEqual(['008-block'])
    const record = materials.participants.find(value => value.participant === 'execution-record')
    expect(record?.ownedTables).toEqual(
      expect.arrayContaining(['er_session_adoption', 'er_request_choice']),
    )
    for (const handler of [
      'execution-record.session-adoption',
      'execution-record.request-choices',
    ]) {
      const read = materials.readHandlers.find(item => item.handler === handler)
      expect(
        read?.requiresMigrations.map(ref => ref.id),
        handler,
      ).toEqual(['009-adoption'])
    }
  })

  it('verify holds where it ran and fails where a table is missing', () => {
    const { port } = migratedPort()
    expect(adoptionMigration.verify(port as never)).toEqual({ kind: 'verified' })
    port.execute('DROP TABLE er_request_choice')
    expect(adoptionMigration.verify(port as never).kind).toBe('failed')
  })
})
