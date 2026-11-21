import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '@omne-harness/session-contract'
import { blobDigest, canonicalText } from '../src/codec.ts'
import { modelViewPrefix } from '../src/model-view-identity.ts'
import checkCompactionInput from '../src/worker/check-compaction-input.ts'
import { maintainModelView, writeEntries } from '../src/worker/commit-write.ts'
import { readCompactionWindow } from '../src/worker/compaction-window.ts'
import { viewOf } from '../src/worker/fork.ts'
import readEntryMessage from '../src/worker/read-entry-message.ts'
import { tree } from './fixtures/session-scenario.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

// A source `r` in a step (a call answered, a second call asked) and `c` forked before that second
// call, with a step of its own. Entry positions go on along the chain: r up to 45, c from 46.

const VISIBLE = { toModel: true, toHuman: true }
const text = (role: string, content: string, blocks: readonly object[] = []) => ({
  id: 'msg_abcdefghijklmnopqrstuv',
  role,
  blocks: [...blocks, { kind: 'text', id: 'text', text: content, visibility: VISIBLE }],
})
const asking = (callId: string) =>
  text('assistant', `asks ${callId}`, [
    {
      kind: 'tool_call',
      id: `${callId}/call`,
      callId,
      name: 'Ask',
      arguments: { kind: 'object', entries: [] },
      visibility: VISIBLE,
    },
  ])
const answering = (callId: string) =>
  text('tool', `answers ${callId}`, [
    { kind: 'tool_result', id: `${callId}/result`, callId, visibility: VISIBLE },
  ])

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
  const journal = (session: string, epoch: string) => {
    port.execute(
      'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
      ['t', session, 9n, 9n, epoch],
    )
    port.execute('INSERT INTO sl_compaction_head VALUES (?, ?, ?, ?, ?, ?)', [
      't',
      session,
      9n,
      '5',
      '[]',
      null,
    ])
  }
  const row = (session: string, seq: number, at: number, message: object) => {
    const entry = {
      id: String(at),
      revision: '1',
      kind: `message.${(message as { role: string }).role}`,
      schema: SCHEMA,
      payload: tree({ message }),
      origin: ORIGIN,
    } as unknown as HistoryEntry
    expect(writeEntries(port, 't', session, [entry])).toBeNull()
    port.execute(
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        't',
        session,
        'epoch:0',
        BigInt(seq),
        String(at),
        1n,
        `d-${session}-${seq}`,
        JSON.stringify(message),
      ],
    )
  }
  const pair = (session: string, result: string, call: string) =>
    port.execute('INSERT INTO sl_message_pairing VALUES (?, ?, ?, ?)', ['t', session, result, call])
  journal('r', 'epoch:0')
  row('r', 1, 10, text('user', 'the first words'))
  row('r', 2, 20, asking('k1'))
  row('r', 3, 30, answering('k1'))
  row('r', 4, 40, asking('k2'))
  pair('r', '30', '20')
  port.execute(
    'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['t', 'r', 45n, 1n, 'call.bound', new Uint8Array([0]), 1n],
  )
  journal('c', 'epoch:0')
  port.execute('INSERT INTO sl_fork VALUES (?, ?, ?, ?, ?, ?, ?)', [
    't',
    'c',
    'r',
    'epoch:0',
    3n,
    45n,
    '5',
  ])
  port.execute('INSERT INTO sl_view_segment VALUES (?, ?, ?, ?, ?, ?)', [
    't',
    'c',
    'epoch:0',
    3n,
    'r',
    'epoch:0',
  ])
  row('c', 4, 50, text('user', 'the work'))
  row('c', 5, 60, asking('k3'))
  row('c', 6, 70, answering('k3'))
  pair('c', '70', '60')
  return { port, db }
}

const window = (port: ReturnType<typeof scene>['port'], session: string, coverTo: string | null) =>
  readCompactionWindow(port, { tenant: 't', session, epoch: 'epoch:0', upper: null, coverTo })
const refs = (rows: readonly Readonly<{ ref: string }>[]) => rows.map(row => row.ref)
const snapshot = (port: ReturnType<typeof scene>['port'], session: string) => ({
  rows: port.execute(
    'SELECT epoch, seq, entry, message FROM sl_model_view WHERE session = ? ORDER BY epoch, seq',
    [session],
  ).rows,
  journal: port.execute('SELECT epoch FROM sl_journal WHERE session = ?', [session]).rows,
})

describe('the compaction window of a forked session reaches into its prefix (SF-3)', () => {
  it('covers rows of the source and its own, with the witness of each result where it was written', () => {
    const s = scene()
    try {
      const read = window(s.port, 'c', '30')
      if (read.kind !== 'context') throw new Error(read.kind)
      expect(read.value.origin).toBe('5')
      expect(refs(read.value.covered)).toEqual(['5', '10', '20', '30'])
      expect(refs(read.value.after)).toEqual(['50', '60', '70'])
      expect(read.value.base).toEqual({
        kind: 'initial',
        pairings: [
          { result: '30', call: '20' },
          { result: '70', call: '60' },
        ],
      })
      expect(read.value.covered[2]?.message).toMatchObject({ role: 'assistant' })
      const whole = window(s.port, 'c', null)
      if (whole.kind !== 'context') throw new Error(whole.kind)
      expect(refs(whole.value.covered)).toEqual(['5', '10', '20', '30', '50', '60', '70'])
    } finally {
      s.db.close()
    }
  })

  it('does not see what the source wrote after the point', () => {
    const s = scene()
    try {
      const read = window(s.port, 'c', null)
      if (read.kind !== 'context') throw new Error(read.kind)
      expect(refs([...read.value.covered, ...read.value.after])).not.toContain('40')
      const own = window(s.port, 'r', null)
      if (own.kind !== 'context') throw new Error(own.kind)
      expect(refs(own.value.covered)).toEqual(['5', '10', '20', '30', '40'])
    } finally {
      s.db.close()
    }
  })

  it('is not there to read when a row of the prefix is lost', () => {
    const s = scene()
    try {
      s.port.execute("DELETE FROM sl_model_view WHERE session = 'r' AND seq = 2", [])
      expect(window(s.port, 'c', null)).toEqual({ kind: 'behind' })
    } finally {
      s.db.close()
    }
  })
})

describe('each of the two compacts for itself', () => {
  const summary = (to: string, retained: readonly string[]) =>
    ({
      id: '80',
      revision: '10',
      kind: 'message.compaction',
      payload: tree({
        message: {
          ...text('compaction', 'summary'),
          covers: { from: '5', to },
          retained,
          derivation: { owner: 'provider', record: 'one', revision: '1', digest: 'proof' },
        },
      }),
    }) as unknown as HistoryEntry

  it('writes the new epoch of the forked session under its own name and leaves the source as it was', () => {
    const s = scene()
    try {
      const source = snapshot(s.port, 'r')
      const before = snapshot(s.port, 'c')
      expect(maintainModelView(s.port, 't', 'c', 'epoch:0', [summary('30', ['10'])])).toBe(
        'epoch:80',
      )
      expect(snapshot(s.port, 'r')).toEqual(source)
      const after = snapshot(s.port, 'c')
      expect(after.rows.slice(0, before.rows.length)).toEqual(before.rows)
      const epoch = viewOf(s.port, { tenant: 't', session: 'c' }, 'epoch:80').rows(0n, 9n, 10)
      expect(epoch.map(row => row['entry'])).toEqual(['10', '80', '50', '60', '70'])
      expect(JSON.parse(String(epoch[0]?.['message']))).toEqual(text('user', 'the first words'))
      const own = s.port.execute(
        "SELECT COUNT(*) FROM sl_model_view WHERE session = 'c' AND epoch = 'epoch:80'",
        [],
      )
      expect(own.rows[0]?.[0]).toBe(5n)
    } finally {
      s.db.close()
    }
  })

  it('leaves the forked session as it was when the source compacts', () => {
    const s = scene()
    try {
      const before = {
        view: viewOf(s.port, { tenant: 't', session: 'c' }, 'epoch:0').rows(0n, 6n, 10),
        window: window(s.port, 'c', null),
      }
      expect(maintainModelView(s.port, 't', 'r', 'epoch:0', [summary('40', [])])).toBe('epoch:80')
      s.port.execute("UPDATE sl_journal SET epoch = 'epoch:80' WHERE session = 'r'", [])
      expect(viewOf(s.port, { tenant: 't', session: 'c' }, 'epoch:0').rows(0n, 6n, 10)).toEqual(
        before.view,
      )
      expect(window(s.port, 'c', null)).toEqual(before.window)
    } finally {
      s.db.close()
    }
  })
})

describe('an original of the prefix is read where it was written', () => {
  const read = (port: ReturnType<typeof scene>['port'], entry: string, epoch: string | null) => {
    const out = readEntryMessage.read({ tenant: 't', session: 'c', entry, epoch }, port as never)
    return out.kind === 'read' ? out.output : out
  }
  const current = `${modelViewPrefix('t', 'c')}epoch:0`

  it('reads an entry of the source for a row of the prefix, and its own for a row of its own', () => {
    const s = scene()
    try {
      expect(read(s.port, '20', current)).toMatchObject({
        kind: 'message',
        message: expect.anything(),
      })
      expect(JSON.stringify(read(s.port, '20', current))).toContain('asks k1')
      expect(JSON.stringify(read(s.port, '60', current))).toContain('asks k3')
      expect(JSON.stringify(read(s.port, '10', null))).toContain('the first words')
    } finally {
      s.db.close()
    }
  })

  it('has no original for an entry the source wrote after the point, or for none at all', () => {
    const s = scene()
    try {
      expect(read(s.port, '40', current)).toEqual({ kind: 'absent' })
      expect(read(s.port, '99', current)).toEqual({ kind: 'absent' })
      expect(read(s.port, '20', `${modelViewPrefix('t', 'c')}epoch:7`)).toEqual({ kind: 'changed' })
    } finally {
      s.db.close()
    }
  })
})

describe('a frozen input of a forked session is checked against its whole view', () => {
  it('verifies the messages of the prefix and its own, in the order of the view', () => {
    const s = scene()
    try {
      const read = window(s.port, 'c', null)
      if (read.kind !== 'context') throw new Error(read.kind)
      const rows = [...read.value.covered, ...read.value.after]
      const visible = rows.filter(row => row.message !== null)
      const history = {
        epoch: `${modelViewPrefix('t', 'c')}epoch:0`,
        origin: read.value.origin,
        upper: read.value.covered.at(-1)?.ref,
        base: read.value.base,
        logOrder: rows.map(row => row.ref),
        barriers: read.value.open.filter(ref => !visible.some(row => row.ref === ref)),
        protected: read.value.open.filter(ref => visible.some(row => row.ref === ref)),
        entries: visible.map((row, index) => ({
          ref: row.ref,
          sequence: String(index),
          message: blobDigest(canonicalText(row.message)),
        })),
      }
      const check = (value: object) =>
        checkCompactionInput.read(
          { tenant: 't', session: 'c', history: value } as never,
          s.port as never,
        )
      expect(check(history)).toEqual({ kind: 'read', output: { kind: 'verified' } })
      expect(check({ ...history, entries: history.entries.slice(1) })).toMatchObject({
        output: { kind: 'invalid' },
      })
    } finally {
      s.db.close()
    }
  })
})
