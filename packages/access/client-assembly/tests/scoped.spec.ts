import { describe, expect, it } from 'vitest'
import {
  placedDiff,
  SCOPED_OFF,
  stepScoped,
  type ScopedEvent,
  type ScopedState,
  type ScopedStep,
} from '../src/scoped.ts'

const TABLE = [{ name: 'weather', major: 1, contract: { kind: 'null' } as const }]

const READING: ScopedState = { kind: 'reading', again: false, failures: 0 }
const FOLLOWING: ScopedState = { kind: 'following' }

const EVENTS: Readonly<Record<string, ScopedEvent>> = {
  'signed-in': { kind: 'signed-in' },
  read: { kind: 'read', protocols: TABLE },
  unreadable: { kind: 'unreadable' },
  'scoped-changed': { kind: 'scoped-changed' },
  switched: { kind: 'switched' },
  'signed-out': { kind: 'signed-out' },
}

const still = (state: ScopedState): ScopedStep => ({ state, effects: [] })
const readNow: ScopedStep = { state: READING, effects: [{ kind: 'read', failures: 0 }] }
const takeAndRead: ScopedStep = {
  state: READING,
  effects: [{ kind: 'take-all' }, { kind: 'read', failures: 0 }],
}
const out: ScopedStep = { state: SCOPED_OFF, effects: [{ kind: 'take-all' }] }

const EXPECTED: Readonly<Record<string, Readonly<Record<string, ScopedStep>>>> = {
  off: {
    'signed-in': readNow,
    read: still(SCOPED_OFF),
    unreadable: still(SCOPED_OFF),
    'scoped-changed': still(SCOPED_OFF),
    switched: still(SCOPED_OFF),
    'signed-out': still(SCOPED_OFF),
  },
  reading: {
    'signed-in': still(READING),
    read: { state: FOLLOWING, effects: [{ kind: 'place', protocols: TABLE }] },
    unreadable: {
      state: { kind: 'reading', again: false, failures: 1 },
      effects: [{ kind: 'read', failures: 1 }],
    },
    'scoped-changed': { state: { kind: 'reading', again: true, failures: 0 }, effects: [] },
    switched: takeAndRead,
    'signed-out': out,
  },
  following: {
    'signed-in': still(FOLLOWING),
    read: still(FOLLOWING),
    unreadable: still(FOLLOWING),
    'scoped-changed': readNow,
    switched: takeAndRead,
    'signed-out': out,
  },
}

const STATES: Readonly<Record<string, ScopedState>> = {
  off: SCOPED_OFF,
  reading: READING,
  following: FOLLOWING,
}

describe('the connection following scoped, three states by six events (AC-11)', () => {
  for (const [stateName, state] of Object.entries(STATES))
    for (const [eventName, event] of Object.entries(EVENTS))
      it(`${stateName}, ${eventName}`, () => {
        expect(stepScoped(state, event)).toEqual(EXPECTED[stateName]![eventName])
      })

  it('a read that ends while another change was told puts what it read, then reads once more', () => {
    const marked = stepScoped(READING, EVENTS['scoped-changed']!)
    expect(stepScoped(marked.state, EVENTS['read']!)).toEqual({
      state: READING,
      effects: [
        { kind: 'place', protocols: TABLE },
        { kind: 'read', failures: 0 },
      ],
    })
  })

  it('reads that cannot be read in a row count up, and a read that ends starts the count over', () => {
    let state: ScopedState = READING
    const counted: number[] = []
    for (let time = 0; time < 3; time += 1) {
      const step = stepScoped(state, EVENTS['unreadable']!)
      state = step.state
      counted.push(...step.effects.flatMap(each => (each.kind === 'read' ? [each.failures] : [])))
    }
    expect(counted).toEqual([1, 2, 3])
    expect(stepScoped(state, EVENTS['read']!).state).toEqual(FOLLOWING)
    expect(stepScoped(state, EVENTS['switched']!)).toEqual(takeAndRead)
  })

  it('what cannot be read is not a table: nothing is taken', () => {
    const step = stepScoped(FOLLOWING, EVENTS['scoped-changed']!)
    const failed = stepScoped(step.state, EVENTS['unreadable']!)
    expect(failed.effects.some(each => each.kind === 'take-all' || each.kind === 'place')).toBe(
      false,
    )
  })
})

describe('what a read changes of what is put', () => {
  it('puts the new, takes the gone, and takes then puts the changed; the same stays', () => {
    const placed = new Map([
      ['weather/v1', 'a'],
      ['notes/v1', 'b'],
      ['old/v1', 'c'],
    ])
    const told = new Map([
      ['weather/v1', 'a'],
      ['notes/v1', 'B'],
      ['new/v1', 'd'],
    ])
    expect(placedDiff(placed, told)).toEqual({
      take: ['notes/v1', 'old/v1'],
      put: ['notes/v1', 'new/v1'],
    })
  })
})
