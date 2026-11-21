import { describe, expect, it } from 'vitest'
import type { EntryId, HistoryEntry, InputId, WorkSnapshot } from '@omne-harness/session-contract'
import { TESTING_SOURCES, evidence, ordinaryInput } from '@omne-harness/session-contract/testing'
import { encodeEntry } from '../src/entries.ts'
import {
  PENDING_PREVIEW_CHARS,
  inputFateOfRows,
  pendingAcceptances,
  pendingInputOf,
  pendingPageOf,
  previewOf,
  waitingCalls,
  type PendingInput,
} from '../src/intake-reads.ts'

const SOURCE = {
  name: TESTING_SOURCES.person,
  label: 'Test person',
  role: 'user',
  wakes: true,
  entry: 'login',
  countsTowardCapacity: true,
} as const
const origin = { owner: 'session', via: 'intake', source: evidence('o') }

function row(position: string, entry: Parameters<typeof encodeEntry>[0]): HistoryEntry {
  return { ...encodeEntry(entry, origin), id: position as EntryId, revision: '1' as never }
}
const routedRow = (position: string, input: string, source = SOURCE) =>
  row(position, {
    kind: 'intake.routed',
    input: input as InputId,
    destination: 'next-run',
    run: null,
    origin: evidence('login'),
    source,
  })

describe('the pending inputs of a session, as the log accepted them', () => {
  it('reads the acceptance of each input from its routed row, and skips the other rows', () => {
    const task = row('2', {
      kind: 'intake.routed',
      task: {
        kind: 'routed-input',
        originalOperation: 'op' as never,
        value: {} as never,
        state: 'pending',
      },
    })
    const found = pendingAcceptances([routedRow('1', 'a'), task, routedRow('7', 'b')])
    expect([...found!.entries()]).toEqual([
      ['a', { position: '1', source: SOURCE }],
      ['b', { position: '7', source: SOURCE }],
    ])
  })

  it('answers null for a row that does not read', () => {
    const broken = {
      ...routedRow('1', 'a'),
      payload: { kind: 'string', value: 'x' },
    } as HistoryEntry
    expect(pendingAcceptances([broken])).toBeNull()
    expect(inputFateOfRows('a' as InputId, [broken])).toBe('unreadable')
  })

  it('gives the source, the role, the wake and a preview of the message', () => {
    const quiet = {
      ...SOURCE,
      name: TESTING_SOURCES.quiet,
      label: 'Quiet',
      role: 'system_reminder',
      wakes: false,
    } as const
    expect(
      pendingInputOf(ordinaryInput('a', 'hello there'), {
        position: '4' as EntryId,
        source: quiet,
      }),
    ).toEqual({
      input: 'a',
      position: '4',
      source: { name: TESTING_SOURCES.quiet, label: 'Quiet' },
      role: 'system_reminder',
      wakes: false,
      preview: 'hello there',
    })
  })

  it('cuts a long preview at code points, never inside one', () => {
    const long = '😀'.repeat(PENDING_PREVIEW_CHARS + 5)
    const preview = previewOf(ordinaryInput('a', long).message)
    expect([...preview]).toHaveLength(PENDING_PREVIEW_CHARS + 1)
    expect(preview.endsWith('…')).toBe(true)
    expect(previewOf(ordinaryInput('a', 'short').message)).toBe('short')
    expect(previewOf({ ...ordinaryInput('a').message, blocks: [] } as never)).toBe('')
  })

  it('joins the text blocks with one space and leaves the other blocks out', () => {
    const base = ordinaryInput('a').message
    const visibility = { toHuman: true, toModel: true }
    const message = {
      ...base,
      blocks: [
        { kind: 'text', id: 'b1', visibility, text: 'one' },
        { kind: 'image', id: 'b2', visibility, text: 7 },
        { kind: 'text', id: 'b3', visibility, text: '' },
        { kind: 'tool_result', id: 'b4', visibility },
        { kind: 'text', id: 'b5', visibility, text: 'two' },
      ],
    } as never
    expect(previewOf(message)).toBe('one two')
    const exact = 'x'.repeat(PENDING_PREVIEW_CHARS)
    expect(previewOf(ordinaryInput('a', exact).message)).toBe(exact)
  })

  it('reads an acceptance only from a routed row that names an input', () => {
    const user = row('3', {
      kind: 'message.user',
      message: ordinaryInput('a').message,
      source: evidence('login'),
      admission: null,
      consumption: null,
      participation: null,
    } as never)
    const unreadableElsewhere = { ...user, payload: { kind: 'string', value: 'x' } } as HistoryEntry
    const found = pendingAcceptances([user, unreadableElsewhere, routedRow('9', 'a')])
    expect([...found!.keys()]).toEqual(['a'])
  })

  it('pages in the order of acceptance, by position as a number, and says when more follow', () => {
    const at = (position: string): PendingInput =>
      pendingInputOf(ordinaryInput(`i${position}`), {
        position: position as EntryId,
        source: SOURCE,
      })
    const inputs = [at('12'), at('3'), at('101')]
    expect(pendingPageOf([at('3'), at('12')], null, 5).inputs.map(item => item.position)).toEqual([
      '3',
      '12',
    ])
    expect(pendingPageOf([at('12'), at('3')], null, 5).inputs.map(item => item.position)).toEqual([
      '3',
      '12',
    ])
    const first = pendingPageOf(inputs, null, 2)
    expect(first.inputs.map(item => item.position)).toEqual(['3', '12'])
    expect(first.next).toBe('12')
    const second = pendingPageOf(inputs, first.next, 2)
    expect(second.inputs.map(item => item.position)).toEqual(['101'])
    expect(second.next).toBeNull()
    expect(pendingPageOf(inputs, '101' as EntryId, 2)).toEqual({ inputs: [], next: null })
    expect(pendingPageOf(inputs, null, 3).next).toBeNull()
    const five = ['1', '2', '3', '4', '5'].map(at)
    expect(pendingPageOf(five, null, 3).next).toBe('3')
    expect(pendingPageOf(five, '3' as EntryId, 1).next).toBe('4')
  })

  it('folds the fate of an input from stored rows', () => {
    expect(inputFateOfRows('a' as InputId, [routedRow('1', 'a')])).toEqual({
      fate: { kind: 'pending', returnedFrom: null },
    })
    expect(inputFateOfRows('z' as InputId, [routedRow('1', 'a')])).toEqual({ fate: null })
  })
})

describe('the calls that wait for a person', () => {
  const card = (name: string) => evidence(`card/${name}`)
  const snapshot = (waiting: WorkSnapshot['waiting'], run: WorkSnapshot['run']) =>
    ({ waiting, run }) as WorkSnapshot

  it('lists each card of an extension wait that has no decision yet, with its action', () => {
    const waiting: WorkSnapshot['waiting'] = [
      { kind: 'producer', binding: {} as never, position: 'p0' },
      {
        kind: 'extension-batch',
        passage: 'before-tool',
        position: 'p1',
        members: [
          { action: 'act-1', card: card('1'), decision: null },
          { action: 'act-2', card: card('2'), decision: evidence('decided') },
        ],
      },
      {
        kind: 'extension-passage',
        passage: 'ask',
        position: 'p2',
        members: [{ card: card('3'), decision: null }],
      },
      { kind: 'dependency', owner: 'model', position: 'p3' },
    ]
    const active = { kind: 'active', run: 'run_1' } as WorkSnapshot['run']
    expect(waitingCalls(snapshot(waiting, active))).toEqual([
      { card: card('1'), action: 'act-1', passage: 'before-tool', position: 'p1', run: 'run_1' },
      { card: card('3'), action: null, passage: 'ask', position: 'p2', run: 'run_1' },
    ])
    expect(waitingCalls(snapshot(waiting, { kind: 'none' }))[0]).toMatchObject({ run: null })
  })

  it('is empty when nothing waits for a card', () => {
    expect(waitingCalls(snapshot([], { kind: 'none' }))).toEqual([])
  })
})
