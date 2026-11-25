import { expect, it, onTestFinished } from 'vitest'
import { packText } from '@omne-harness/sql-contract/worker'
import { judgeMessage } from '@omne-harness/message'
import { plainOf } from '../src/codec.ts'
import { readModelOriginals } from '../src/worker/model-originals.ts'
import { MAX_COMPACTION_ROWS } from '../src/worker/compaction-window.ts'
import { PAGE_ROWS, type Executor } from '../src/worker/support.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const scope = { tenant: 'tenant', session: 'child' }
const message = (value: string) => ({
  id: 'msg_abcdefghijklmnopqrstuvwxyz012345',
  role: 'user',
  blocks: [
    {
      kind: 'text',
      id: 'blk_abcdefghijklmnopqrstuvwxyz012345',
      text: value,
      visibility: { toModel: true, toHuman: true },
    },
  ],
})

function fixture() {
  const { port, db } = migratedPort()
  onTestFinished(() => db.close())
  function entry(
    position: number,
    kind: string,
    body: unknown,
    session = scope.session,
    tenant = scope.tenant,
  ) {
    const encoded = JSON.stringify({
      id: String(position),
      revision: '1',
      kind,
      schema: { owner: 'session', name: 'session-log', revision: '1', digest: 'fixture' },
      body,
    })
    port.execute(
      'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        tenant,
        session,
        BigInt(position),
        1n,
        kind,
        packText(encoded),
        BigInt(Buffer.byteLength(encoded)),
      ],
    )
  }
  function row(session: string, epoch: string, seq: number, at: number, value: string) {
    const encoded = JSON.stringify(message(value))
    port.execute(
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        scope.tenant,
        session,
        epoch,
        BigInt(seq),
        String(at),
        BigInt(Buffer.byteLength(encoded)),
        'prefix-' + seq,
        encoded,
      ],
    )
  }
  function segment(upto: number, source: string, epoch: string) {
    port.execute(
      'INSERT INTO sl_view_segment (tenant, session, epoch, upto, src_session, src_epoch) VALUES (?, ?, ?, ?, ?, ?)',
      [scope.tenant, scope.session, 'epoch:0', BigInt(upto), source, epoch],
    )
  }
  return { port, db, entry, row, segment }
}

it('reads only this session originals before the exclusive boundary, preserving real id gaps and event kinds', () => {
  const f = fixture()
  f.entry(10, 'message.user', { message: message('original') })
  f.entry(12, 'control.requested', { intent: 'intervening control' })
  f.port.execute(
    'UPDATE sl_entry SET entry = ? WHERE tenant = ? AND session = ? AND position = 12',
    [new Uint8Array([255]), scope.tenant, scope.session],
  )
  f.entry(13, 'intake.routed', { input: 'an input, not adjacent to entry 10' })
  f.entry(14, 'session.model-projected', { rows: [] })
  f.entry(15, 'message.assistant', { message: message('excluded boundary') })
  f.entry(1, 'message.user', { message: message('other tenant') }, scope.session, 'other')
  f.entry(1, 'message.user', { message: message('parent extra fact') }, 'parent')
  f.row(scope.session, 'epoch:0', 1, 10, 'projected replacement must not replace original')
  const original = readModelOriginals(f.port, scope, 15n)
  expect(original?.inherited).toEqual([])
  expect(original?.entries.map(entry => [entry.id, entry.kind])).toEqual([
    ['10', 'message.user'],
    ['13', 'intake.routed'],
    ['14', 'session.model-projected'],
  ])
  expect(original?.entries[0] && plainOf(original.entries[0].payload)).toEqual({
    message: message('original'),
  })
})

it('paginates originals without renumbering or manufacturing numeric adjacency', () => {
  const f = fixture()
  const count = PAGE_ROWS * 2 + 7
  for (let n = 0; n < count; n++)
    f.entry(n * 2 + 1, 'message.user', { message: message(String(n)) })
  const pages: unknown[] = []
  const port: Executor = {
    execute(sql, params) {
      if (sql.includes('FROM sl_entry')) {
        expect(sql).toContain('LIMIT ?')
        expect(params.at(-1)).toBe(BigInt(PAGE_ROWS))
        pages.push(params)
      }
      return f.port.execute(sql, params)
    },
  }
  const original = readModelOriginals(port, scope, BigInt(count * 2))
  expect(original?.entries.map(entry => entry.id)).toEqual(
    Array.from({ length: count }, (_, n) => String(n * 2 + 1)),
  )
  expect(pages).toHaveLength(3)
})

it('inherits exactly the selected fork prefix, including its provenance, but no extra parent facts or own projected rows', () => {
  const f = fixture()
  f.segment(2, 'parent', 'epoch:30')
  f.row('parent', 'epoch:30', 1, 10, 'selected first')
  f.row('parent', 'epoch:30', 2, 20, 'selected second')
  f.row('parent', 'epoch:30', 3, 30, 'not in fork selection')
  f.row('parent', 'epoch:0', 1, 5, 'a different epoch')
  f.row(scope.session, 'epoch:0', 3, 31, 'own projected replacement')
  f.entry(31, 'message.user', { message: message('own original') })
  f.entry(15, 'message.user', { message: message('parent hidden original') }, 'parent')
  const provenance = [{ owner: 'publisher', key: 'guidance', blocks: ['source'] }]
  f.port.execute('INSERT INTO sl_model_provenance VALUES (?, ?, ?, ?, ?)', [
    scope.tenant,
    'parent',
    'epoch:30',
    '20',
    JSON.stringify(provenance),
  ])
  const reads: string[] = []
  const port: Executor = {
    execute(sql, params) {
      reads.push(sql)
      if (sql.includes('FROM sl_entry')) expect(params[1]).toBe(scope.session)
      return f.port.execute(sql, params)
    },
  }
  const original = readModelOriginals(port, scope, 32n)
  expect(original?.inherited.map(row => [row.seq, row.entry])).toEqual([
    ['1', '10'],
    ['2', '20'],
  ])
  expect(original?.inherited[1]).toMatchObject({
    provenance,
    prefixDigest: 'prefix-2',
    message: message('selected second'),
  })
  expect(original?.entries.map(entry => entry.id)).toEqual(['31'])
  expect(reads.every(sql => !sql.includes('sl_blob'))).toBe(true)
})

it('paginates a flattened fork prefix across its actual segment boundary', () => {
  const f = fixture()
  f.segment(PAGE_ROWS + 1, 'grandparent', 'epoch:0')
  f.segment(PAGE_ROWS + 3, 'parent', 'epoch:0')
  for (let seq = 1; seq <= PAGE_ROWS + 1; seq++)
    f.row('grandparent', 'epoch:0', seq, seq, 'inherited ' + seq)
  for (let seq = PAGE_ROWS + 2; seq <= PAGE_ROWS + 3; seq++)
    f.row('parent', 'epoch:0', seq, 500 + seq, 'parent selected ' + seq)
  f.row('parent', 'epoch:0', PAGE_ROWS + 4, 900, 'outside selected prefix')
  f.row(scope.session, 'epoch:0', PAGE_ROWS + 4, 901, 'own projected row')
  const original = readModelOriginals(f.port, scope, 902n)
  expect(original?.inherited).toHaveLength(PAGE_ROWS + 3)
  expect(original?.inherited.slice(-3).map(row => row.seq)).toEqual(['201', '202', '203'])
  expect(original?.inherited.at(-1)?.entry).toBe('703')
})

it.each([
  'sha256:unavailable-parent-summary',
  JSON.stringify({
    ...message('summary'),
    role: 'compaction',
    covers: { from: '1', to: '2' },
    retained: [],
    derivation: { owner: 'provider', record: 'summary', revision: '1', digest: 'digest' },
  }),
])('refuses an inherited compaction without expanding its parent originals: %s', encoded => {
  if (encoded.startsWith('{')) expect(judgeMessage(JSON.parse(encoded))).toHaveProperty('ok')
  const f = fixture()
  f.segment(1, 'parent', 'epoch:2')
  f.row('parent', 'epoch:2', 1, 2, 'placeholder')
  f.entry(1, 'message.user', { message: message('parent original must not be fetched') }, 'parent')
  f.port.execute(
    'UPDATE sl_model_view SET message = ?, bytes = ? WHERE tenant = ? AND session = ?',
    [encoded, BigInt(Buffer.byteLength(encoded)), scope.tenant, 'parent'],
  )
  const reads: string[] = []
  const port: Executor = {
    execute(sql, params) {
      reads.push(sql)
      return f.port.execute(sql, params)
    },
  }
  expect(readModelOriginals(port, scope, 3n)).toBeNull()
  expect(reads.some(sql => sql.includes('FROM sl_entry') || sql.includes('sl_blob'))).toBe(false)
})

it('does not dereference an old local compaction body, or inspect entries at the boundary', () => {
  const f = fixture()
  f.entry(1, 'message.user', { message: message('original before summary') })
  f.entry(2, 'message.compaction', { messageBody: 'sha256:missing-old-body' })
  f.entry(3, 'message.user', { message: message('boundary') })
  f.port.execute(
    'UPDATE sl_entry SET entry = ? WHERE tenant = ? AND session = ? AND position = ?',
    [new Uint8Array([255]), scope.tenant, scope.session, 3n],
  )
  const original = readModelOriginals(f.port, scope, 3n)
  expect(original?.entries.map(entry => entry.kind)).toEqual(['message.user'])
  expect(readModelOriginals(f.port, scope, 4n)).toBeNull()
})

it('returns null for an unreadable selected segment, including a hole inside a full page', () => {
  const f = fixture()
  f.segment(PAGE_ROWS + 5, 'parent', 'epoch:0')
  for (let seq = 1; seq <= PAGE_ROWS + 5; seq++)
    if (seq !== 37) f.row('parent', 'epoch:0', seq, seq, String(seq))
  expect(readModelOriginals(f.port, scope, 999n)).toBeNull()
})

it('refuses a stored entry whose envelope id disagrees with its actual numeric position', () => {
  const f = fixture()
  f.entry(1, 'message.user', { message: message('actual entry at 1') })
  f.entry(3, 'intake.routed', { input: 'actual entry at 3' })
  f.port.execute(
    'UPDATE sl_entry SET position = 2 WHERE tenant = ? AND session = ? AND position = 3',
    [scope.tenant, scope.session],
  )
  expect(readModelOriginals(f.port, scope, 4n)).toBeNull()
})

it('refuses an inherited prefix above the existing model-history row ceiling before loading its messages', () => {
  const f = fixture()
  f.segment(MAX_COMPACTION_ROWS + 1, 'parent', 'epoch:0')
  const reads: string[] = []
  const port: Executor = {
    execute(sql, params) {
      reads.push(sql)
      return f.port.execute(sql, params)
    },
  }
  expect(readModelOriginals(port, scope, 999n)).toBeNull()
  expect(
    reads.some(sql => sql.includes('FROM sl_model_view') || sql.includes('FROM sl_entry')),
  ).toBe(false)
})

it(
  'refuses more than the existing row ceiling of selected local originals without returning a partial result',
  // Slow: creates and reads 100001 genuine SQLite log entries to exercise the recovery ceiling.
  { tags: ['slow'], timeout: 120_000 },
  () => {
    const f = fixture()
    f.db.exec('BEGIN')
    for (let id = 1; id <= MAX_COMPACTION_ROWS + 1; id++)
      f.entry(id, 'message.user', { message: message('row-bound') })
    f.db.exec('COMMIT')
    const bytes = f.db.prepare('SELECT SUM(bytes) AS n FROM sl_entry').get()
    expect(Number(bytes?.['n'])).toBeLessThan(64 * 1024 * 1024)
    expect(readModelOriginals(f.port, scope, BigInt(MAX_COMPACTION_ROWS + 2))).toBeNull()
  },
)

it(
  'bounds cumulative decoded bytes rather than retaining an unbounded set of large originals',
  // Slow: compresses and recovers real 32 MiB message bodies around the 64 MiB recovery ceiling.
  { tags: ['slow'], timeout: 120_000 },
  () => {
    const f = fixture()
    const large = message('x'.repeat(32 * 1024 * 1024))
    f.entry(1, 'message.user', { message: large })
    f.entry(2, 'message.user', { message: large })
    expect(readModelOriginals(f.port, scope, 2n)?.entries).toHaveLength(1)
    expect(readModelOriginals(f.port, scope, 3n)).toBeNull()
  },
)
