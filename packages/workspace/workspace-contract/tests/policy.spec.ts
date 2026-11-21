import { describe, expect, it } from 'vitest'
import {
  decide,
  govern,
  reason,
  type GovernedOperation,
  type RelationDecision,
  type RelationOperation,
  type Standing,
} from '@omne-harness/workspace-contract'

const STANDINGS: readonly Standing[] = ['none', 'participant', 'admin', 'owner']

/** The policy cell by cell: each row is one operation, each column one standing of the caller. */
const TABLE: Readonly<Record<GovernedOperation, readonly boolean[]>> = {
  view: [false, true, true, true],
  attach: [false, true, true, true],
  associate: [false, true, true, true],
  dissociate: [false, false, true, true],
  destroy: [false, false, true, true],
}

describe('the governance policy is one table', () => {
  for (const [operation, row] of Object.entries(TABLE) as [GovernedOperation, readonly boolean[]][])
    it.each(STANDINGS.map((standing, index) => [standing, row[index]!] as const))(
      `${operation} by %s: allowed is %s`,
      (standing, allowed) => {
        expect(decide(standing, operation)).toBe(allowed ? 'allow' : 'not-permitted')
      },
    )
})

type Cell =
  | 'deny'
  | 'same'
  | 'participant'
  | 'admin'
  | 'end'
  | 'not-a-participant'
  | 'owner-needs-none'
  | 'not-an-admin'
const DENY: readonly Cell[] = ['deny', 'deny', 'deny', 'deny']

/** Each row is the caller, each column the target's standing: none, participant, admin, owner. Leaving names no target. */
const RELATIONS: Readonly<Record<RelationOperation, Readonly<Record<Standing, readonly Cell[]>>>> =
  {
    'grant-participation': {
      none: DENY,
      participant: DENY,
      admin: ['participant', 'same', 'same', 'same'],
      owner: ['participant', 'same', 'same', 'same'],
    },
    'grant-admin': {
      none: DENY,
      participant: DENY,
      admin: DENY,
      owner: ['not-a-participant', 'admin', 'same', 'owner-needs-none'],
    },
    'revoke-admin': {
      none: DENY,
      participant: DENY,
      admin: DENY,
      owner: ['not-an-admin', 'same', 'participant', 'not-an-admin'],
    },
    remove: {
      none: DENY,
      participant: DENY,
      admin: ['same', 'end', 'deny', 'deny'],
      owner: ['same', 'end', 'end', 'deny'],
    },
    leave: {
      none: DENY,
      participant: ['end', 'end', 'end', 'end'],
      admin: ['end', 'end', 'end', 'end'],
      owner: DENY,
    },
  }

const DECISIONS: Readonly<Record<Cell, RelationDecision>> = {
  deny: { kind: 'not-permitted' },
  same: { kind: 'unchanged' },
  participant: { kind: 'set', relation: { role: 'participant', superAdmin: false } },
  admin: { kind: 'set', relation: { role: 'participant', superAdmin: true } },
  end: { kind: 'end' },
  'not-a-participant': { kind: 'not-performed', reason: reason('not-a-participant') },
  'owner-needs-none': { kind: 'not-performed', reason: reason('owner-needs-none') },
  'not-an-admin': { kind: 'not-performed', reason: reason('not-an-admin') },
}

describe('what a caller may do to a relation is one table of caller, operation and target', () => {
  const cases = (Object.keys(RELATIONS) as RelationOperation[]).flatMap(operation =>
    STANDINGS.flatMap(caller =>
      STANDINGS.map(
        (target, index) =>
          [operation, caller, target, RELATIONS[operation][caller][index]!] as const,
      ),
    ),
  )
  it.each(cases)('%s by %s on %s: %s', (operation, caller, target, cell) => {
    expect(govern(caller, operation, target)).toEqual(DECISIONS[cell])
  })
})
