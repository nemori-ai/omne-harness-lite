import { expect, it } from 'vitest'
import readForkPoint, { FORK_POINT_WINDOW } from '../src/worker/read-fork-point.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const rowId = (seq: number) => `msg_row_${seq}`
const text = (role: string, seq: number) =>
  JSON.stringify({
    id: rowId(seq),
    role,
    blocks: [{ kind: 'text', id: 't', text: role, visibility: { toModel: true, toHuman: true } }],
  })

function scene(roles: readonly string[], epoch = 'epoch:0') {
  const { port, db } = migratedPort()
  const statements: string[] = []
  const counted = {
    ...port,
    execute: (sql: string, params?: readonly never[]) => {
      statements.push(sql)
      return port.execute(sql, params)
    },
  }
  port.execute(
    'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
    ['t', 's', 9n, 9n, epoch],
  )
  for (const [index, role] of roles.entries()) {
    const position = BigInt(10 * (index + 1))
    port.execute(
      'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['t', 's', position, 1n, `message.${role}`, new Uint8Array([0]), 1n],
    )
    port.execute(
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        't',
        's',
        epoch,
        BigInt(index + 1),
        String(position),
        1n,
        'd',
        role === 'compaction' ? 'sha256:summary' : text(role, index + 1),
      ],
    )
  }
  // One entry more than the view has rows: the position of a point is the tail of the log.
  port.execute(
    'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['t', 's', BigInt(10 * roles.length + 5), 1n, 'call.bound', new Uint8Array([0]), 1n],
  )
  const read = (asking: string) => {
    statements.length = 0
    const out = readForkPoint.read({ tenant: 't', session: 's', asking }, counted as never)
    return { out: out.kind === 'read' ? out.output : out, statements: [...statements] }
  }
  return { port, db, read }
}

it('answers the rows before the asking message and the tail of the log, whatever the session wrote after it', () => {
  const s = scene(['user', 'assistant', 'tool', 'assistant', 'tool', 'tool'])
  try {
    expect(s.read(rowId(4)).out).toEqual({
      kind: 'point',
      point: { epoch: 'epoch:0', upper: '3', position: '65' },
    })
    expect(s.read(rowId(2)).out).toEqual({
      kind: 'point',
      point: { epoch: 'epoch:0', upper: '1', position: '65' },
    })
  } finally {
    s.db.close()
  }
})

it('reads the same few rows however long the view before them is', () => {
  const few = scene(['user', 'assistant', 'tool'])
  const long = scene([...Array.from({ length: 10_000 }, () => 'user'), 'assistant', 'tool'])
  try {
    const [a, b] = [few.read(rowId(2)), long.read(rowId(10_001))]
    expect(a.out).toMatchObject({ kind: 'point', point: { upper: '1' } })
    expect(b.out).toMatchObject({ kind: 'point', point: { upper: '10000', position: '100025' } })
    expect(b.statements).toEqual(a.statements)
    expect(a.statements).toHaveLength(4)
    const window = long.port.execute(
      `EXPLAIN QUERY PLAN ${b.statements.find(sql => sql.includes('sl_model_view'))}`,
      ['t', 's', 'epoch:0', 0n, BigInt(FORK_POINT_WINDOW)] as never,
    )
    const plan = window.rows.map(row => String(row.at(-1))).join('; ')
    expect(plan).toBe(
      'SEARCH sl_model_view USING INDEX sqlite_autoindex_sl_model_view_1 (tenant=? AND session=? AND epoch=?)',
    )
  } finally {
    few.db.close()
    long.db.close()
  }
})

it('names no point where the asking message is not an assistant message among the newest rows', () => {
  const none = scene(['user'])
  const summary = scene(['compaction', 'user'], 'epoch:5')
  const far = scene([
    'user',
    'assistant',
    ...Array.from({ length: FORK_POINT_WINDOW }, () => 'tool'),
  ])
  try {
    expect(none.read(rowId(1)).out).toEqual({ kind: 'none' })
    expect(none.read('msg_never_written').out).toEqual({ kind: 'none' })
    expect(summary.read(rowId(2)).out).toEqual({ kind: 'none' })
    expect(far.read(rowId(2)).out).toEqual({ kind: 'none' })
  } finally {
    none.db.close()
    summary.db.close()
    far.db.close()
  }
})

it('refuses a request that names no session', () => {
  const s = scene(['user', 'assistant'])
  try {
    expect(() => readForkPoint.read({ tenant: 't', asking: rowId(2) }, s.port as never)).toThrow(
      'invalid input',
    )
    expect(() => readForkPoint.read({ tenant: 't', session: 's' }, s.port as never)).toThrow(
      'invalid input',
    )
  } finally {
    s.db.close()
  }
})

it('answers absent for a session the tenant has none of', () => {
  const s = scene(['user', 'assistant'])
  try {
    const out = readForkPoint.read(
      { tenant: 't', session: 'elsewhere', asking: rowId(2) },
      s.port as never,
    )
    expect(out).toEqual({ kind: 'read', output: { kind: 'absent' } })
  } finally {
    s.db.close()
  }
})
