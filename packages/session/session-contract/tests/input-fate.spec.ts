import { describe, expect, it } from 'vitest'
import type { InputId, RunId } from '@omne-harness/session-contract'
import type { SessionEntry } from '../src/entries.ts'
import { INPUT_FATE_KINDS, foldInputFate } from '../src/input-fate.ts'

const I = 'input-1' as InputId
const OTHER = 'input-2' as InputId
const R1 = 'run_1' as RunId
const R2 = 'run_2' as RunId

const entry = (value: Record<string, unknown>) => value as unknown as SessionEntry
const routed = (input: InputId = I) =>
  entry({ kind: 'intake.routed', input, destination: 'next-run', run: null, source: {} })
const started = (run: RunId) => entry({ kind: 'run.started', run })
const taken = (run: RunId, ...ordered: InputId[]) =>
  entry({ kind: 'run.batch-taken', run, batch: { ordered } })
const reply = () => entry({ kind: 'message.assistant', message: {} })
const terminal = (run: RunId, outcome: 'completed' | 'failed' | 'cancelled') =>
  entry({ kind: 'run.terminal', terminal: { run, outcome } })
const handed = (input: InputId, result: Record<string, unknown>) =>
  entry({ kind: 'intake.handed-over', input, execution: 'x', result })
const released = (...inputs: InputId[]) => entry({ kind: 'intake.released', inputs })
const archived = () => entry({ kind: 'session.archived', tasks: [], scope: {} })
const frozen = () => entry({ kind: 'session.frozen', evidence: {} })

const fate = (...entries: SessionEntry[]) => foldInputFate(I, entries)

describe('where one input is now, folded from the log alone (SE-33)', () => {
  it('answers null for an input the log never accepted', () => {
    expect(fate()).toBeNull()
    expect(fate(routed(OTHER), started(R1), taken(R1, OTHER), reply())).toBeNull()
  })

  it('pending: accepted and not taken, also after a hand-over the Agent accepted', () => {
    expect(fate(routed())).toEqual({ kind: 'pending', returnedFrom: null })
    expect(fate(routed(), started(R1), handed(I, { kind: 'accepted', receipt: {} }))).toEqual({
      kind: 'pending',
      returnedFrom: null,
    })
  })

  it('taken: a Run took it and no complete reply has come yet', () => {
    expect(fate(routed(), started(R1), taken(R1, I))).toEqual({ kind: 'taken', run: R1 })
  })

  it('answered: a reply after the take closes the bracket; the terminal of that Run follows', () => {
    const open = [routed(), started(R1), taken(R1, I), reply()]
    expect(fate(...open)).toEqual({ kind: 'answered', run: R1, terminal: 'active' })
    for (const outcome of ['completed', 'failed', 'cancelled'] as const)
      expect(fate(...open, terminal(R1, outcome))).toEqual({
        kind: 'answered',
        run: R1,
        terminal: outcome,
      })
  })

  it('a later Run and its reply do not move an input that an earlier Run answered', () => {
    const later = [started(R2), taken(R2, OTHER), reply(), terminal(R2, 'failed')]
    expect(
      fate(
        routed(),
        routed(OTHER),
        started(R1),
        taken(R1, I),
        reply(),
        terminal(R1, 'completed'),
        ...later,
      ),
    ).toEqual({ kind: 'answered', run: R1, terminal: 'completed' })
  })

  it('returned after a failure: pending again, with the Run that had it', () => {
    const failed = [routed(), started(R1), taken(R1, I), terminal(R1, 'failed')]
    expect(fate(...failed)).toEqual({ kind: 'pending', returnedFrom: R1 })
    expect(fate(...failed, started(R2), taken(R2, I))).toEqual({ kind: 'taken', run: R2 })
    expect(fate(...failed, started(R2), taken(R2, I), reply(), terminal(R2, 'completed'))).toEqual({
      kind: 'answered',
      run: R2,
      terminal: 'completed',
    })
  })

  it('settled by a cancel: the open bracket ends with the Run and does not come back', () => {
    expect(fate(routed(), started(R1), taken(R1, I), terminal(R1, 'cancelled'))).toEqual({
      kind: 'settled',
      by: 'cancelled',
      run: R1,
    })
  })

  it('settled by the archive or the freeze while it was pending or taken', () => {
    expect(fate(routed(), archived())).toEqual({ kind: 'settled', by: 'archived', run: null })
    expect(fate(routed(), started(R1), taken(R1, I), archived())).toEqual({
      kind: 'settled',
      by: 'archived',
      run: R1,
    })
    expect(fate(routed(), frozen(), released(I))).toEqual({
      kind: 'settled',
      by: 'frozen',
      run: null,
    })
    expect(fate(routed(), frozen(), released(OTHER))).toEqual({
      kind: 'pending',
      returnedFrom: null,
    })
  })

  it('an archive leaves an answered input answered', () => {
    const done = [routed(), started(R1), taken(R1, I), reply(), terminal(R1, 'completed')]
    expect(fate(...done, archived())).toEqual({ kind: 'answered', run: R1, terminal: 'completed' })
  })

  it("refused: the Agent's message admission rejected it, with the reason", () => {
    const rejection = { kind: 'rejected', reason: 'too-large', rejection: {} }
    expect(fate(routed(), started(R1), handed(I, rejection))).toEqual({
      kind: 'refused',
      reason: 'too-large',
    })
    expect(fate(routed(), routed(OTHER), started(R1), handed(OTHER, rejection))).toEqual({
      kind: 'pending',
      returnedFrom: null,
    })
  })

  it('a Run that ends does not move an input that is pending or already settled', () => {
    expect(fate(routed(), started(R1), terminal(R1, 'failed'))).toEqual({
      kind: 'pending',
      returnedFrom: null,
    })
    const cancelled = [routed(), started(R1), taken(R1, I), terminal(R1, 'cancelled')]
    expect(fate(...cancelled, terminal(R1, 'failed'))).toEqual({
      kind: 'settled',
      by: 'cancelled',
      run: R1,
    })
  })

  it('a rejected hand-over refuses only an input that is pending; a taken one stays taken', () => {
    const rejection = { kind: 'rejected', reason: 'late', rejection: {} }
    expect(fate(routed(), started(R1), taken(R1, I), handed(I, rejection))).toEqual({
      kind: 'taken',
      run: R1,
    })
  })

  it('a release settles only an input that is pending', () => {
    expect(fate(routed(), started(R1), taken(R1, I), released(I))).toEqual({
      kind: 'taken',
      run: R1,
    })
    expect(fate(routed(), released(I))).toEqual({ kind: 'settled', by: 'cancelled', run: null })
    expect(fate(routed(), released(I), frozen())).toEqual({
      kind: 'settled',
      by: 'cancelled',
      run: null,
    })
  })

  it('only an acceptance of this input starts its fate: a task row and another kind do not', () => {
    const task = entry({ kind: 'intake.routed', task: { kind: 'routed-input' } })
    const lookalike = entry({ kind: 'run.batch-taken', run: R1, input: I, batch: { ordered: [] } })
    expect(fate(task)).toBeNull()
    expect(fate(lookalike)).toBeNull()
    expect(fate(routed(OTHER))).toBeNull()
    expect(fate(routed(), started(R1), taken(R1, I), reply(), routed())).toEqual({
      kind: 'pending',
      returnedFrom: null,
    })
  })

  it('reads only the kinds it names, and is exactly in one cell at every prefix', () => {
    expect([...INPUT_FATE_KINDS].sort()).toEqual(
      [
        'intake.handed-over',
        'intake.released',
        'intake.routed',
        'message.assistant',
        'run.batch-taken',
        'run.started',
        'run.terminal',
        'session.archived',
        'session.frozen',
      ].sort(),
    )
    const log = [
      routed(),
      started(R1),
      taken(R1, I),
      terminal(R1, 'failed'),
      started(R2),
      taken(R2, I),
      reply(),
    ]
    const cells = log.map((_, at) => foldInputFate(I, log.slice(0, at + 1))?.kind)
    expect(cells).toEqual([
      'pending',
      'pending',
      'taken',
      'pending',
      'pending',
      'taken',
      'answered',
    ])
  })
})
