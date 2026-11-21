import { describe, expect, it } from 'vitest'
import type { HistoryEntry, HistoryPage } from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import { writeEntries } from '../src/worker/commit-write.ts'
import readInheritedHistory from '../src/worker/read-inherited-history.ts'
import { app, TENANT_A, type App } from './fixtures/app.ts'
import { childOf, DOMAIN, remind, rowsOf, T, wholeOf } from './fixtures/forked.ts'
import { tree } from './fixtures/session-scenario.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const ok = (answer: object, what: string): void => {
  if (!('ok' in answer)) throw new Error(`${what}: ${JSON.stringify(answer)}`)
}

async function pages(a: App, session: string, inherited: boolean, pageBytes = 10_000_000) {
  const read: HistoryPage[] = []
  let answer = await a.port.history.begin({
    ...a.access(TENANT_A, session),
    kinds: [],
    from: null,
    direction: 'forward',
    pageBytes,
    ...(inherited ? { inherited: true as const } : {}),
  })
  for (;;) {
    if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
    read.push(answer.ok)
    if (answer.ok.next === null) return read
    answer = await a.port.history.next({ ...a.access(TENANT_A, session), cursor: answer.ok.next })
  }
}

const ids = (list: readonly HistoryPage[]) => list.flatMap(page => page.entries.map(e => e.id))
const ownIds = (a: App, session: string): string[] =>
  a.provider
    .select(
      DOMAIN,
      'SELECT position FROM sl_entry WHERE tenant = ? AND session = ? ORDER BY position',
      [T, session],
    )
    .rows.map(row => String(row[0]))

/** A source that told its model two things, a session forked from all of it, and one from that. */
async function chain() {
  const a = await app()
  ok(await a.create(TENANT_A), 'the source')
  ok(await remind(a, 'session-1', 'one'), 'remind')
  ok(await remind(a, 'session-1', 'two'), 'remind')
  ok(
    await a.create(TENANT_A, 'child-1', childOf('session-1', await wholeOf(a, 'session-1'))),
    'fork',
  )
  ok(await remind(a, 'child-1', 'three'), 'remind')
  ok(
    await a.create(TENANT_A, 'grand-1', childOf('child-1', await wholeOf(a, 'child-1'))),
    'layer 2',
  )
  ok(await remind(a, 'grand-1', 'four'), 'remind')
  return a
}

describe('a history read can name the prefix of a forked session (C8)', () => {
  it('gives the entries behind the prefix under the session they are from, then its own', async () => {
    const a = await chain()
    const prefix = (await rowsOf(a, 'session-1')).rows.map(row => String(row.entry))
    const [first, ...own] = await pages(a, 'child-1', true)
    expect(first?.from).toBe(sessionId('session-1'))
    expect(first?.entries.map(entry => entry.id)).toEqual(prefix)
    expect(first?.entries.map(entry => entry.kind)).toEqual([
      'message.system_reminder',
      'message.system_reminder',
    ])
    expect(JSON.stringify(first?.entries[1]?.payload)).toContain('two')
    expect(first).toMatchObject({ exhausted: false, annotations: [], scannedThrough: '0' })
    expect(own.every(page => page.from === undefined)).toBe(true)
    expect(ids(own)).toEqual(ownIds(a, 'child-1'))
    expect(own.at(-1)?.exhausted).toBe(true)
  })

  it('reads what it read before when the prefix is not asked for, and a session without a source the same', async () => {
    const a = await chain()
    const plain = await pages(a, 'child-1', false)
    expect(plain.every(page => page.from === undefined)).toBe(true)
    expect(ids(plain)).toEqual(ownIds(a, 'child-1'))
    expect(await pages(a, 'session-1', true)).toEqual(await pages(a, 'session-1', false))
  })

  it('names each source of a session forked from a forked session on a page of its own', async () => {
    const a = await chain()
    const [root, middle, ...own] = await pages(a, 'grand-1', true)
    expect(root?.from).toBe(sessionId('session-1'))
    expect(root?.entries).toHaveLength(2)
    expect(middle?.from).toBe(sessionId('child-1'))
    expect(JSON.stringify(middle?.entries.map(entry => entry.payload))).toContain('three')
    expect(middle?.entries).toHaveLength(1)
    expect(ids(own)).toEqual(ownIds(a, 'grand-1'))
  })

  it('pages through the prefix with one cursor, a page holding what fits', async () => {
    const a = await chain()
    const small = await pages(a, 'child-1', true, 1)
    const whole = await pages(a, 'child-1', true)
    expect(small.filter(page => page.from !== undefined)).toHaveLength(2)
    expect(ids(small)).toEqual(ids(whole))
  })

  it('refuses the prefix for a read that goes backward or starts in the middle', async () => {
    const a = await chain()
    const ask = {
      ...a.access(TENANT_A, 'child-1'),
      kinds: [],
      pageBytes: 1000,
      inherited: true as const,
    }
    const refusal = { kind: 'invalid', field: 'inherited', reason: 'only forward from the start' }
    expect(await a.port.history.begin({ ...ask, from: null, direction: 'backward' })).toEqual({
      failure: refusal,
    })
    const from = ownIds(a, 'child-1')[0] as never
    expect(await a.port.history.begin({ ...ask, from, direction: 'forward' })).toEqual({
      failure: refusal,
    })
    expect(
      await a.port.history.begin({ ...ask, from: null, direction: 'forward', pageBytes: 0 }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'pageBytes' } })
  })

  it('has no basis when an entry behind the prefix cannot be read', async () => {
    const a = await chain()
    const [lost] = (await rowsOf(a, 'session-1')).rows
    a.provider.seed(
      DOMAIN,
      'DELETE FROM sl_entry WHERE tenant = ? AND session = ? AND position = ?',
      [T, 'session-1', BigInt(String(lost?.entry))],
    )
    const read = await a.port.history.begin({
      ...a.access(TENANT_A, 'child-1'),
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 1000,
      inherited: true,
    })
    expect(read).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('the entries behind a prefix, read where each was written', () => {
  const message = (role: string) => ({
    id: 'msg_abcdefghijklmnopqrstuv',
    role,
    blocks: [{ kind: 'text', id: 't', text: role, visibility: { toModel: true, toHuman: true } }],
  })
  const SCHEMA = {
    owner: '@omne-harness/session-contract',
    name: 'session-log',
    revision: '5',
    digest: 'd',
  }
  const ORIGIN = {
    owner: 'session',
    via: null,
    source: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
  }

  function scene() {
    const { port, db } = migratedPort()
    const row = (
      session: string,
      seq: number,
      at: number,
      role: string,
      kind = `message.${role}`,
    ) => {
      const entry = {
        id: String(at),
        revision: '1',
        kind,
        schema: SCHEMA,
        payload: tree({ message: message(role) }),
        origin: ORIGIN,
      } as unknown as HistoryEntry
      expect(writeEntries(port, 't', session, [entry])).toBeNull()
      port.execute(
        'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['t', session, 'epoch:0', BigInt(seq), String(at), 1n, 'd', JSON.stringify(message(role))],
      )
    }
    for (const session of ['r', 'c'])
      port.execute(
        'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
        ['t', session, 9n, 9n, 'epoch:0'],
      )
    row('r', 1, 10, 'user', 'message.delivered')
    row('r', 2, 20, 'assistant')
    row('r', 3, 30, 'tool')
    port.execute('INSERT INTO sl_fork VALUES (?, ?, ?, ?, ?, ?, ?)', [
      't',
      'c',
      'r',
      'epoch:0',
      3n,
      35n,
      '10',
    ])
    port.execute('INSERT INTO sl_view_segment VALUES (?, ?, ?, ?, ?, ?)', [
      't',
      'c',
      'epoch:0',
      3n,
      'r',
      'epoch:0',
    ])
    row('c', 4, 40, 'user')
    const read = (session: string, after: string, kinds: readonly string[] = []) => {
      const input = { tenant: 't', session, after, pageBytes: 1_000_000, kinds: [...kinds] }
      const out = readInheritedHistory.read(input as never, port as never)
      return (out.kind === 'read' ? out.output : out) as Record<string, unknown>
    }
    return { port, db, read }
  }

  it('gives the rows after the one named, keeps to the kinds asked for, and ends where the prefix ends', () => {
    const s = scene()
    try {
      expect(s.read('c', '0')).toMatchObject({ kind: 'page', from: 'r', last: '3', upper: '9' })
      expect((s.read('c', '0')['entries'] as unknown[]).length).toBe(3)
      expect((s.read('c', '1')['entries'] as unknown[]).length).toBe(2)
      const tools = s.read('c', '0', ['message.tool'])
      expect(tools).toMatchObject({ kind: 'page', last: '3' })
      expect(tools['entries'] as string[]).toHaveLength(1)
      expect((tools['entries'] as string[])[0]).toContain('"kind":"message.tool"')
      const said = s.read('c', '0', ['message.user'])['entries'] as string[]
      expect(said).toHaveLength(1)
      expect(said[0]).toContain('"kind":"message.delivered"')
      expect(s.read('c', '3')).toEqual({ kind: 'none' })
      expect(s.read('r', '0')).toEqual({ kind: 'none' })
      expect(s.read('nobody', '0')).toEqual({ kind: 'absent' })
    } finally {
      s.db.close()
    }
  })

  it('does not answer a part of a prefix whose row or entry is lost', () => {
    const s = scene()
    try {
      s.port.execute("DELETE FROM sl_entry WHERE session = 'r' AND position = 20", [])
      expect(s.read('c', '0')).toEqual({ kind: 'unreadable' })
      s.port.execute("DELETE FROM sl_model_view WHERE session = 'r' AND seq = 2", [])
      expect(s.read('c', '0')).toEqual({ kind: 'unreadable' })
    } finally {
      s.db.close()
    }
  })

  it('refuses a request that is no such read', () => {
    const s = scene()
    try {
      const bad = (input: object) => () =>
        readInheritedHistory.read(input as never, s.port as never)
      const good = { tenant: 't', session: 'c', after: '0', pageBytes: 10, kinds: [] }
      for (const change of [
        { after: 'x' },
        { after: 1 },
        { kinds: 'all' },
        { pageBytes: 0 },
        { session: '' },
      ])
        expect(bad({ ...good, ...change })).toThrow('invalid input')
    } finally {
      s.db.close()
    }
  })
})
