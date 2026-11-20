import { reason, type Reason, type Relation, type Standing } from './values.ts'

/** The things a relation is asked about. The policy is this table and nothing else. */
export type GovernedOperation = 'view' | 'attach' | 'associate' | 'dissociate' | 'destroy'

type Cell = 'allow' | 'not-permitted'

const TABLE: Readonly<Record<GovernedOperation, Readonly<Record<Standing, Cell>>>> = {
  view: { none: 'not-permitted', participant: 'allow', admin: 'allow', owner: 'allow' },
  attach: { none: 'not-permitted', participant: 'allow', admin: 'allow', owner: 'allow' },
  associate: { none: 'not-permitted', participant: 'allow', admin: 'allow', owner: 'allow' },
  dissociate: {
    none: 'not-permitted',
    participant: 'not-permitted',
    admin: 'allow',
    owner: 'allow',
  },
  destroy: { none: 'not-permitted', participant: 'not-permitted', admin: 'allow', owner: 'allow' },
}

/** Whether a caller with this standing may do this. Replacing the governance policy replaces this table. */
export function decide(caller: Standing, operation: GovernedOperation): Cell {
  return TABLE[operation][caller]
}

/** The things a caller does to a relation: its own when leaving, another tenant's otherwise. */
export type RelationOperation =
  | 'grant-participation'
  | 'grant-admin'
  | 'revoke-admin'
  | 'remove'
  | 'leave'

/** `set` and `end` change the target's relation. `unchanged` is done already. */
export type RelationDecision =
  | Readonly<{ kind: 'set'; relation: Relation }>
  | Readonly<{ kind: 'end' }>
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'not-permitted' }>
  | Readonly<{ kind: 'not-performed'; reason: Reason }>

const DECISIONS = {
  deny: { kind: 'not-permitted' },
  same: { kind: 'unchanged' },
  participant: { kind: 'set', relation: { role: 'participant', superAdmin: false } },
  admin: { kind: 'set', relation: { role: 'participant', superAdmin: true } },
  end: { kind: 'end' },
  'not-a-participant': { kind: 'not-performed', reason: reason('not-a-participant') },
  'owner-needs-none': { kind: 'not-performed', reason: reason('owner-needs-none') },
  'not-an-admin': { kind: 'not-performed', reason: reason('not-an-admin') },
} as const satisfies Record<string, RelationDecision>

type Decision = keyof typeof DECISIONS
type Row = Readonly<Record<Standing, Decision>>
const row = (none: Decision, participant: Decision, admin: Decision, owner: Decision): Row => ({
  none,
  participant,
  admin,
  owner,
})
const DENY = row('deny', 'deny', 'deny', 'deny')
const LEFT = row('end', 'end', 'end', 'end')

/** Operation, then the caller, then the target's standing. A super-admin grants no super-admin and touches none. */
const RELATIONS: Readonly<Record<RelationOperation, Readonly<Record<Standing, Row>>>> = {
  'grant-participation': {
    none: DENY,
    participant: DENY,
    admin: row('participant', 'same', 'same', 'same'),
    owner: row('participant', 'same', 'same', 'same'),
  },
  'grant-admin': {
    none: DENY,
    participant: DENY,
    admin: DENY,
    owner: row('not-a-participant', 'admin', 'same', 'owner-needs-none'),
  },
  'revoke-admin': {
    none: DENY,
    participant: DENY,
    admin: DENY,
    owner: row('not-an-admin', 'same', 'participant', 'not-an-admin'),
  },
  remove: {
    none: DENY,
    participant: DENY,
    admin: row('same', 'end', 'deny', 'deny'),
    owner: row('same', 'end', 'end', 'deny'),
  },
  leave: { none: DENY, participant: LEFT, admin: LEFT, owner: DENY },
}

/** What this caller's operation does to a target of this standing. Leaving names no target. */
export function govern(
  caller: Standing,
  operation: RelationOperation,
  target: Standing,
): RelationDecision {
  return DECISIONS[RELATIONS[operation][caller][target]]
}
