import { describe, expect, it } from 'vitest'
import type { ProgramPosition, ProgramTable } from '@omne-harness/tool-contract/provider'
import { callsSummary, type AnsweredFailure } from '../src/code-summary.ts'

const base = (ordinal: number, name = 'Files', command: string | null = 'read') =>
  ({
    ordinal,
    child: `call-${String(ordinal)}`,
    admission: `admit-${String(ordinal)}`,
    target: { name, command, digest: 'sha256:x' },
  }) as unknown as Pick<ProgramPosition, 'ordinal' | 'child' | 'admission' | 'target'>
const retained = (ordinal: number, terminal: object, effect = 'occurred'): ProgramPosition =>
  ({
    ...base(ordinal),
    state: 'retained',
    result: 'v1',
    terminal,
    effect: { kind: effect },
    late: false,
  }) as unknown as ProgramPosition
const done = (ordinal: number) => retained(ordinal, { kind: 'completed' })
const table = (...positions: ProgramPosition[]): ProgramTable => ({ phase: 'sealed', positions })
const answered = (entries: Readonly<Record<number, AnsweredFailure>>) =>
  new Map(Object.entries(entries).map(([ordinal, value]) => [Number(ordinal), value]))
const none = answered({})

describe('TL-73 the summary of the calls of a program, made from the position table', () => {
  it('says there were none, or how many completed, in one line', () => {
    expect(callsSummary(table(), none)).toBe('calls: none')
    expect(callsSummary(table(done(1), done(2), done(3)), none)).toBe('calls: 3 completed')
  })

  it('gives a line to every position that did not complete, with the words the program was given', () => {
    const failure = { kind: 'failed', effect: 'unknown', message: 'Files.read: no data' } as const
    const text = callsSummary(
      table(done(1), done(2), done(3)),
      answered({ 2: { entry: 'Files.read', failure } }),
    )
    expect(text).toBe(
      'calls: 2 completed, 1 failed\n- #2 Files.read failed, effect unknown: Files.read: no data',
    )
  })

  it('reads a position the program never heard of from the table alone', () => {
    const excluded = {
      ...base(2, 'Shell', 'execute'),
      state: 'excluded',
      exclusion: { kind: 'denied', reason: 'the person did not allow it' },
    } as unknown as ProgramPosition
    const interrupted = retained(3, { kind: 'interrupted', cause: 'stop' }, 'unknown')
    const handed = { ...base(4), state: 'handed', background: true } as unknown as ProgramPosition
    const registered = {
      ...base(5, 'Lookup', null),
      state: 'registered',
    } as unknown as ProgramPosition
    expect(callsSummary(table(done(1), excluded, interrupted, handed, registered), none)).toBe(
      [
        'calls: 1 completed, 1 denied, 1 interrupted, 2 unsettled',
        '- #2 Shell.execute denied, not made: the person did not allow it',
        '- #3 Files.read interrupted, effect unknown',
        '- #4 Files.read unsettled, still in the background; its result is not in this program',
        '- #5 Lookup unsettled, still running; its result is not in this program',
      ].join('\n'),
    )
  })

  it('lists a call that was refused before it had a position, in the order of the ordinals', () => {
    const limit = { kind: 'limit', effect: 'none', message: 'more than 8 calls at once' } as const
    const closed = { kind: 'unsupported', effect: 'none', message: 'not open to programs' } as const
    const text = callsSummary(
      table(done(2)),
      answered({
        3: { entry: 'Files.read', failure: limit },
        1: { entry: 'Tools.execute', failure: closed },
      }),
    )
    expect(text).toBe(
      [
        'calls: 1 completed, 1 unsupported, 1 limit',
        '- #1 Tools.execute unsupported, not made: not open to programs',
        '- #3 Files.read limit, not made: more than 8 calls at once',
      ].join('\n'),
    )
  })
})
