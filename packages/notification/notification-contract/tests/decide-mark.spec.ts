import { describe, expect, it } from 'vitest'
import {
  decideMark,
  UNMARKED,
  type Marks,
  type MarkOperation,
} from '@omne-harness/notification-contract'
import { at, identity } from './fixtures.ts'

const now = at(30)
const earlier = at(10)
const by = identity('newer')

const states = {
  unresolved: UNMARKED,
  done: { ...UNMARKED, resolved: { how: 'done', at: earlier } },
  dismissed: { ...UNMARKED, resolved: { how: 'dismissed', at: earlier } },
  superseded: { ...UNMARKED, supersededBy: by },
  'done and superseded': { ...UNMARKED, resolved: { how: 'done', at: earlier }, supersededBy: by },
} satisfies Record<string, Marks>
type State = keyof typeof states

const apply = (marks: Marks) => ({ kind: 'apply', marks })
const recalled = { kind: 'recalled' }
const refused = (reason: string) => ({ kind: 'refused', reason })
const supersededRefusal = { kind: 'refused', reason: 'superseded', by }

const table: Record<Exclude<MarkOperation, 'seen'>, Record<State, unknown>> = {
  done: {
    unresolved: apply({ ...UNMARKED, resolved: { how: 'done', at: now } }),
    done: recalled,
    dismissed: refused('restore-first'),
    superseded: supersededRefusal,
    'done and superseded': supersededRefusal,
  },
  dismiss: {
    unresolved: apply({ ...UNMARKED, resolved: { how: 'dismissed', at: now } }),
    done: refused('restore-first'),
    dismissed: recalled,
    superseded: supersededRefusal,
    'done and superseded': supersededRefusal,
  },
  restore: {
    unresolved: recalled,
    done: apply(UNMARKED),
    dismissed: apply(UNMARKED),
    superseded: supersededRefusal,
    'done and superseded': supersededRefusal,
  },
}

describe('decideMark answers every operation in every state', () => {
  for (const [operation, row] of Object.entries(table))
    for (const [state, expected] of Object.entries(row))
      it(`${operation} on a notification that is ${state}`, () => {
        expect(decideMark(states[state as State], operation as MarkOperation, now)).toEqual(
          expected,
        )
      })

  it.each(Object.keys(states) as State[])('seen is recorded once when %s', state => {
    const first = decideMark(states[state], 'seen', now)
    expect(first).toEqual(apply({ ...states[state], seenAt: now }))
    expect(decideMark({ ...states[state], seenAt: earlier }, 'seen', now)).toEqual(recalled)
  })

  it('restore keeps the seen mark', () => {
    const marks: Marks = { ...states.done, seenAt: earlier }
    expect(decideMark(marks, 'restore', now)).toEqual(apply({ ...UNMARKED, seenAt: earlier }))
  })
})
