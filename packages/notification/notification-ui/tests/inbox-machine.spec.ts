import { describe, expect, it } from 'vitest'
import {
  INITIAL,
  PAGE_CAP,
  keyOf,
  openCount,
  sectionsOf,
  step,
  type Effect,
  type Event,
  type State,
} from '../src/model/inbox-machine.ts'
import { NONE, dismissed, done, entry, page, seen, superseded, view } from './fixtures/entries.ts'

/** Runs events in turn and returns the last state with every effect asked for on the way. */
function run(events: readonly Event[], from: State = INITIAL) {
  let state = from
  const effects: Effect[] = []
  for (const event of events) {
    const next = step(state, event)
    state = next.state
    effects.push(...next.effects)
  }
  return { state, effects }
}
const e1 = entry('e1', 1)
const e2 = entry('e2', 2)
const k1 = keyOf(e1)
const frame = (generation = 1, about: 'inbox' | 'catalog' = 'inbox') =>
  ({ kind: 'frame', generation, about }) as const
const listed = (token: number, entries = [e1, e2], next: number | null = null) =>
  ({ kind: 'list-answered', token, answer: page(entries, next) }) as const
/** Watching, with the first frame taken and the list read. */
const READY = run([{ kind: 'watch' }, frame(), listed(1)]).state

describe('watching', () => {
  it('opens one observation and reads nothing until it is told the inbox may have changed', () => {
    const watched = run([{ kind: 'watch' }])
    expect(watched.effects).toEqual([{ kind: 'observe', generation: 1 }])
    expect(watched.state).toMatchObject({ live: { kind: 'on' }, read: { kind: 'idle' } })
    expect(run([{ kind: 'watch' }], watched.state).effects).toEqual([])
    const framed = run([frame()], watched.state)
    expect(framed.effects).toEqual([{ kind: 'list', token: 1, filter: 'unresolved', after: null }])
  })

  it('a catalogue frame reads nothing', () => {
    expect(run([{ kind: 'watch' }, frame(1, 'catalog')]).effects).toEqual([
      { kind: 'observe', generation: 1 },
    ])
  })

  it('stops the observation when nobody watches, keeps the list, and ignores what still arrives', () => {
    const stopped = run([{ kind: 'unwatch' }], READY)
    expect(stopped.effects).toEqual([{ kind: 'stop-observing' }])
    expect(stopped.state).toMatchObject({ live: { kind: 'off' }, entries: [e1, e2] })
    expect(run([{ kind: 'unwatch' }], stopped.state).effects).toEqual([])
    expect(run([frame()], stopped.state)).toEqual({ state: stopped.state, effects: [] })
    const ended = { kind: 'observation-ended', generation: 1, end: { kind: 'aborted' } } as const
    expect(run([ended], stopped.state)).toEqual({ state: stopped.state, effects: [] })
    expect(run([{ kind: 'watch' }], stopped.state).effects).toEqual([
      { kind: 'observe', generation: 2 },
    ])
  })

  it('ignores a frame and an end of an observation it already replaced', () => {
    expect(run([frame(7)], READY)).toEqual({ state: READY, effects: [] })
    const ended = {
      kind: 'observation-ended',
      generation: 7,
      end: { kind: 'unavailable' },
    } as const
    expect(run([ended], READY)).toEqual({ state: READY, effects: [] })
  })
})

describe('reading the list', () => {
  it('takes page after page and shows the list only when the last page is in', () => {
    const first = run([{ kind: 'watch' }, frame(), listed(1, [e1], 1)])
    expect(first.state.entries).toEqual([])
    expect(first.effects.at(-1)).toEqual({ kind: 'list', token: 1, filter: 'unresolved', after: 1 })
    const second = run([listed(1, [e2])], first.state)
    expect(second.state).toMatchObject({ entries: [e1, e2], read: { kind: 'ready', more: false } })
    expect(second.effects).toEqual([])
  })

  it('stops at the page cap and says that there is more', () => {
    let state = run([{ kind: 'watch' }, frame()]).state
    for (let pageNumber = 1; pageNumber < PAGE_CAP; pageNumber++) {
      const next = run([listed(1, [entry(`p${pageNumber}`, pageNumber)], pageNumber)], state)
      expect(next.effects).toHaveLength(1)
      state = next.state
    }
    const last = run([listed(1, [entry('last', PAGE_CAP)], PAGE_CAP)], state)
    expect(last.effects).toEqual([])
    expect(last.state.read).toEqual({ kind: 'ready', more: true })
    expect(last.state.entries).toHaveLength(PAGE_CAP)
  })

  it('a frame that arrives while it reads makes it read once more, from the start', () => {
    const reading = run([{ kind: 'watch' }, frame(), frame(), frame()])
    expect(reading.effects.filter(effect => effect.kind === 'list')).toHaveLength(1)
    const again = run([listed(1, [e1])], reading.state)
    expect(again.state.entries).toEqual([e1])
    expect(again.effects).toEqual([{ kind: 'list', token: 2, filter: 'unresolved', after: null }])
    expect(run([listed(2)], again.state)).toMatchObject({
      state: { entries: [e1, e2], read: { kind: 'ready' } },
      effects: [],
    })
  })

  it('drops an answer of a read it already replaced', () => {
    const switched = run([{ kind: 'filter', filter: 'all' }], READY)
    expect(switched.effects).toEqual([{ kind: 'list', token: 2, filter: 'all', after: null }])
    expect(run([listed(1, [])], switched.state).state).toBe(switched.state)
    expect(run([{ kind: 'filter', filter: 'all' }], switched.state).effects).toEqual([])
    expect(run([listed(2, [e1])], switched.state).state.entries).toEqual([e1])
  })

  it.each([
    ['basis-unavailable', 'unavailable', [e1, e2]],
    ['unavailable', 'unavailable', [e1, e2]],
    ['uncertain', 'unavailable', [e1, e2]],
    ['invalid', 'unavailable', [e1, e2]],
    ['protocol-rejected', 'unavailable', [e1, e2]],
    ['denied', 'denied', []],
    ['not-found', 'denied', []],
  ] as const)(
    'an answer of %s is %s: it never shows an empty inbox it did not read',
    (outcome, reason, kept) => {
      const answer = { outcome, body: {} } as never
      const failed = run([{ kind: 'refresh' }, { kind: 'list-answered', token: 2, answer }], READY)
      expect(failed.state.read).toEqual({ kind: 'failed', reason })
      expect(failed.state.entries).toEqual(kept)
    },
  )

  it('a failed read that a frame overtook reads again', () => {
    const answer = { outcome: 'basis-unavailable' } as never
    const failed = run(
      [{ kind: 'refresh' }, frame(), { kind: 'list-answered', token: 2, answer }],
      READY,
    )
    expect(failed.effects.at(-1)).toEqual({
      kind: 'list',
      token: 3,
      filter: 'unresolved',
      after: null,
    })
    expect(failed.state.read).toMatchObject({ kind: 'reading', token: 3 })
  })
})

describe('an observation that ends', () => {
  const ended = (end: object, generation = 1) =>
    ({ kind: 'observation-ended', generation, end }) as never

  it.each([
    [{ kind: 'unavailable' }],
    [{ kind: 'uncertain' }],
    [{ kind: 'ended', reason: 'unavailable' }],
    [{ kind: 'refused', outcome: 'basis-unavailable' }],
  ])(
    '%j: keeps the list, retries later with a longer wait each time, and opens a new observation',
    end => {
      const first = run([ended(end)], READY)
      expect(first.state).toMatchObject({
        live: { kind: 'retrying', attempt: 1 },
        entries: [e1, e2],
      })
      expect(first.effects).toEqual([{ kind: 'reconnect-later', generation: 1, attempt: 1 }])
      const due = run([{ kind: 'reconnect-due', generation: 1 }], first.state)
      expect(due.effects).toEqual([{ kind: 'observe', generation: 2 }])
      const second = run([ended(end, 2)], due.state)
      expect(second.effects).toEqual([{ kind: 'reconnect-later', generation: 2, attempt: 2 }])
      const back = run([{ kind: 'reconnect-due', generation: 2 }, frame(3)], second.state)
      expect(back.state.live).toEqual({ kind: 'on' })
      expect(back.effects.at(-1)).toMatchObject({ kind: 'list' })
    },
  )

  it('reads once anyway when the observation ended before it ever said anything', () => {
    const blind = run([{ kind: 'watch' }, ended({ kind: 'unavailable' })])
    expect(blind.effects).toEqual([
      { kind: 'observe', generation: 1 },
      { kind: 'reconnect-later', generation: 1, attempt: 1 },
      { kind: 'list', token: 1, filter: 'unresolved', after: null },
    ])
  })

  it.each([[{ kind: 'ended', reason: 'denied' }], [{ kind: 'refused', outcome: 'denied' }]])(
    '%j: shows nothing and does not retry',
    end => {
      const denied = run([ended(end)], READY)
      expect(denied.state).toMatchObject({
        live: { kind: 'denied' },
        entries: [],
        read: { kind: 'failed', reason: 'denied' },
      })
      expect(denied.effects).toEqual([])
    },
  )

  it('a reconnect that is due for an observation it replaced, or when it is not retrying, does nothing', () => {
    expect(run([{ kind: 'reconnect-due', generation: 1 }], READY).effects).toEqual([])
    const retrying = run([ended({ kind: 'unavailable' })], READY).state
    expect(run([{ kind: 'reconnect-due', generation: 9 }], retrying).effects).toEqual([])
  })
})

describe('marking', () => {
  const marked = (answer: object) => ({ kind: 'mark-answered', key: k1, answer }) as never

  it('asks once per notification at a time, and takes the marks the server answered', () => {
    const asked = run([{ kind: 'mark', key: k1, operation: 'done' }], READY)
    expect(asked.effects).toEqual([
      { kind: 'mark', key: k1, ref: { source: 'demo.things', event: 'e1' }, operation: 'done' },
    ])
    expect(asked.state.marking).toEqual({ [k1]: 'done' })
    expect(asked.state.entries[0]!.marks).toBe(NONE)
    expect(run([{ kind: 'mark', key: k1, operation: 'dismiss' }], asked.state).effects).toEqual([])
    const answered = run([marked({ outcome: 'succeeded', body: done })], asked.state)
    expect(answered.state.entries.map(item => item.marks)).toEqual([done, NONE])
    expect(answered.state.marking).toEqual({})
    expect(answered.effects).toEqual([])
    const recalled = run(
      [{ kind: 'mark', key: k1, operation: 'done' }, marked({ outcome: 'no-change', body: done })],
      answered.state,
    )
    expect(recalled.state.entries[0]!.marks).toEqual(done)
  })

  it('does nothing for a notification that is not in the list, or an answer nobody waits for', () => {
    expect(run([{ kind: 'mark', key: 'nope', operation: 'done' }], READY)).toEqual({
      state: READY,
      effects: [],
    })
    expect(run([marked({ outcome: 'succeeded', body: done })], READY)).toEqual({
      state: READY,
      effects: [],
    })
  })

  it.each([
    [{ outcome: 'conflict', body: { reason: 'restore-first' } }, 'restore-first', true],
    [{ outcome: 'conflict', body: { reason: 'superseded' } }, 'superseded', true],
    [{ outcome: 'not-found', body: {} }, 'gone', true],
    [{ outcome: 'unknown' }, 'unknown', true],
    [{ outcome: 'uncertain' }, 'unknown', true],
    [{ outcome: 'denied' }, 'denied', false],
    [{ outcome: 'basis-unavailable' }, 'unavailable', false],
    [{ outcome: 'unavailable' }, 'unavailable', false],
    [{ outcome: 'invalid', body: { reason: 'request' } }, 'unavailable', false],
    [{ outcome: 'protocol-rejected' }, 'unavailable', false],
  ])('%j leaves the marks as they were and says %s', (answer, notice, rereads) => {
    const failed = run([{ kind: 'mark', key: k1, operation: 'done' }, marked(answer)], READY)
    expect(failed.state.entries[0]!.marks).toBe(NONE)
    expect(failed.state.notices).toEqual({ [k1]: notice })
    expect(failed.state.marking).toEqual({})
    expect(failed.effects.slice(1)).toEqual(
      rereads ? [{ kind: 'list', token: 2, filter: 'unresolved', after: null }] : [],
    )
  })

  it('a new try clears what the last one said', () => {
    const failed = run(
      [{ kind: 'mark', key: k1, operation: 'done' }, marked({ outcome: 'denied' })],
      READY,
    )
    expect(run([{ kind: 'mark', key: k1, operation: 'done' }], failed.state).state.notices).toEqual(
      {},
    )
  })
})

describe('opening one notification', () => {
  it('reads it in full and marks it seen when it was not', () => {
    const opened = run([{ kind: 'open', key: k1 }], READY)
    const ref = { source: 'demo.things', event: 'e1' }
    expect(opened.effects).toEqual([
      { kind: 'read', token: 2, ref },
      { kind: 'mark', key: k1, ref, operation: 'seen' },
    ])
    expect(opened.state.opened).toEqual({ key: k1, token: 2, view: 'reading' })
    const full = view(e1)
    const read = run(
      [{ kind: 'read-answered', token: 2, answer: { outcome: 'succeeded', body: full } }],
      opened.state,
    )
    expect(read.state.opened).toEqual({ key: k1, token: 2, view: full })
    expect(run([{ kind: 'close' }], read.state).state.opened).toBeNull()
    expect(run([{ kind: 'close' }], READY).state).toBe(READY)
  })

  it('does not mark again what is seen, and does not open what is not in the list', () => {
    const state: State = { ...READY, entries: [entry('e1', 1, { marks: seen })] }
    expect(run([{ kind: 'open', key: k1 }], state).effects).toHaveLength(1)
    expect(run([{ kind: 'open', key: 'nope' }], READY)).toEqual({ state: READY, effects: [] })
  })

  it.each([
    [{ outcome: 'not-found', body: {} }, 'gone'],
    [{ outcome: 'basis-unavailable' }, 'unavailable'],
    [{ outcome: 'denied' }, 'unavailable'],
    [{ outcome: 'unavailable' }, 'unavailable'],
  ])('%j shows %s in place of the body', (answer, shown) => {
    const opened = run([{ kind: 'open', key: k1 }], READY).state
    const read = run([{ kind: 'read-answered', token: 2, answer: answer as never }], opened)
    expect(read.state.opened?.view).toBe(shown)
  })

  it('drops the answer of a read for a notification it no longer shows', () => {
    const other = run(
      [
        { kind: 'open', key: k1 },
        { kind: 'open', key: keyOf(e2) },
      ],
      READY,
    ).state
    const stale = {
      kind: 'read-answered',
      token: 2,
      answer: { outcome: 'not-found', body: {} },
    } as never
    expect(run([stale], other).state.opened).toMatchObject({ key: keyOf(e2), view: 'reading' })
    const closed = run([{ kind: 'close' }, stale], other).state
    expect(closed.opened).toBeNull()
  })
})

describe('the sections of the panel', () => {
  it('puts what is open first, newest on top, and what is settled or replaced after it', () => {
    const state: State = {
      ...READY,
      entries: [
        entry('a', 1),
        entry('b', 2, { marks: done }),
        entry('c', 3, { marks: seen }),
        entry('d', 4, { marks: superseded }),
        entry('e', 5, { marks: dismissed }),
      ],
    }
    const sections = sectionsOf(state)
    expect(sections.open.map(item => item.event)).toEqual(['c', 'a'])
    expect(sections.settled.map(item => item.event)).toEqual(['e', 'd', 'b'])
    expect(openCount(state)).toBe(2)
    expect(openCount(INITIAL)).toBe(0)
  })
})
