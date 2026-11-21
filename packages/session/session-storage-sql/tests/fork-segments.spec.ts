import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '@omne-harness/session-contract'
import { modelViewPrefix } from '../src/model-view-identity.ts'
import { maintainModelView } from '../src/worker/commit-write.ts'
import {
  entrySession,
  forkFacts,
  forkOf,
  SegmentUnreadable,
  viewHead,
  viewOf,
} from '../src/worker/fork.ts'
import readForkPoint from '../src/worker/read-fork-point.ts'
import { assignPositions } from '../src/worker/support.ts'
import { tree } from './fixtures/session-scenario.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

// The fork module over rows put there by hand: a root `r` with a compacted epoch, `c` forked from
// it, `g` forked from `c`. Entry positions go on along the chain: r 1..40, c 41..60, g 61...

const message = (role: string, extra: object = {}) => ({
  id: 'msg_abcdefghijklmnopqrstuv',
  role,
  blocks: [{ kind: 'text', id: 't', text: role, visibility: { toModel: true, toHuman: true } }],
  ...extra,
})
const summary = message('compaction', {
  covers: { from: '1', to: '20' },
  retained: [],
  derivation: { owner: 'provider', record: 'one', revision: '1', digest: 'proof' },
})

function scene() {
  const { port, db } = migratedPort()
  const journal = (session: string, epoch: string) =>
    port.execute(
      'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
      ['t', session, 9n, 9n, epoch],
    )
  const entry = (session: string, position: number) =>
    port.execute(
      'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['t', session, BigInt(position), 1n, 'message.user', new Uint8Array([0]), 1n],
    )
  const row = (session: string, epoch: string, seq: number, at: number, role: string) =>
    port.execute(
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        't',
        session,
        epoch,
        BigInt(seq),
        String(at),
        1n,
        `d-${session}-${epoch}-${seq}`,
        role === 'compaction' ? 'sha256:summary' : JSON.stringify(message(role)),
      ],
    )
  journal('r', 'epoch:30')
  for (const at of [10, 20, 25, 30, 35, 40]) entry('r', at)
  row('r', 'epoch:0', 1, 10, 'user')
  row('r', 'epoch:0', 2, 20, 'assistant')
  row('r', 'epoch:0', 3, 25, 'user')
  row('r', 'epoch:30', 1, 30, 'compaction')
  row('r', 'epoch:30', 2, 25, 'user')
  row('r', 'epoch:30', 3, 35, 'assistant')
  row('r', 'epoch:30', 4, 40, 'tool')
  port.execute('INSERT INTO sl_compaction_head VALUES (?, ?, ?, ?, ?, ?)', [
    't',
    'r',
    9n,
    '10',
    '[]',
    null,
  ])
  journal('c', 'epoch:0')
  port.execute('INSERT INTO sl_fork VALUES (?, ?, ?, ?, ?, ?, ?)', [
    't',
    'c',
    'r',
    'epoch:30',
    2n,
    40n,
    '10',
  ])
  port.execute('INSERT INTO sl_view_segment VALUES (?, ?, ?, ?, ?, ?)', [
    't',
    'c',
    'epoch:0',
    2n,
    'r',
    'epoch:30',
  ])
  for (const at of [41, 50, 60]) entry('c', at)
  row('c', 'epoch:0', 3, 50, 'assistant')
  row('c', 'epoch:0', 4, 60, 'tool')
  journal('g', 'epoch:0')
  port.execute('INSERT INTO sl_fork VALUES (?, ?, ?, ?, ?, ?, ?)', [
    't',
    'g',
    'c',
    'epoch:0',
    3n,
    60n,
    '10',
  ])
  port.execute('INSERT INTO sl_view_segment VALUES (?, ?, ?, ?, ?, ?)', [
    't',
    'g',
    'epoch:0',
    2n,
    'r',
    'epoch:30',
  ])
  port.execute('INSERT INTO sl_view_segment VALUES (?, ?, ?, ?, ?, ?)', [
    't',
    'g',
    'epoch:0',
    3n,
    'c',
    'epoch:0',
  ])
  return { port, db, row, entry }
}

const at = (session: string) => ({ tenant: 't', session })
const entriesOf = (rows: readonly Readonly<Record<string, unknown>>[]) =>
  rows.map(row => row['entry'])
const external = (session: string, epoch: string) => `${modelViewPrefix('t', session)}${epoch}`

describe('a view is its segments in order, then its own rows', () => {
  it('reads each range where it was written, whatever range is asked', () => {
    const s = scene()
    try {
      const g = viewOf(s.port, at('g'), 'epoch:0')
      expect(g.upper()).toBe(3n)
      expect(entriesOf(g.rows(0n, 3n, 10))).toEqual(['30', '25', '50'])
      expect(entriesOf(g.rows(1n, 3n, 10))).toEqual(['25', '50'])
      expect(entriesOf(g.rows(0n, 3n, 2))).toEqual(['30', '25'])
      expect(entriesOf(g.rows(2n, 2n, 10))).toEqual([])
      const c = viewOf(s.port, at('c'), 'epoch:0')
      expect(c.upper()).toBe(4n)
      expect(entriesOf(c.rows(0n, 4n, 10))).toEqual(['30', '25', '50', '60'])
      expect(viewOf(s.port, at('r'), 'epoch:30').upper()).toBe(4n)
      expect(viewOf(s.port, at('r'), 'epoch:7').upper()).toBe(0n)
    } finally {
      s.db.close()
    }
  })

  it('finds the row of an entry in its own rows or in a segment, within the bound of the segment', () => {
    const s = scene()
    try {
      const g = viewOf(s.port, at('g'), 'epoch:0')
      expect(g.rowOf('25')?.['seq']).toBe(2n)
      expect(g.rowOf('50')?.['seq']).toBe(3n)
      expect(g.rowOf('60')).toBeUndefined()
      expect(g.rowOf('35')).toBeUndefined()
    } finally {
      s.db.close()
    }
  })

  it('goes on from its own last row, else from the last row of its last segment', () => {
    const s = scene()
    try {
      expect(viewHead(s.port, at('c'), 'epoch:0')).toEqual({ seq: 4n, digest: 'd-c-epoch:0-4' })
      expect(viewHead(s.port, at('g'), 'epoch:0')).toEqual({ seq: 3n, digest: 'd-c-epoch:0-3' })
      expect(viewHead(s.port, at('r'), 'epoch:7')).toBeUndefined()
    } finally {
      s.db.close()
    }
  })

  it('does not answer a part of a view whose segment lost a row', () => {
    const s = scene()
    try {
      s.port.execute("DELETE FROM sl_model_view WHERE session = 'c' AND seq = 3", [])
      const g = viewOf(s.port, at('g'), 'epoch:0')
      expect(() => g.rows(0n, 3n, 10)).toThrow(SegmentUnreadable)
      expect(() => viewHead(s.port, at('g'), 'epoch:0')).toThrow(SegmentUnreadable)
    } finally {
      s.db.close()
    }
  })
})

describe('a position of the chain lives in one session (SF-3)', () => {
  it('walks up while the position is not above the fork of the session', () => {
    const s = scene()
    try {
      expect(entrySession(s.port, at('g'), 61n)).toBe('g')
      expect(entrySession(s.port, at('g'), 60n)).toBe('c')
      expect(entrySession(s.port, at('g'), 41n)).toBe('c')
      expect(entrySession(s.port, at('g'), 40n)).toBe('r')
      expect(entrySession(s.port, at('c'), 40n)).toBe('r')
      expect(entrySession(s.port, at('r'), 1n)).toBe('r')
      expect(forkOf(s.port, at('g'))).toEqual({
        source: 'c',
        epoch: 'epoch:0',
        upper: 3n,
        position: 60n,
        origin: '10',
      })
    } finally {
      s.db.close()
    }
  })

  it('numbers the first entry of a forked session after its fork, later ones after its own last', () => {
    const s = scene()
    try {
      const ids = (session: string) =>
        assignPositions(s.port, at(session), '2', [{}, {}]).map(entry => entry.id)
      expect(ids('g')).toEqual(['61', '62'])
      expect(ids('c')).toEqual(['61', '62'])
      expect(ids('r')).toEqual(['41', '42'])
      expect(ids('nobody')).toEqual(['1', '2'])
    } finally {
      s.db.close()
    }
  })
})

describe('what a source shows at a point', () => {
  const source = (session: string, epoch: string, running = true) => ({ session, epoch, running })
  const point = (session: string, epoch: string, upper: string) => ({
    epoch: external(session, epoch),
    upper,
    position: '40',
  })

  it('reads the row after the point and bounds the position from below', () => {
    const s = scene()
    try {
      expect(forkFacts(s.port, 't', source('r', 'epoch:30'), point('r', 'epoch:30', '2'))).toEqual({
        rows: '4',
        next: 'assistant',
        current: true,
        running: true,
        floor: '30',
        tail: '40',
      })
      expect(forkFacts(s.port, 't', source('r', 'epoch:30'), point('r', 'epoch:30', '4'))).toEqual({
        rows: '4',
        next: null,
        current: true,
        running: true,
        floor: '40',
        tail: '40',
      })
      expect(
        forkFacts(s.port, 't', source('r', 'epoch:30', false), point('r', 'epoch:0', '1')),
      ).toMatchObject({ rows: '3', next: 'assistant', current: false, running: false, floor: '10' })
      expect(forkFacts(s.port, 't', source('r', 'epoch:30'), point('r', 'epoch:0', '3')).next).toBe(
        null,
      )
    } finally {
      s.db.close()
    }
  })

  it('takes a summary row for what it is, and a forked source for the position it forked at', () => {
    const s = scene()
    try {
      s.row('r', 'epoch:99', 1, 10, 'user')
      s.row('r', 'epoch:99', 2, 99, 'compaction')
      expect(
        forkFacts(s.port, 't', source('r', 'epoch:30'), point('r', 'epoch:99', '1')),
      ).toMatchObject({ next: 'compaction', floor: '99' })
      expect(forkFacts(s.port, 't', source('c', 'epoch:0'), point('c', 'epoch:0', '1'))).toEqual({
        rows: '4',
        next: 'user',
        current: true,
        running: true,
        floor: '40',
        tail: '60',
      })
      expect(
        forkFacts(s.port, 't', source('c', 'epoch:0'), point('c', 'epoch:0', '2')),
      ).toMatchObject({ next: 'assistant', floor: '40' })
      expect(
        forkFacts(s.port, 't', source('g', 'epoch:0'), point('g', 'epoch:0', '3')),
      ).toMatchObject({ rows: '3', next: null, floor: '60', tail: '60' })
    } finally {
      s.db.close()
    }
  })

  it('knows no epoch that is not of the source, and none the source never wrote', () => {
    const s = scene()
    try {
      const other = { ...point('r', 'epoch:30', '2'), epoch: external('c', 'epoch:30') }
      expect(forkFacts(s.port, 't', source('r', 'epoch:30'), other).rows).toBeNull()
      expect(
        forkFacts(s.port, 't', source('r', 'epoch:30'), point('r', 'epoch:7', '1')).rows,
      ).toBeNull()
      const unnumbered = forkFacts(
        s.port,
        't',
        source('r', 'epoch:30'),
        point('r', 'epoch:30', 'x'),
      )
      expect(unnumbered).toMatchObject({ rows: '4', next: null, floor: '0' })
      const past = forkFacts(s.port, 't', source('r', 'epoch:30'), point('r', 'epoch:30', '9'))
      expect(past).toMatchObject({ rows: '4', next: null, floor: '0' })
    } finally {
      s.db.close()
    }
  })
})

describe('the point a forked session can itself be forked at', () => {
  const read = (s: ReturnType<typeof scene>, session: string) => {
    const out = readForkPoint.read({ tenant: 't', session }, s.port as never)
    return out.kind === 'read' ? out.output : out
  }

  it('is before an assistant message the session wrote itself, at the tail of its own log', () => {
    const s = scene()
    try {
      expect(read(s, 'c')).toEqual({
        kind: 'point',
        point: { epoch: 'epoch:0', upper: '2', position: '60' },
      })
    } finally {
      s.db.close()
    }
  })

  it('is none while the session has asked nothing itself, whatever its prefix holds', () => {
    const s = scene()
    try {
      expect(read(s, 'g')).toEqual({ kind: 'none' })
      s.entry('g', 61)
      s.row('g', 'epoch:0', 4, 61, 'assistant')
      expect(read(s, 'g')).toEqual({
        kind: 'point',
        point: { epoch: 'epoch:0', upper: '3', position: '61' },
      })
    } finally {
      s.db.close()
    }
  })
})

describe('a compaction of the source writes a new epoch and leaves the rows a segment stands on (SF-1)', () => {
  it('keeps the rows of the epoch it leaves', () => {
    const s = scene()
    try {
      const before = viewOf(s.port, at('c'), 'epoch:0').rows(0n, 4n, 10)
      const compaction = {
        id: '45',
        revision: '10',
        kind: 'message.compaction',
        payload: tree({ message: { ...summary, covers: { from: '10', to: '35' } } }),
      } as unknown as HistoryEntry
      expect(maintainModelView(s.port, 't', 'r', 'epoch:30', [compaction])).toBe('epoch:45')
      expect(entriesOf(viewOf(s.port, at('r'), 'epoch:45').rows(0n, 9n, 10))).toEqual(['45', '40'])
      expect(viewOf(s.port, at('r'), 'epoch:30').upper()).toBe(4n)
      expect(viewOf(s.port, at('c'), 'epoch:0').rows(0n, 4n, 10)).toEqual(before)
    } finally {
      s.db.close()
    }
  })
})
