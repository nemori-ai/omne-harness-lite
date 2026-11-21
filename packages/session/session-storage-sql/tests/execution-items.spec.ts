import type { JsonValue, SqlIdentity } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { evidence, sessionId } from '@omne-harness/session-contract/testing'
import {
  blobDigest,
  decodeExecutionRecordBlobs,
  decodeExecutionRecordItems,
  decodeExecutionRecordOpenItems,
  decodeExecutionRecordReply,
  executionRecordBlobFacts,
  executionRecordFacts,
  type ExecutionItemRecord,
  type ExecutionRecordWrite,
} from '../src/participants.ts'
import { sessionStorageMaterials } from '../src/materials.ts'
import { app, TENANT_A, textOf, type App } from './fixtures/app.ts'
import { FIXTURE_READ_OUTPUT_LIMIT_BYTES } from './fixtures/read-limit.ts'

const SESSION = 'session-1'
const EXECUTION = 'exe_1'

const identity = (name: string): SqlIdentity => ({
  scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
  transactionDomain: 'dom_0',
  operation: name,
  protocolVersion: '2',
  operationKey: `${name}#1`,
})

// The n-th publication of the execution, carrying the given item changes.
function nth(n: number, items: readonly ExecutionItemRecord[]): ExecutionRecordWrite {
  return {
    tenant: TENANT_A,
    session: sessionId(SESSION),
    execution: EXECUTION,
    settles: false,
    expected: n === 1 ? null : String(n - 1),
    revision: String(n),
    published: String(n - 1),
    operation: `aop_${String(n)}`,
    digest: `sha256:op-${String(n)}`,
    facts: [{ kind: 'batch', body: { n } }],
    blobs: [],
    items,
    boundaries: [
      {
        execution: EXECUTION,
        revision: String(n),
        receipt: evidence(`agent/${EXECUTION}/${String(n)}`),
        emittedThrough: '0',
        acknowledged: '0',
        ended: null,
      },
    ],
    admissions: [],
  }
}

const opened = (family: string, item: string, body: JsonValue = { item }): ExecutionItemRecord => ({
  family,
  item,
  change: 'opened',
  open: true,
  body,
})
const changed = (
  family: string,
  item: string,
  open: boolean,
  body: JsonValue = { item, open },
): ExecutionItemRecord => ({ family, item, change: 'changed', open, body })

async function session(): Promise<App> {
  const a = await app()
  const created = await a.create(TENANT_A, SESSION)
  if (!('ok' in created)) throw new Error('create failed')
  return a
}

async function publish(a: App, write: ExecutionRecordWrite) {
  const result = await a.provider.storage.commit({
    identity: identity(write.operation),
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

const scope = { tenant: textOf(TENANT_A), session: SESSION, execution: EXECUTION }

const openItems = async (a: App, after: JsonValue = null) =>
  decodeExecutionRecordOpenItems(await read(a, 'execution-record.open-items', { ...scope, after }))

const itemsOf = async (a: App, keys: readonly Readonly<{ family: string; item: string }>[]) =>
  decodeExecutionRecordItems(await read(a, 'execution-record.items', { ...scope, keys }))

const facts = (a: App): number =>
  Number(a.provider.select('dom_0', 'SELECT COUNT(*) FROM er_fact').rows[0]?.[0] ?? 0)

describe('the migration execution-record/007-item', () => {
  it('creates the item rows after the fact rows', () => {
    const materials = sessionStorageMaterials({
      readOutputLimitBytes: FIXTURE_READ_OUTPUT_LIMIT_BYTES,
    })
    const descriptor = materials.migrations.find(item => item.id === '007-item')
    expect(descriptor?.requires).toEqual([{ owner: 'execution-record', id: '006-fact-blob' }])
    const owner = materials.participants.find(item => item.participant === 'execution-record')
    expect(owner?.ownedTables).toContain('er_item')
    expect(owner?.ownedTables).toContain('er_item_content')
  })
})

describe('the items of an execution', () => {
  it('keeps the open items as the projection a cold load reads, at the head they were published at', async () => {
    const a = await session()
    expect(
      (await publish(a, nth(1, [opened('intent', 'a1'), opened('intent', 'a2')]))).reply,
    ).toMatchObject({
      kind: 'published',
      published: '1',
    })
    await publish(a, nth(2, [changed('intent', 'a1', false), opened('result', 'c1')]))
    const page = await openItems(a)
    expect(page).toEqual({
      kind: 'open',
      published: '2',
      items: [
        { family: 'intent', item: 'a2', open: true, pub: '1', body: { item: 'a2' } },
        { family: 'result', item: 'c1', open: true, pub: '2', body: { item: 'c1' } },
      ],
      next: null,
    })
  })

  it('reads a closed item by its original key and leaves out keys it never held', async () => {
    const a = await session()
    await publish(a, nth(1, [opened('intent', 'a1')]))
    await publish(a, nth(2, [changed('intent', 'a1', false, { closed: true })]))
    expect(
      await itemsOf(a, [
        { family: 'intent', item: 'a1' },
        { family: 'intent', item: 'never' },
      ]),
    ).toEqual({
      kind: 'items',
      published: '2',
      items: [{ family: 'intent', item: 'a1', open: false, pub: '2', body: { closed: true } }],
      rest: [],
    })
  })

  it('takes an item of any size its publication carries, and reads it back whole', async () => {
    const a = await session()
    const text = 'x'.repeat(200_000)
    expect(await publish(a, nth(1, [opened('answer', 'judge', { text })]))).toMatchObject({
      kind: 'committed',
    })
    const found = await itemsOf(a, [{ family: 'answer', item: 'judge' }])
    expect(found?.kind === 'items' ? found.items[0]?.body : null).toEqual({ text })
  })

  it('gives a page the items that fit its bytes, always the first, and names the rest', async () => {
    const a = await session()
    const big = (item: string) => opened('answer', item, { text: 'x'.repeat(2_200_000) })
    await publish(a, nth(1, [big('a'), big('b'), big('c')]))
    const keys = ['a', 'b', 'c', 'never'].map(item => ({ family: 'answer', item }))
    const first = await itemsOf(a, keys)
    if (first?.kind !== 'items') throw new Error('no page')
    expect(first.items.map(item => item.item)).toEqual(['a', 'b'])
    expect(first.rest).toEqual(keys.slice(2))
    const second = await itemsOf(a, first.rest)
    expect(second).toMatchObject({ kind: 'items', items: [{ item: 'c' }], rest: [] })

    const page = await openItems(a)
    if (page?.kind !== 'open') throw new Error('no page')
    expect(page.items.map(item => item.item)).toEqual(['a', 'b'])
    expect(page.next).toEqual({ family: 'answer', item: 'b' })
    expect(await openItems(a, page.next)).toMatchObject({ items: [{ item: 'c' }], next: null })
  })

  it('refuses the whole publication when it opens a key the execution already holds, open or closed', async () => {
    const a = await session()
    await publish(a, nth(1, [opened('intent', 'a1'), opened('intent', 'a2')]))
    await publish(a, nth(2, [changed('intent', 'a1', false)]))
    const before = facts(a)
    for (const [key, held] of [
      ['a1', 'closed'],
      ['a2', 'open'],
    ] as const) {
      const refused = await publish(a, {
        ...nth(3, [opened('result', 'c1'), opened('intent', key)]),
        operation: `aop_3_${key}`,
      })
      expect(refused.reply).toEqual({
        kind: 'item-conflict',
        execution: EXECUTION,
        family: 'intent',
        item: key,
        held,
      })
    }
    expect(facts(a)).toBe(before)
    expect(await itemsOf(a, [{ family: 'result', item: 'c1' }])).toMatchObject({ items: [] })
    expect(await openItems(a)).toMatchObject({ published: '2' })
  })

  it('changes only an open item: a closed or never opened one refuses the publication', async () => {
    const a = await session()
    await publish(a, nth(1, [opened('intent', 'a1')]))
    await publish(a, nth(2, [changed('intent', 'a1', false, { final: 1 })]))
    for (const [key, held] of [
      ['a1', 'closed'],
      ['never', 'none'],
    ] as const) {
      const refused = await publish(a, {
        ...nth(3, [changed('intent', key, true)]),
        operation: `aop_3_${key}`,
      })
      expect(refused.reply).toMatchObject({ kind: 'item-conflict', item: key, held })
    }
    expect(await itemsOf(a, [{ family: 'intent', item: 'a1' }])).toMatchObject({
      items: [{ open: false, pub: '2', body: { final: 1 } }],
    })
  })

  it('pages the open items after a key, every page naming the head it was read at', async () => {
    const a = await session()
    const many = Array.from({ length: 205 }, (_, index) =>
      opened('event', String(index).padStart(3, '0')),
    )
    await publish(a, nth(1, many))
    const first = await openItems(a)
    if (first?.kind !== 'open') throw new Error('no page')
    expect(first.items).toHaveLength(200)
    expect(first.next).toEqual({ family: 'event', item: '199' })
    const second = await openItems(a, first.next)
    expect(second).toMatchObject({ kind: 'open', published: '1', next: null })
    expect(second?.kind === 'open' ? second.items.map(item => item.item) : []).toEqual([
      '200',
      '201',
      '202',
      '203',
      '204',
    ])
  })

  it('reads the open items of the named families only', async () => {
    const a = await session()
    await publish(
      a,
      nth(1, [opened('exec', ''), opened('attachment', 'att-1'), opened('intent', 'a1')]),
    )
    const page = decodeExecutionRecordOpenItems(
      await read(a, 'execution-record.open-items', {
        ...scope,
        after: null,
        families: ['exec', 'attachment'],
      }),
    )
    expect(page?.kind === 'open' ? page.items.map(item => [item.family, item.item]) : []).toEqual([
      ['attachment', 'att-1'],
      ['exec', ''],
    ])
  })

  it('reads the closed items too when asked for all of them', async () => {
    const a = await session()
    await publish(a, nth(1, [opened('exec', ''), opened('intent', 'a1'), opened('intent', 'a2')]))
    await publish(a, { ...nth(2, [changed('intent', 'a1', false)]), operation: 'aop_close_a1' })
    const read2 = async (all: boolean) =>
      decodeExecutionRecordOpenItems(
        await read(a, 'execution-record.open-items', { ...scope, after: null, all }),
      )
    const open = await read2(false)
    const every = await read2(true)
    expect(open?.kind === 'open' ? open.items.map(item => item.item) : []).toEqual(['', 'a2'])
    expect(every?.kind === 'open' ? every.items.map(item => [item.item, item.open]) : []).toEqual([
      ['', true],
      ['a1', false],
      ['a2', true],
    ])
  })

  it('reads the items under a key prefix, closed ones too, and no item of another prefix', async () => {
    const a = await session()
    const key = (consumption: string, version: string) => JSON.stringify([consumption, version])
    await publish(
      a,
      nth(1, [
        opened('result', key('c1', 'placeholder')),
        opened('result', key('c1', 'v1')),
        opened('result', key('c10', 'v1')),
        opened('result', key('c2', 'v1')),
        opened('intent', key('c1', 'v1')),
      ]),
    )
    await publish(a, nth(2, [changed('result', key('c1', 'placeholder'), false)]))
    const under = async (prefix: string) => {
      const page = decodeExecutionRecordOpenItems(
        await read(a, 'execution-record.open-items', {
          ...scope,
          after: null,
          families: ['result'],
          all: true,
          under: prefix,
        }),
      )
      return page?.kind === 'open' ? page.items.map(item => [item.item, item.open]) : null
    }
    expect(await under('["c1",')).toEqual([
      [key('c1', 'placeholder'), false],
      [key('c1', 'v1'), true],
    ])
    expect(await under('["c3",')).toEqual([])
  })

  it('answers an execution of another session as denied', async () => {
    const a = await session()
    await publish(a, nth(1, [opened('intent', 'a1')]))
    const other = await a.create(TENANT_A, 'session-2')
    if (!('ok' in other)) throw new Error('create failed')
    expect(
      decodeExecutionRecordOpenItems(
        await read(a, 'execution-record.open-items', {
          ...scope,
          session: 'session-2',
          after: null,
        }),
      ),
    ).toEqual({ kind: 'denied' })
  })
})

describe('the content blocks by digest', () => {
  it('reads the stored blocks of one page and names the digests it does not hold', async () => {
    const a = await session()
    const payloads = ['{"a":1}', '{"b":2}']
    const stored = await a.provider.storage.commit({
      identity: identity('blocks'),
      combinationVersion: 'c1',
      manifestDigest: 'a'.repeat(64),
      commands: [
        executionRecordBlobFacts({
          tenant: TENANT_A,
          blobs: payloads.map(payload => ({
            digest: blobDigest(payload),
            media: 'application/json',
            payload,
          })),
        }),
      ],
    })
    expect(stored.kind).toBe('committed')
    const absent = blobDigest('{"c":3}')
    const page = decodeExecutionRecordBlobs(
      await read(a, 'execution-record.blobs', {
        tenant: textOf(TENANT_A),
        digests: [blobDigest(payloads[0]!), absent, blobDigest(payloads[1]!)],
      }),
    )
    expect(page).toEqual({
      kind: 'blobs',
      blobs: payloads.map(payload => ({
        digest: blobDigest(payload),
        media: 'application/json',
        size: String(payload.length),
        payload,
      })),
      missing: [absent],
      rest: [],
    })
  })

  it('keeps the content of an item by its key, outside the shared blocks, until a publication discards it', async () => {
    const a = await session()
    const payload = '{"request":"r1"}'
    const content = { family: 'material', item: 'm1', payload }
    await publish(a, { ...nth(1, [opened('material', 'm1')]), contents: [content] })
    const rows = (sql: string) => Number(a.provider.select('dom_0', sql).rows[0]?.[0] ?? -1)
    expect(rows('SELECT COUNT(*) FROM er_item_content')).toBe(1)
    expect(rows(`SELECT COUNT(*) FROM sl_blob WHERE digest = '${blobDigest(payload)}'`)).toBe(0)
    expect(await itemsOf(a, [{ family: 'material', item: 'm1' }])).toMatchObject({
      items: [{ family: 'material', item: 'm1', open: true, content: payload }],
    })
    expect(await openItems(a)).toMatchObject({ items: [{ item: 'm1', content: payload }] })
    await publish(a, {
      ...nth(2, [changed('material', 'm1', false)]),
      discards: [{ family: 'material', item: 'm1' }],
    })
    expect(rows('SELECT COUNT(*) FROM er_item_content')).toBe(0)
    expect(rows(`SELECT COUNT(*) FROM er_item WHERE item = 'm1'`)).toBe(1)
    const read = await itemsOf(a, [{ family: 'material', item: 'm1' }])
    expect(read?.kind === 'items' ? read.items[0] : null).toEqual({
      family: 'material',
      item: 'm1',
      open: false,
      pub: '2',
      body: { item: 'm1', open: false },
    })
  })
})
