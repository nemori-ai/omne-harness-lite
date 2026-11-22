import type { FigureReport } from '@omne-harness/shell-contract'
import { describe, expect, it } from 'vitest'
import {
  applySnapshot,
  EMPTY_CONTENT,
  mergeHistory,
  readThroughTo,
  type Content,
  type WireEntry,
} from '../src/model/content.ts'
import { arrivedMoment, figureDoing, SessionFigure } from '../src/model/figure.ts'
import { toTree, type Plain } from '../src/model/plain.ts'
import type { Open, Run, State } from '../src/model/session-machine.ts'
import { NO_WAITING } from '../src/model/waiting.ts'
import {
  assistantEntry,
  messageEntry,
  plainEntry,
  toolCallBlock,
  toolResultEntry,
  userEntry,
} from './fixtures/frames.ts'

const RUNNING: Run = { kind: 'running', run: 'run_1' }
const IDLE: Run = { kind: 'idle' }

function open(content: Content, run: Run = RUNNING, session = 'ses_a'): Open {
  return {
    kind: 'open',
    session,
    run,
    observation: { kind: 'live', generation: 1 },
    history: { reading: null, issued: 1, again: false, failure: null },
    revision: '1',
    content,
    inputs: [],
    notice: null,
    waiting: NO_WAITING,
  }
}

const read = (entries: readonly WireEntry[], through: string | null = '9'): Content => {
  const merged = mergeHistory(EMPTY_CONTENT, entries)
  return through === null ? merged : readThroughTo(merged, through)
}

const started = (id: string) => plainEntry(id, id, 'run.started', { kind: 'run.started' })
const terminal = (id: string, outcome: string) =>
  plainEntry(id, id, 'run.terminal', { terminal: { run: 'run_1', outcome } })
const asking = (id: string, call: string) =>
  messageEntry(id, id, 'assistant', [toolCallBlock(call, 'Shell', { command: 'ls' })])

function live(content: Content, block: Plain): Content {
  const tree = toTree({
    projection: 'model-output-v1',
    phase: 'running',
    cursor: 'c1',
    revision: '9',
    blocks: [block],
  })
  const applied = applySnapshot(content, tree, '9')
  if (applied.kind !== 'applied') throw new Error('the snapshot did not apply')
  return applied.content
}

const growing = (content: string, value: string): Plain => ({
  kind: 'growing',
  index: '0',
  mode: 'append',
  content,
  value,
})

describe('what the session is doing, as the figure says it (figureDoing)', () => {
  const asked = [userEntry('1', '1', '你好'), started('2')]
  it.each<[string, State, boolean, string]>([
    ['no session open', { kind: 'none', notice: null }, false, 'idle'],
    [
      'a session that cannot be read',
      {
        kind: 'unavailable',
        session: 'ses_a',
        notice: { kind: 'refused', text: '不可用' },
        content: EMPTY_CONTENT,
      },
      false,
      'idle',
    ],
    ['no turn running', open(read(asked), IDLE), false, 'idle'],
    ['no turn, calls in the background', open(read(asked), IDLE), true, 'background'],
    ['a turn waiting for its first words', open(read(asked)), false, 'thinking'],
    [
      'its reasoning arriving',
      open(live(read(asked), growing('thinking', '想一想'))),
      false,
      'thinking',
    ],
    [
      'its reply beginning but still empty',
      open(live(read(asked), growing('text', ''))),
      false,
      'thinking',
    ],
    ['its reply being written', open(live(read(asked), growing('text', '好的'))), false, 'writing'],
    [
      'a sealed block of its words',
      open(live(read(asked), { kind: 'sealed', index: '0', block: { kind: 'text', text: '好' } })),
      false,
      'writing',
    ],
    [
      'a tool call with no result yet',
      open(read([...asked, asking('3', 'call_1')])),
      false,
      'looking',
    ],
    [
      'the tool came back: thinking again',
      open(read([...asked, asking('3', 'call_1'), toolResultEntry('4', '4', 'call_1', 'ok')])),
      false,
      'thinking',
    ],
    [
      'its words committed, the turn not ended yet',
      open(read([...asked, assistantEntry('3', '3', '好的')])),
      false,
      'writing',
    ],
    [
      'stopping the turn reads as the turn',
      open(read([...asked, asking('3', 'call_1')]), {
        kind: 'cancelling',
        run: 'run_1',
        controlId: 'c',
        unknown: false,
      }),
      false,
      'looking',
    ],
    [
      'a call of an ended turn is not running',
      open(
        read([
          asking('1', 'call_0'),
          terminal('2', 'completed'),
          userEntry('3', '3', '再来'),
          started('4'),
        ]),
      ),
      true,
      'thinking',
    ],
  ])('%s', (_case, state, background, doing) => {
    expect(figureDoing(state, background)).toBe(doing)
  })
})

describe('the one-off facts between two states (arrivedMoment)', () => {
  const base = [
    userEntry('1', '1', '你好'),
    started('2'),
    assistantEntry('3', '3', '在'),
    terminal('4', 'completed'),
  ]
  const after = (...more: WireEntry[]) => open(read([...base, ...more]))
  const before = open(read(base))

  it.each<[string, WireEntry[], string | undefined]>([
    ['an input taken into the log', [userEntry('5', '5', '再问一句')], 'received'],
    ['a turn that landed', [terminal('5', 'completed')], 'landed'],
    ['a turn that failed', [terminal('5', 'failed')], 'could-not'],
    ['a turn that was cancelled', [terminal('5', 'cancelled')], 'could-not'],
    ['a turn ended some other way', [terminal('5', 'abandoned')], undefined],
    ['only its words', [assistantEntry('5', '5', '嗯')], undefined],
    [
      'the input and the turn it ended in: the latest',
      [userEntry('5', '5', '问'), terminal('6', 'completed')],
      'landed',
    ],
  ])('%s', (_case, more, kind) => {
    expect(arrivedMoment(before, after(...more))).toBe(kind)
  })

  it('says nothing about what the log already held when the session opened', () => {
    const opening = open(read([], null))
    expect(arrivedMoment(opening, open(read(base, null)))).toBeUndefined()
    expect(arrivedMoment(open(read(base, null)), open(read(base)))).toBeUndefined()
  })

  it('says nothing across two sessions, or when the log did not change', () => {
    expect(
      arrivedMoment(before, open(read([...base, terminal('5', 'failed')]), RUNNING, 'ses_b')),
    ).toBeUndefined()
    expect(arrivedMoment(before, { ...before, run: IDLE })).toBeUndefined()
    expect(arrivedMoment({ kind: 'none', notice: null }, before)).toBeUndefined()
  })
})

describe('the reports handed to the figure port (SessionFigure)', () => {
  const base = [userEntry('1', '1', '你好'), started('2')]

  function follow() {
    const reports: FigureReport[] = []
    const figure = new SessionFigure(report => void reports.push(report))
    return { reports, figure }
  }

  it('reports once per change, and a fact with a new serial each time', () => {
    const { reports, figure } = follow()
    const first = open(read([]), IDLE)
    figure.follow(first, false)
    figure.follow(first, false)
    const asked = open(read(base))
    figure.follow(asked, false)
    const writing = open(live(read(base), growing('text', '好')))
    figure.follow(writing, false)
    const landed = open(
      read([...base, assistantEntry('3', '3', '好'), terminal('4', 'completed')]),
      IDLE,
    )
    figure.follow(landed, false)
    const again = open(
      read([
        ...base,
        assistantEntry('3', '3', '好'),
        terminal('4', 'completed'),
        userEntry('5', '5', '再'),
      ]),
    )
    figure.follow(again, false)
    expect(reports).toEqual([
      { doing: 'idle' },
      { doing: 'thinking', moment: { kind: 'received', serial: 1 } },
      { doing: 'writing', moment: { kind: 'received', serial: 1 } },
      { doing: 'idle', moment: { kind: 'landed', serial: 2 } },
      { doing: 'thinking', moment: { kind: 'received', serial: 3 } },
    ])
  })

  it('leaving says idle, and what follows after it is not compared with what came before', () => {
    const { reports, figure } = follow()
    figure.follow(open(read([])), false)
    figure.leave()
    figure.follow(open(read(base)), true)
    expect(reports).toEqual([{ doing: 'thinking' }, { doing: 'idle' }, { doing: 'thinking' }])
  })
})
