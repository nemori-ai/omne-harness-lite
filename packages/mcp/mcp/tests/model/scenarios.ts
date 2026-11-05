// The bounds the explorer runs under. The bounds, the states they reach and the time they take are
// recorded in `verification/README.md`; a change here changes that record.
import type { Scenario } from './explore.ts'

/** One key; two `ensure`, so the second rebuilds after the first; `closeAll`; ports lawful, hang or late. */
export const REBUILD: Scenario = {
  name: 'rebuild',
  keys: ['A'],
  ensures: 2,
  releases: 0,
  closeAll: true,
  loses: 0,
  deviations: [],
  budget: 0,
}

/**
 * As `rebuild`, with bounds of different lengths: any bound may fire next, so the bound of the
 * second `ensure` can fire while the first holds the critical section or the build it joined.
 */
export const BOUNDS: Scenario = { ...REBUILD, name: 'bounds', anyBound: true }

/** One key; `ensure`, `release`, `lose`, `closeAll`; one port call fails, rejects or answers `unconfirmed`. */
export const FAULTS: Scenario = {
  name: 'faults',
  keys: ['A'],
  ensures: 1,
  releases: 1,
  closeAll: true,
  loses: 1,
  deviations: ['fail', 'reject', 'unconfirmed'],
  budget: 1,
}

/** One key; `ensure`, `closeAll`; one port call throws when it is called. */
export const THROWS: Scenario = {
  name: 'throws',
  keys: ['A'],
  ensures: 1,
  releases: 0,
  closeAll: true,
  loses: 0,
  deviations: ['throw'],
  budget: 1,
}

/** One key; two `ensure`, `release`, `lose`, `closeAll`; ports lawful, hang or late. */
export const WIDE: Scenario = {
  name: 'wide',
  keys: ['A'],
  ensures: 2,
  releases: 1,
  closeAll: true,
  loses: 1,
  deviations: [],
  budget: 0,
}

/** Two keys that differ in the tenant only; one `ensure` each; ports lawful, hang or late. */
export const TWO_KEYS: Scenario = {
  name: 'two-keys',
  keys: ['A', 'B'],
  ensures: 1,
  releases: 0,
  closeAll: false,
  loses: 0,
  deviations: [],
  budget: 0,
}

/** Two keys that differ in the peer account only; one `ensure` each; ports lawful, hang or late. */
export const TWO_ACCOUNTS: Scenario = {
  ...TWO_KEYS,
  name: 'two-accounts',
  keys: ['A', 'C'],
}
