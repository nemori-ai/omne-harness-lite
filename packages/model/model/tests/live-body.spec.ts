import { decodeModelOperationId, type ModelOperationId } from '@omne-harness/model-contract'
import { say } from './live-fixture.ts'
import { describe, expect, it } from 'vitest'
import {
  connecting,
  step,
  submit,
  type LiveBody,
  type LiveEffect,
  type LiveInput,
} from '../src/live/body.ts'

function op(label: string): ModelOperationId {
  const decoded = decodeModelOperationId(`mop_${label}`)
  if (!('ok' in decoded)) throw new Error(label)
  return decoded.ok
}
const AT = '2026-11-27T00:00:00.000Z'
const OPENED: LiveInput = { kind: 'opened', at: AT, expiresAt: null }
const said = (text: string): LiveInput => ({
  kind: 'event',
  at: AT,
  event: { t: 'transcript', who: 'caller', startMs: 0, endMs: 1, text },
})
const SAVED: LiveInput = { kind: 'answer', answer: 'saved' }
const SAY = say('hello')

function run(body: LiveBody, ...inputs: LiveInput[]) {
  const effects: LiveEffect[] = []
  for (const input of inputs) {
    const next = step(body, input)
    effects.push(...next.effects)
    body = next.body
  }
  return { body, effects }
}
const kinds = (effects: readonly LiveEffect[]) => effects.map(effect => effect.kind)
const settledWith = (effects: readonly LiveEffect[]) =>
  effects.flatMap(effect => (effect.kind === 'settle' ? [effect] : []))
function taken(body: LiveBody, id: ModelOperationId) {
  const answer = submit(body, id, SAY)
  if (answer.kind !== 'receipt') throw new Error(`refused: ${answer.reason}`)
  return answer
}
const open = (capacity = 8) => run(connecting(capacity), OPENED, SAVED).body

describe('a live body while connecting', () => {
  it('opens on the upstream opening, numbers it as the first event and delivers it', () => {
    const { body, effects } = run(connecting(8), OPENED)
    expect(body.phase).toBe('open')
    expect(effects).toEqual([
      {
        kind: 'deliver',
        from: 1,
        to: 1,
        frames: [{ seq: 1, at: AT, event: { t: 'started', expiresAt: null } }],
      },
    ])
  })

  it('takes the session deadline the upstream gives', () => {
    const later = '2026-11-27T01:00:00.000Z'
    const { effects } = run(connecting(8), { kind: 'opened', at: AT, expiresAt: later })
    expect(effects[0]).toEqual({ kind: 'deadline', which: 'session', at: later })
  })

  it('closes at once on opening when a cancel came while connecting', () => {
    const { body, effects } = run(connecting(8), { kind: 'cancel', control: op('stop') }, OPENED)
    expect(body).toMatchObject({ phase: 'closing', closeFor: 'cancel', control: op('stop') })
    expect(kinds(effects)).toEqual(['deliver', 'close', 'deadline'])
  })

  it.each([
    ['the upstream closes', { kind: 'closed' }, 'live-session-refused'],
    ['the connection goes', { kind: 'lost' }, 'live-lost-before-open'],
    ['the open deadline comes', { kind: 'deadline', which: 'open' }, 'live-open-deadline'],
  ] as const)('fails as upstream-unavailable when %s', (_case, input, diagnostic) => {
    const { body, effects } = run(connecting(8), input)
    expect(body.phase).toBe('settling')
    expect(effects).toEqual([
      { kind: 'drop' },
      {
        kind: 'settle',
        termination: {
          kind: 'failed',
          fault: { cause: 'upstream-unavailable', diagnostic, upstreamStatus: null },
        },
        last: 0,
        account: null,
      },
    ])
  })

  it.each([
    ['an event', said('hello')],
    ['falling asleep', { kind: 'event', at: AT, event: { t: 'asleep', on: true } }],
    ['a command outcome', { kind: 'outcome', at: AT, id: op('c'), outcome: 'accepted' }],
  ] as const)('fails as upstream-protocol on %s before the session opened', (_case, input) => {
    const { effects } = run(connecting(8), input)
    expect(settledWith(effects)[0]?.termination).toMatchObject({
      fault: { cause: 'upstream-protocol' },
    })
  })

  it('refuses a command as not open', () => {
    expect(submit(connecting(8), op('c'), SAY)).toEqual({ kind: 'refused', reason: 'not-open' })
  })

  it('asks the upstream to close on a planned stop', () => {
    const { body, effects } = run(connecting(8), { kind: 'stop' })
    expect(body).toMatchObject({ phase: 'closing', closeFor: 'stop' })
    expect(kinds(effects)).toEqual(['close', 'deadline'])
  })
})

describe('a live body while open', () => {
  it('takes an unseen command once and sends it; the same identity again is seen', () => {
    const first = taken(open(), op('c'))
    expect(first.receipt).toEqual({ state: 'taken' })
    expect(first.step.effects).toEqual([{ kind: 'send', id: op('c'), command: SAY }])
    const again = taken(first.step.body, op('c'))
    expect(again.receipt).toEqual({ state: 'seen', outcome: 'pending' })
    expect(again.step.effects).toEqual([])
  })

  it('numbers a command outcome as an event and answers it to the same identity', () => {
    const body = taken(open(), op('c')).step.body
    const { body: after, effects } = run(body, {
      kind: 'outcome',
      at: AT,
      id: op('c'),
      outcome: 'accepted',
    })
    expect(effects).toEqual([
      {
        kind: 'deliver',
        from: 2,
        to: 2,
        frames: [{ seq: 2, at: AT, event: { t: 'command', id: op('c'), outcome: 'accepted' } }],
      },
    ])
    expect(taken(after, op('c')).receipt).toEqual({ state: 'seen', outcome: 'accepted' })
  })

  it.each([
    ['a second opening', OPENED],
    [
      'the outcome of a command it never took',
      { kind: 'outcome', at: AT, id: op('x'), outcome: 'accepted' },
    ],
  ] as const)('fails as upstream-protocol on %s', (_case, input) => {
    const { effects } = run(open(), input)
    expect(settledWith(effects)[0]?.termination).toMatchObject({
      fault: { cause: 'upstream-protocol' },
    })
  })

  it('completes when the upstream closes by itself, with the last number', () => {
    const { effects } = run(open(), said('a'), { kind: 'closed' })
    expect(settledWith(effects)).toEqual([
      {
        kind: 'settle',
        termination: { kind: 'completed', reason: 'stop' },
        last: 2,
        account: null,
      },
    ])
  })

  it('keeps the last usage, unnumbered, and writes it only with a close it saw', () => {
    const usage = (lexeme: string): LiveInput => ({
      kind: 'account',
      account: {
        event: 'usage',
        value: {
          usage: [{ name: 'audio', state: 'known', lexeme, unit: 'second' }],
          cost: [],
          trimmed: { state: 'unknown', unit: 'token' },
          place: 'test.invalid',
          duration: { state: 'unknown' },
          revision: '1',
        },
      },
    })
    const reported = run(open(), usage('2'), usage('3'))
    expect(reported.body).toMatchObject({
      next: 2,
      account: { value: { usage: [{ lexeme: '3' }] } },
    })
    expect(reported.effects).toEqual([])
    const closed = run(reported.body, { kind: 'closed' })
    expect(settledWith(closed.effects)[0]?.account).toEqual(reported.body.account)
    const lost = run(reported.body, { kind: 'lost' })
    expect(settledWith(lost.effects)[0]?.account).toBeNull()
    const early = run(connecting(8), usage('1'))
    expect(settledWith(early.effects)[0]?.termination).toMatchObject({
      fault: { cause: 'upstream-protocol' },
    })
  })

  it.each([
    ['the connection goes', { kind: 'lost' }, 'live-connection-lost'],
    ['the session deadline comes', { kind: 'deadline', which: 'session' }, 'live-session-expired'],
  ] as const)('fails as stream-lost when %s', (_case, input, diagnostic) => {
    const { effects } = run(open(), input)
    expect(settledWith(effects)[0]?.termination).toEqual({
      kind: 'failed',
      fault: { cause: 'stream-lost', diagnostic, upstreamStatus: null },
    })
  })

  it.each([
    ['a cancel', { kind: 'cancel', control: op('x') }, { closeFor: 'cancel', control: op('x') }],
    ['an end', { kind: 'end' }, { closeFor: 'end' }],
    ['a planned stop', { kind: 'stop' }, { closeFor: 'stop' }],
  ] as const)('asks the upstream to close on %s', (_case, input, close) => {
    const { body, effects } = run(open(), input)
    expect(body).toMatchObject({ phase: 'closing', ...close })
    expect(kinds(effects)).toEqual(['close', 'deadline'])
  })
})

describe('a live body while closing', () => {
  const closingFor = (input: LiveInput) => run(open(), input).body

  it.each([
    ['a cancel', { kind: 'cancel', control: op('x') }, { kind: 'interrupted', control: op('x') }],
    ['an end', { kind: 'end' }, { kind: 'completed', reason: 'stop' }],
    [
      'a planned stop',
      { kind: 'stop' },
      {
        kind: 'failed',
        fault: {
          cause: 'runtime-lost',
          diagnostic: 'live-stopped-with-its-runtime',
          upstreamStatus: null,
        },
      },
    ],
  ] as const)(
    'settles the close asked for %s, when the upstream closes',
    (_case, input, termination) => {
      const { effects } = run(closingFor(input), { kind: 'closed' })
      expect(settledWith(effects)[0]?.termination).toEqual(termination)
    },
  )

  it.each([
    ['a cancel', { kind: 'cancel', control: op('x') }, { kind: 'interrupted', control: op('x') }],
    [
      'an end',
      { kind: 'end' },
      {
        kind: 'failed',
        fault: { cause: 'stream-lost', diagnostic: 'live-close-deadline', upstreamStatus: null },
      },
    ],
  ] as const)(
    'settles the close asked for %s at the close deadline, without the upstream',
    (_case, input, termination) => {
      const { effects } = run(closingFor(input), { kind: 'deadline', which: 'close' })
      expect(settledWith(effects)[0]?.termination).toEqual(termination)
    },
  )

  it.each([
    ['a cancel', { kind: 'cancel', control: op('x') }, { kind: 'interrupted', control: op('x') }],
    [
      'an end',
      { kind: 'end' },
      {
        kind: 'failed',
        fault: { cause: 'stream-lost', diagnostic: 'live-connection-lost', upstreamStatus: null },
      },
    ],
  ] as const)(
    'settles the close asked for %s when the connection goes, without the upstream',
    (_case, input, termination) => {
      const { effects } = run(closingFor(input), { kind: 'lost' })
      expect(settledWith(effects)[0]?.termination).toEqual(termination)
    },
  )

  it('takes a second cancel or end while closing as already asked, and a second opening as out of phase', () => {
    const closing = closingFor({ kind: 'cancel', control: op('x') })
    for (const again of [{ kind: 'cancel', control: op('y') }, { kind: 'end' }] as const)
      expect(run(closing, again)).toEqual({ body: closing, effects: [] })
    expect(settledWith(run(closing, OPENED).effects)[0]?.termination).toMatchObject({
      fault: { cause: 'upstream-protocol' },
    })
  })

  it('still numbers the events the upstream drains while closing', () => {
    const { effects } = run(closingFor({ kind: 'end' }), said('last words'))
    expect(kinds(effects)).toEqual(['deliver'])
  })

  it('refuses a new command as closing, and answers a seen one', () => {
    const withCommand = taken(open(), op('c')).step.body
    const body = run(withCommand, { kind: 'end' }).body
    expect(submit(body, op('new'), SAY)).toEqual({ kind: 'refused', reason: 'closing' })
    expect(taken(body, op('c')).receipt).toEqual({ state: 'seen', outcome: 'pending' })
  })

  it('ignores the open deadline it no longer waits for, open or closing', () => {
    for (const body of [open(), closingFor({ kind: 'end' })])
      expect(step(body, { kind: 'deadline', which: 'open' })).toEqual({ body, effects: [] })
  })

  it('settles a cancel as interrupted when the session deadline comes while closing', () => {
    const { effects } = run(closingFor({ kind: 'cancel', control: op('x') }), {
      kind: 'deadline',
      which: 'session',
    })
    expect(settledWith(effects)[0]?.termination).toEqual({ kind: 'interrupted', control: op('x') })
  })

  it('turns a close for an end into a planned stop', () => {
    expect(step(closingFor({ kind: 'end' }), { kind: 'stop' }).effects).toEqual([])
    const { effects } = run(closingFor({ kind: 'end' }), { kind: 'stop' }, { kind: 'closed' })
    expect(settledWith(effects)[0]?.termination).toMatchObject({ fault: { cause: 'runtime-lost' } })
  })
})

describe('delivering the events', () => {
  it('keeps one delivery in flight, and goes on only once it is saved', () => {
    const body = run(connecting(8), OPENED).body
    const { body: waiting, effects } = run(body, said('a'), said('b'))
    expect(effects).toEqual([])
    const { effects: next } = run(waiting, SAVED)
    expect(next).toEqual([
      {
        kind: 'deliver',
        from: 2,
        to: 3,
        frames: [
          {
            seq: 2,
            at: AT,
            event: { t: 'transcript', who: 'caller', startMs: 0, endMs: 1, text: 'a' },
          },
          {
            seq: 3,
            at: AT,
            event: { t: 'transcript', who: 'caller', startMs: 0, endMs: 1, text: 'b' },
          },
        ],
      },
    ])
  })

  it.each(['unknown', 'waiting'] as const)(
    'delivers the same key and content again after %s, with what came since held back',
    answer => {
      const first = run(connecting(8), OPENED)
      const { effects } = run(first.body, said('later'), { kind: 'answer', answer })
      expect(effects).toEqual(first.effects)
    },
  )

  it('turns what the buffer cannot hold into a gap, and never drops the delivery in flight', () => {
    const body = run(connecting(2), OPENED).body
    const { body: full } = run(body, said('a'), said('b'), said('c'), said('d'))
    expect(full.frames).toEqual([
      { seq: 1, at: AT, event: { t: 'started', expiresAt: null } },
      { gap: { from: 2, to: 4 } },
      {
        seq: 5,
        at: AT,
        event: { t: 'transcript', who: 'caller', startMs: 0, endMs: 1, text: 'd' },
      },
    ])
    const { effects } = run(full, SAVED)
    expect(effects[0]).toMatchObject({ kind: 'deliver', from: 2, to: 5 })
  })

  it('delivers a gap at the end of the buffer up to where it reaches', () => {
    const body = run(connecting(1), OPENED, said('a')).body
    expect(body.frames.at(-1)).toEqual({ gap: { from: 2, to: 2 } })
    expect(run(body, SAVED).effects).toEqual([
      { kind: 'deliver', from: 2, to: 2, frames: [{ gap: { from: 2, to: 2 } }] },
    ])
  })

  it('never folds a new gap into a gap in flight, so a delivery again is the same', () => {
    const inFlight = run(connecting(1), OPENED, said('a'), SAVED).body
    const { body } = run(inFlight, said('b'), said('c'))
    expect(body.frames.slice(0, 2)).toEqual([
      { gap: { from: 2, to: 2 } },
      { gap: { from: 3, to: 3 } },
    ])
    expect(run(body, { kind: 'answer', answer: 'unknown' }).effects).toEqual([
      { kind: 'deliver', from: 2, to: 2, frames: [{ gap: { from: 2, to: 2 } }] },
    ])
  })

  it('folds what it cannot hold into one gap from the oldest event when nothing is in flight', () => {
    const refused = run(connecting(1), OPENED, { kind: 'answer', answer: 'refused' }).body
    const { body } = run(refused, said('a'), said('b'))
    expect(body.frames).toEqual([
      { gap: { from: 1, to: 2 } },
      {
        seq: 3,
        at: AT,
        event: { t: 'transcript', who: 'caller', startMs: 0, endMs: 1, text: 'b' },
      },
    ])
  })

  it('stops delivering once the receiver refuses, and asks for a control', () => {
    const { body, effects } = run(
      connecting(8),
      OPENED,
      { kind: 'answer', answer: 'refused' },
      said('a'),
    )
    expect(kinds(effects)).toEqual(['deliver', 'record-control'])
    expect(body.refused).toBe(true)
  })
})

describe('after the call settles', () => {
  const settled = () => run(open(), said('a'), { kind: 'closed' })

  it('drops the connection and writes the termination with the last number', () => {
    expect(kinds(settled().effects)).toEqual(['deliver', 'drop', 'settle'])
  })

  it('delivers what is left, then exits', () => {
    const { body } = settled()
    const { body: draining, effects } = run(body, { kind: 'settled' })
    expect(draining.phase).toBe('draining')
    expect(kinds(effects)).toEqual(['deadline'])
    const { body: exited, effects: last } = run(draining, SAVED)
    expect(exited.phase).toBe('exited')
    expect(kinds(last)).toEqual(['exit'])
  })

  it('exits at the drain deadline with what it could not deliver', () => {
    const { body } = run(settled().body, { kind: 'settled' })
    const { body: exited, effects } = run(body, { kind: 'deadline', which: 'drain' })
    expect(exited.phase).toBe('exited')
    expect(kinds(effects)).toEqual(['exit'])
  })

  it('drops the connection and exits without a termination when the execution is no longer its own', () => {
    const { body, effects } = run(open(), { kind: 'superseded' })
    expect(body.phase).toBe('exited')
    expect(effects).toEqual([{ kind: 'drop' }, { kind: 'exit' }])
  })

  it('refuses a command as settled while settling, draining or exited', () => {
    const draining = run(settled().body, { kind: 'settled' }).body
    const exited = run(open(), { kind: 'superseded' }).body
    for (const body of [settled().body, draining, exited])
      expect(submit(body, op('c'), SAY)).toEqual({ kind: 'refused', reason: 'settled' })
  })

  it.each([
    ['a close', { kind: 'closed' }],
    ['a lost connection', { kind: 'lost' }],
    ['a usage', { kind: 'account', account: { event: 'usage', value: { usage: [], cost: [] } } }],
    ['a planned stop', { kind: 'stop' }],
    ['a cancel', { kind: 'cancel', control: op('late') }],
    ['an end', { kind: 'end' }],
    ['an open deadline', { kind: 'deadline', which: 'open' }],
    ['a close deadline', { kind: 'deadline', which: 'close' }],
    ['a session deadline', { kind: 'deadline', which: 'session' }],
  ] as const)('changes nothing on %s once settling or draining', (_case, input) => {
    const draining = run(settled().body, { kind: 'settled' }).body
    for (const body of [settled().body, draining])
      expect(step(body, input as LiveInput)).toEqual({ body, effects: [] })
  })

  it('takes no input once exited', () => {
    const exited = run(open(), { kind: 'superseded' }).body
    const inputs: LiveInput[] = [
      OPENED,
      said('a'),
      { kind: 'closed' },
      { kind: 'lost' },
      SAVED,
      { kind: 'settled' },
      { kind: 'superseded' },
      { kind: 'stop' },
      { kind: 'deadline', which: 'drain' },
    ]
    for (const input of inputs) expect(step(exited, input)).toEqual({ body: exited, effects: [] })
  })
})
