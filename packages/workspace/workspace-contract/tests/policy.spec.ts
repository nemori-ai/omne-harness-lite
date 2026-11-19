import { describe, expect, it } from 'vitest'
import { decide, type GovernedOperation, type Standing } from '@omne-harness/workspace-contract'

const STANDINGS: readonly Standing[] = ['none', 'participant', 'admin', 'owner']

/** The policy cell by cell: each row is one operation, each column one standing of the caller. */
const TABLE: Readonly<Record<GovernedOperation, readonly boolean[]>> = {
  view: [false, true, true, true],
  attach: [false, true, true, true],
  associate: [false, true, true, true],
  dissociate: [false, false, true, true],
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
