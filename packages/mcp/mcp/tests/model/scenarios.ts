// The bounds the explorer runs under, and the counterexamples it is known to find at 1160e92c8.
// The bounds, the states they reach and the time they take are recorded in
// `verification/README.md`; a change here changes that record.
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

/** Two tenants on the same holding; one `ensure` each; ports lawful, hang or late. */
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

/**
 * The counterexamples found at 1160e92c8, by signature. The fix belongs to `w3-mcp-lifecycle`;
 * a fix makes the expected failure of its case fail, and the case moves to the passing ones.
 */
export const KNOWN = {
  B1: 'P7: closeAll leaves `abandoned` without a handler while it waits for the closes; a release() that throws is an unhandled rejection',
  N2: 'P7: a port that throws on a late path (the four chains nobody awaits) is an unhandled rejection',
  P2: 'P8 T2: a teardown port that hangs holds the ensure whose build it belongs to, past every bound',
  N1: 'P8 T2: the store hanging while a failed build marks the catalog holds the ensure past every bound',
  N3: 'P1–P3: a teardown port that throws ends the teardown: the steps after it are skipped, a retry releases a handle twice',
} as const

/** The violations that are N3: consequences of a teardown step that threw. */
export const N3_SIGNATURES: readonly string[] = [
  'P1-released-twice',
  'P1-never-released',
  'P2-held-without-entry',
  'P3-not-asked',
]
