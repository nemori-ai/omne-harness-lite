import { expect, it } from 'vitest'
import { blobDigest, canonicalText } from '../src/codec.ts'
import { modelViewPrefix } from '../src/model-view-identity.ts'
import checkCompactionInput from '../src/worker/check-compaction-input.ts'
import { readCompactionWindow } from '../src/worker/compaction-window.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

// The compaction hot path reads only the current model view and the open work. Rows of
// generations that earlier compactions already covered must not change what it reads.

const SCALES = [0, 2000, 20000] as const

const text = (role: string, content: string) => ({
  id: 'msg_abcdefghijklmnopqrstuv',
  role,
  blocks: [
    { kind: 'text', id: 'text', text: content, visibility: { toModel: true, toHuman: true } },
  ],
})

function scene(old: number) {
  const { port, db } = migratedPort()
  port.execute(
    'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
    ['t', 's', 10n, 1n, 'epoch:8'],
  )
  port.execute('INSERT INTO sl_compaction_head VALUES (?, ?, ?, ?, ?, ?)', [
    't',
    's',
    10n,
    '1',
    '["7"]',
    null,
  ])
  const summary = {
    ...text('compaction', 'summary'),
    covers: { from: '1', to: '5' },
    retained: [],
    derivation: { owner: 'provider', record: 'one', revision: '1', digest: 'proof' },
  }
  const result = {
    ...text('tool', 'result'),
    blocks: [
      {
        kind: 'tool_result',
        id: 'result',
        callId: 'k',
        visibility: { toModel: true, toHuman: true },
      },
      ...text('tool', 'result').blocks,
    ],
  }
  const current = [
    [1n, '8', summary],
    [2n, '6', text('user', 'earlier tail')],
    [3n, '10', result],
  ] as const
  for (const [seq, entry, message] of current)
    port.execute(
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['t', 's', 'epoch:8', seq, entry, 1n, 'digest', JSON.stringify(message)],
    )
  port.execute('INSERT INTO sl_message_pairing VALUES (?, ?, ?, ?)', ['t', 's', '10', '2'])
  if (old > 0) {
    const series = `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < ${old})`
    db.exec(`${series} INSERT INTO sl_model_view
      SELECT 't', 's', 'epoch:' || (1 + i % 7), i, 'old-' || i, 1, 'digest', '${JSON.stringify(result)}' FROM n`)
    db.exec(
      `${series} INSERT INTO sl_message_pairing SELECT 't', 's', 'old-' || i, 'call-' || i FROM n`,
    )
    db.exec(`${series} INSERT INTO sl_compaction_call
      SELECT 't', 's', 'old-' || i, 'entry-' || i, NULL, 1, 1, 0, 0 FROM n`)
  }
  return { port, db }
}

type Observed = { sql: string; params: readonly unknown[]; rows: number }

function observing(port: ReturnType<typeof migratedPort>['port']) {
  const observed: Observed[] = []
  return {
    observed,
    read: {
      execute(sql: string, params: Parameters<typeof port.execute>[1]) {
        const result = port.execute(sql, params)
        observed.push({ sql, params: params ?? [], rows: result.rows.length })
        return result
      },
    },
  }
}

function plans(db: ReturnType<typeof migratedPort>['db'], observed: readonly Observed[]) {
  return observed.map(item =>
    JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN ${item.sql}`).all(...(item.params as never[]))),
  )
}

function measure(old: number, read: (port: Observing['read']) => unknown) {
  const { port, db } = scene(old)
  try {
    const probe = observing(port)
    const answer = read(probe.read)
    return {
      answer,
      rows: probe.observed.map(item => item.rows),
      plans: plans(db, probe.observed),
    }
  } finally {
    db.close()
  }
}
type Observing = ReturnType<typeof observing>

const WINDOW = { tenant: 't', session: 's', epoch: 'epoch:8', upper: null, coverTo: null }

function manifest(port: Observing['read']) {
  const window = readCompactionWindow(port, WINDOW)
  if (window.kind !== 'context') throw new Error(`no current window: ${window.kind}`)
  const rows = [...window.value.covered, ...window.value.after]
  const viewOrder = ['8', '6', '10']
  const visible = rows
    .filter(row => row.message !== null)
    .sort((left, right) => viewOrder.indexOf(left.ref) - viewOrder.indexOf(right.ref))
  const seqOf = new Map(viewOrder.map((ref, index) => [ref, String(index)]))
  return {
    tenant: 't',
    session: 's',
    history: {
      epoch: `${modelViewPrefix('t', 's')}epoch:8`,
      origin: window.value.origin,
      upper: window.value.covered.at(-1)?.ref,
      base: window.value.base,
      logOrder: rows.map(row => row.ref),
      barriers: window.value.open.filter(ref => !visible.some(row => row.ref === ref)),
      protected: window.value.open.filter(ref => visible.some(row => row.ref === ref)),
      entries: visible.map(row => ({
        ref: row.ref,
        sequence: seqOf.get(row.ref),
        message: blobDigest(canonicalText(row.message)),
      })),
    },
  }
}

it.each(SCALES)(
  'reads the same rows for the compaction window with %i already covered rows',
  old => {
    const base = measure(0, port => readCompactionWindow(port, WINDOW))
    const scaled = measure(old, port => readCompactionWindow(port, WINDOW))
    expect(base.answer).toMatchObject({ kind: 'context' })
    expect(scaled.answer).toEqual(base.answer)
    expect(scaled.rows).toEqual(base.rows)
    for (const plan of scaled.plans) {
      expect(plan).toContain('SEARCH')
      expect(plan).not.toMatch(/"detail":"SCAN /)
    }
  },
)

it.each(SCALES)('verifies a frozen input with the same rows with %i already covered rows', old => {
  const check = (port: Observing['read']) => {
    const input = manifest(port)
    return checkCompactionInput.read(input as never, port as never)
  }
  const base = measure(0, check)
  const scaled = measure(old, check)
  expect(base.answer).toEqual({ kind: 'read', output: { kind: 'verified' } })
  expect(scaled.answer).toEqual(base.answer)
  expect(scaled.rows).toEqual(base.rows)
  for (const plan of scaled.plans) {
    expect(plan).toContain('SEARCH')
    expect(plan).not.toMatch(/"detail":"SCAN /)
  }
})
