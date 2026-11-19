import type { Standing } from './values.ts'

/** The things a relation is asked about. The policy is this table and nothing else. */
export type GovernedOperation = 'view' | 'attach' | 'associate' | 'dissociate'

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
}

/** Whether a caller with this standing may do this. Replacing the governance policy replaces this table. */
export function decide(caller: Standing, operation: GovernedOperation): Cell {
  return TABLE[operation][caller]
}
