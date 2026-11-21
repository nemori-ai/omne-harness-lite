import { describe, expect, it } from 'vitest'
import { creation, operationId, sessionId } from '@omne-harness/session-contract/testing'
import { canonicalText, sha256 } from '../src/codec.ts'
import { app, TENANT_A, type App } from './fixtures/app.ts'
import {
  childOf,
  count,
  DOMAIN,
  epochOf,
  messageText,
  remind,
  rowsOf,
  seedRows,
  T,
  tailOf,
  wholeOf,
} from './fixtures/forked.ts'

const ok = (answer: object, what: string): void => {
  if (!('ok' in answer)) throw new Error(`${what}: ${JSON.stringify(answer)}`)
}
const failureOf = (answer: object): unknown => ('failure' in answer ? answer.failure : answer)

async function source(rows: number): Promise<App> {
  const a = await app()
  ok(await a.create(TENANT_A), 'create the source')
  seedRows(a, 'session-1', rows)
  return a
}

const positions = (a: App, session: string): bigint[] =>
  a.provider
    .select(
      DOMAIN,
      'SELECT position FROM sl_entry WHERE tenant = ? AND session = ? ORDER BY position',
      [T, session],
    )
    .rows.map(row => BigInt(row[0] as bigint))

const segments = (a: App, session: string) =>
  a.provider.select(
    DOMAIN,
    'SELECT epoch, upto, src_session, src_epoch FROM sl_view_segment WHERE tenant = ? AND session = ? ORDER BY upto',
    [T, session],
  ).rows

describe('a forked session reads the rows of its source and writes none of them (SF-2, SF-5)', () => {
  it('shows the rows of the source up to the point and numbers its own entries after it (SF-3)', async () => {
    const a = await source(5)
    const point = await wholeOf(a, 'session-1')
    const prefix = (await rowsOf(a, 'session-1')).rows
    ok(await a.create(TENANT_A, 'child-1', childOf('session-1', point)), 'fork')
    const child = await rowsOf(a, 'child-1')
    expect(child.rows).toEqual(prefix)
    expect(child.basis).toEqual({ epoch: epochOf('child-1'), upper: '5' })
    expect(count(a, 'sl_model_view', 'child-1')).toBe(0n)
    expect(segments(a, 'child-1')).toEqual([['epoch:0', 5n, 'session-1', 'epoch:0']])
    const own = positions(a, 'child-1')
    expect(own[0]).toBe(BigInt(point.position) + 1n)
    expect(own.every(position => position > BigInt(point.position))).toBe(true)
  })

  it('takes the origin of the chain of its source for its compactions, and keeps it', async () => {
    const a = await source(3)
    const origin = (session: string) =>
      a.provider.select(
        DOMAIN,
        'SELECT origin FROM sl_compaction_head WHERE tenant = ? AND session = ?',
        [T, session],
      ).rows[0]?.[0]
    expect(origin('session-1')).toBe('1')
    ok(await remind(a, 'session-1', 'again'), 'a second batch of the source')
    expect(origin('session-1')).toBe('1')
    ok(
      await a.create(TENANT_A, 'child-1', childOf('session-1', await wholeOf(a, 'session-1'))),
      'fork',
    )
    expect(origin('child-1')).toBe('1')
    ok(await remind(a, 'child-1', 'own'), 'a second batch of the forked session')
    expect(origin('child-1')).toBe('1')
    ok(
      await a.create(TENANT_A, 'grand-1', childOf('child-1', await wholeOf(a, 'child-1'))),
      'layer 2',
    )
    expect(origin('grand-1')).toBe('1')
  })

  it('starts the prefix digest of a session without a source from nothing', async () => {
    const a = await source(0)
    ok(await remind(a, 'session-1', 'first'), 'remind')
    const [first] = (await rowsOf(a, 'session-1')).rows
    expect(first?.prefixDigest).toBe(
      sha256(
        canonicalText({
          prefix: '',
          entry: first?.entry,
          message: JSON.parse(JSON.stringify(first?.message)),
        }),
      ),
    )
  })

  it('goes on with the seq and the prefix digest of the last row of the prefix', async () => {
    const a = await source(3)
    const point = await wholeOf(a, 'session-1')
    ok(await a.create(TENANT_A, 'child-1', childOf('session-1', point)), 'fork')
    ok(await remind(a, 'child-1', 'own'), 'remind')
    const { rows } = await rowsOf(a, 'child-1')
    const [last, mine] = [rows[2], rows[3]]
    expect(mine).toMatchObject({ seq: '4', entry: String(positions(a, 'child-1').at(-1)) })
    expect(mine?.prefixDigest).toBe(
      sha256(
        canonicalText({
          prefix: last?.prefixDigest,
          entry: mine?.entry,
          message: JSON.parse(JSON.stringify(mine?.message)),
        }),
      ),
    )
    expect(count(a, 'sl_model_view', 'child-1')).toBe(1n)
  })

  it('writes the same rows for a prefix of 100 rows as for one of 10000, and reads no more', async () => {
    const measured = []
    // One create first: the worker keeps module-level caches that the first create of a process fills.
    const warm = await source(1)
    ok(
      await warm.create(
        TENANT_A,
        'child-1',
        childOf('session-1', await wholeOf(warm, 'session-1')),
      ),
      'warm',
    )
    for (const size of [100, 10_000]) {
      const a = await source(size)
      const point = await wholeOf(a, 'session-1')
      const before = { model: count(a, 'sl_model_view', 'session-1') }
      a.provider.participantWrites.length = 0
      a.provider.participantReads.length = 0
      ok(await a.create(TENANT_A, 'child-1', childOf('session-1', point)), 'fork')
      const writes = [...a.provider.participantWrites]
      const reads = [...a.provider.participantReads]
      expect(count(a, 'sl_model_view', 'session-1')).toBe(before.model)
      measured.push({
        statements: writes.map(write => write.sql),
        bytes: writes.reduce((sum, write) => sum + write.text, 0),
        reads: reads.map(read => read.sql),
        rowsRead: reads.reduce((sum, read) => sum + read.rows, 0),
      })
    }
    const [small, large] = measured
    expect(large?.statements).toEqual(small?.statements)
    expect(large?.reads).toEqual(small?.reads)
    expect(large?.rowsRead).toBe(small?.rowsRead)
    // The bytes differ by the digits of the numbers written (a position and a seq at most, each two
    // digits longer), never by a row of the prefix: one row of it is some forty bytes here.
    const digits = 4 * (large?.statements.length ?? 0)
    expect(Math.abs((large?.bytes ?? 0) - (small?.bytes ?? 0))).toBeLessThanOrEqual(digits)
  })

  it('leaves in the source what any child leaves: one entry of its log and no row of its view', async () => {
    const written = []
    for (const forked of [false, true]) {
      const a = await source(4)
      const point = await wholeOf(a, 'session-1')
      const before = {
        entries: count(a, 'sl_entry', 'session-1'),
        view: await rowsOf(a, 'session-1'),
      }
      a.provider.participantWrites.length = 0
      ok(await a.create(TENANT_A, 'child-1', childOf('session-1', forked ? point : null)), 'child')
      expect(count(a, 'sl_entry', 'session-1') - before.entries).toBe(1n)
      expect(await rowsOf(a, 'session-1')).toEqual(before.view)
      written.push(a.provider.participantWrites.map(write => write.sql.replace(/\s+/gu, ' ')))
    }
    const [plain, forked] = written as [string[], string[]]
    const extra = forked.filter(sql => !plain.includes(sql))
    expect(extra).toEqual([
      expect.stringContaining('INSERT INTO sl_fork'),
      expect.stringContaining('INSERT INTO sl_view_segment'),
    ])
    expect(forked.length - plain.length).toBe(2)
  })
})

describe('the prefix stays as it was, and is all there or not read at all (SF-1, SF-6)', () => {
  it('does not move while the source appends and is archived', async () => {
    const a = await source(4)
    const point = await wholeOf(a, 'session-1')
    ok(await a.create(TENANT_A, 'child-1', childOf('session-1', point)), 'fork')
    const before = await rowsOf(a, 'child-1')
    ok(await remind(a, 'session-1', 'later'), 'the source goes on')
    seedRows(a, 'session-1', 3, 'assistant')
    expect(await rowsOf(a, 'child-1')).toEqual(before)
    const archived = await a.port.commit({
      access: a.access(TENANT_A, 'session-1'),
      command: {
        kind: 'control',
        input: {
          tenant: TENANT_A,
          session: sessionId('session-1'),
          operation: 'sop_archive' as never,
          intent: { kind: 'archive' },
        },
      },
      guards: [],
    })
    ok(archived, 'archive the source')
    expect(await rowsOf(a, 'child-1')).toEqual(before)
  })

  it('pages through the rows of the source and its own with one cursor', async () => {
    const a = await source(6)
    const point = await wholeOf(a, 'session-1')
    ok(await a.create(TENANT_A, 'child-1', childOf('session-1', point)), 'fork')
    ok(await remind(a, 'child-1', 'one'), 'remind')
    ok(await remind(a, 'child-1', 'two'), 'remind')
    const whole = await rowsOf(a, 'child-1')
    const paged = await rowsOf(a, 'child-1', 90)
    expect(paged.rows).toEqual(whole.rows)
    expect(whole.rows.map(row => row.seq)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })

  it('gives a page two hundred rows at most, across the rows of the source and its own', async () => {
    const a = await source(205)
    ok(
      await a.create(TENANT_A, 'child-1', childOf('session-1', await wholeOf(a, 'session-1'))),
      'fork',
    )
    ok(await remind(a, 'child-1', 'own'), 'remind')
    const page = await a.port.history.readModelView({
      ...a.access(TENANT_A, 'child-1'),
      basis: null,
      after: null,
      pageBytes: 10_000_000,
    })
    if (!('ok' in page) || page.ok.kind !== 'page') throw new Error(JSON.stringify(page))
    expect(page.ok.rows).toHaveLength(200)
    expect(page.ok.next).not.toBeNull()
    expect((await rowsOf(a, 'child-1')).rows).toHaveLength(206)
  })

  it('answers unavailable, not a part of the view, when a row of the prefix cannot be read', async () => {
    const a = await source(4)
    const point = await wholeOf(a, 'session-1')
    ok(await a.create(TENANT_A, 'child-1', childOf('session-1', point)), 'fork')
    a.provider.seed(
      DOMAIN,
      "DELETE FROM sl_model_view WHERE tenant = ? AND session = 'session-1' AND seq = 2",
      [T],
    )
    const read = await a.port.history.readModelView({
      ...a.access(TENANT_A, 'child-1'),
      basis: null,
      after: null,
      pageBytes: 10_000_000,
    })
    expect(failureOf(read)).toMatchObject({ kind: 'unavailable' })
  })
})

describe('a create with a source is judged against what the source shows', () => {
  it.each([
    [
      'an epoch the source never had',
      (p: { epoch: string }) => ({ epoch: `${p.epoch}9` }),
      'unknown-epoch',
    ],
    ['the epoch of another session', () => ({ epoch: epochOf('child-1') }), 'unknown-epoch'],
    ['an upper bound past the view', () => ({ upper: '9' }), 'out-of-bounds'],
    [
      'a position past the log',
      (p: { position: string }) => ({ position: String(BigInt(p.position) + 1n) }),
      'out-of-bounds',
    ],
    ['a position below the prefix', () => ({ position: '2' }), 'out-of-bounds'],
    ['a point inside the view of an idle source', () => ({ upper: '3' }), 'not-a-boundary'],
  ] as const)('refuses %s and writes nothing', async (_name, change, reason) => {
    const a = await source(4)
    const point = await wholeOf(a, 'session-1')
    const entries = count(a, 'sl_entry', 'session-1')
    const answer = await a.create(
      TENANT_A,
      'child-1',
      childOf('session-1', { ...point, ...change(point) }),
    )
    expect(failureOf(answer)).toEqual({ kind: 'invalid', field: 'creation.fork.point', reason })
    expect(count(a, 'sl_fork', 'child-1')).toBe(0n)
    expect(count(a, 'sl_journal', 'child-1')).toBe(0n)
    expect(count(a, 'sl_entry', 'session-1')).toBe(entries)
  })

  it('refuses the whole view of a source whose Run is unfinished', async () => {
    const a = await source(3)
    ok(await a.accept(TENANT_A, 'session-1', 'first'), 'accept')
    const started = await a.port.commit({
      access: a.access(TENANT_A),
      command: {
        kind: 'startRun',
        input: {
          tenant: TENANT_A,
          session: sessionId('session-1'),
          operation: operationId('start'),
          entry: 'interactive',
          candidate: creation().definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [],
    })
    ok(started, 'start a Run of the source')
    const answer = await a.create(
      TENANT_A,
      'child-1',
      childOf('session-1', await wholeOf(a, 'session-1')),
    )
    expect(failureOf(answer)).toEqual({
      kind: 'invalid',
      field: 'creation.fork.point',
      reason: 'not-a-boundary',
    })
  })

  it('forks before an assistant message of a source', async () => {
    const a = await source(2)
    seedRows(a, 'session-1', 1, 'assistant')
    const whole = await wholeOf(a, 'session-1')
    const point = { ...whole, upper: '2' }
    ok(await a.create(TENANT_A, 'child-1', childOf('session-1', point)), 'fork')
    expect((await rowsOf(a, 'child-1')).rows).toEqual(
      (await rowsOf(a, 'session-1')).rows.slice(0, 2),
    )
  })

  it('forks from the epoch of the point after the source left it for a new one', async () => {
    const a = await source(2)
    seedRows(a, 'session-1', 1, 'assistant')
    const point = { ...(await wholeOf(a, 'session-1')), upper: '2' }
    const prefix = (await rowsOf(a, 'session-1')).rows.slice(0, 2)
    // The source compacts between the moment and the create: its journal names a new epoch.
    a.provider.seed(
      DOMAIN,
      "UPDATE sl_journal SET epoch = 'epoch:900' WHERE tenant = ? AND session = 'session-1'",
      [T],
    )
    a.provider.seed(
      DOMAIN,
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        T,
        'session-1',
        'epoch:900',
        1n,
        '900',
        1n,
        'd',
        messageText('user', 'what the new epoch kept'),
      ],
    )
    expect((await rowsOf(a, 'session-1')).basis.epoch).toBe(epochOf('session-1', 'epoch:900'))
    ok(
      await a.create(TENANT_A, 'child-1', childOf('session-1', point)),
      'fork of the epoch it left',
    )
    expect((await rowsOf(a, 'child-1')).rows).toEqual(prefix)
    expect(segments(a, 'child-1')).toEqual([['epoch:0', 2n, 'session-1', 'epoch:0']])
  })

  it('recalls the same create and keeps one source row', async () => {
    const a = await source(3)
    const point = await wholeOf(a, 'session-1')
    ok(await a.create(TENANT_A, 'child-1', childOf('session-1', point)), 'fork')
    const again = await a.create(TENANT_A, 'child-1', childOf('session-1', point))
    expect(again).toMatchObject({ ok: { receipt: { recovered: true } } })
    expect(count(a, 'sl_fork', 'child-1')).toBe(1n)
    expect(tailOf(a, 'child-1')).toBeGreaterThan(BigInt(point.position))
  })
})

describe('a session forked from a forked session stands on two segments at most (SF-5)', () => {
  it('copies the segment of its source and adds one, and reads three ranges', async () => {
    const a = await source(3)
    ok(
      await a.create(TENANT_A, 'child-1', childOf('session-1', await wholeOf(a, 'session-1'))),
      'layer 1',
    )
    ok(await remind(a, 'child-1', 'own'), 'remind')
    const middle = await wholeOf(a, 'child-1')
    expect(middle.upper).toBe('4')
    ok(await a.create(TENANT_A, 'grand-1', childOf('child-1', middle)), 'layer 2')
    expect(segments(a, 'grand-1')).toEqual([
      ['epoch:0', 3n, 'session-1', 'epoch:0'],
      ['epoch:0', 4n, 'child-1', 'epoch:0'],
    ])
    ok(await remind(a, 'grand-1', 'mine'), 'remind')
    const rows = (await rowsOf(a, 'grand-1')).rows
    expect(rows.slice(0, 4)).toEqual((await rowsOf(a, 'child-1')).rows)
    expect(rows.map(row => row.seq)).toEqual(['1', '2', '3', '4', '5'])
    expect(positions(a, 'grand-1').every(position => position > BigInt(middle.position))).toBe(true)
  })

  it('cuts the segment of its source when the point lies inside what the source inherited', async () => {
    const a = await source(1)
    seedRows(a, 'session-1', 1, 'assistant')
    seedRows(a, 'session-1', 1, 'user')
    seedRows(a, 'session-1', 1, 'assistant')
    const first = { ...(await wholeOf(a, 'session-1')), upper: '3' }
    ok(await a.create(TENANT_A, 'child-1', childOf('session-1', first)), 'layer 1')
    expect(segments(a, 'child-1')).toEqual([['epoch:0', 3n, 'session-1', 'epoch:0']])
    const inside = { ...(await wholeOf(a, 'child-1')), upper: '1' }
    ok(await a.create(TENANT_A, 'grand-1', childOf('child-1', inside)), 'layer 2')
    expect(segments(a, 'grand-1')).toEqual([['epoch:0', 1n, 'session-1', 'epoch:0']])
    expect((await rowsOf(a, 'grand-1')).rows).toEqual((await rowsOf(a, 'child-1')).rows.slice(0, 1))
  })
})

describe('what reading a view costs (C4)', () => {
  it('adds one primary key probe for a session without a source, and three statements at most with one', async () => {
    const a = await source(4)
    ok(
      await a.create(TENANT_A, 'child-1', childOf('session-1', await wholeOf(a, 'session-1'))),
      'layer 1',
    )
    ok(await remind(a, 'child-1', 'own'), 'remind')
    ok(
      await a.create(TENANT_A, 'grand-1', childOf('child-1', await wholeOf(a, 'child-1'))),
      'layer 2',
    )
    ok(await remind(a, 'grand-1', 'mine'), 'remind')
    const statements = async (session: string): Promise<string[]> => {
      a.provider.readSql.length = 0
      await rowsOf(a, session)
      return a.provider.readSql.map(sql => sql.replace(/\s+/gu, ' '))
    }
    const plain = await statements('session-1')
    const forked = await statements('grand-1')
    expect(plain).toHaveLength(4)
    expect(forked.length - plain.length).toBeLessThanOrEqual(3)
    const probe = plain.find(sql => sql.includes('sl_view_segment')) as string
    const plan = a.provider
      .select(DOMAIN, `EXPLAIN QUERY PLAN ${probe}`, [T, 'session-1', 'epoch:0'])
      .rows.map(row => String(row.at(-1)))
    expect(plan).toEqual([
      'SEARCH sl_view_segment USING PRIMARY KEY (tenant=? AND session=? AND epoch=?)',
    ])
  })
})
