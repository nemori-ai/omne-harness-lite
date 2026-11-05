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

// The scenarios of the call port (SPEC MC-16, MC-17, P9–P14). Each one holds a catalog of one
// action; no `ensure`: the calls build the connection themselves.

/** The lifecycle operations none of the call scenarios take. */
const NO_LIFECYCLE = { ensures: 0, releases: 0, closeAll: false, loses: 0 } as const

/** One key; one `invoke`, one `cancel`; ports lawful, hang or late. The smallest call scenario. */
export const CALL: Scenario = {
  name: 'call',
  keys: ['A'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1, cancels: 1 } },
  deviations: [],
  budget: 0,
}

/** As `call`, with the caller's abort instead of `cancel`. */
export const ABORT: Scenario = {
  name: 'abort',
  keys: ['A'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1 } },
  aborts: 1,
  deviations: [],
  budget: 0,
}

/** One key; `invoke`, `cancel`, `closeAll`; ports lawful, hang or late. */
export const CALL_SHUTDOWN: Scenario = {
  ...CALL,
  name: 'call-shutdown',
  closeAll: true,
}

/** One key; `invoke`, `cancel`; one port call fails, rejects or throws when called. */
export const CALL_FAULTS: Scenario = {
  ...CALL,
  name: 'call-faults',
  deviations: ['fail', 'reject', 'throw'],
  budget: 1,
}

/**
 * One key; two `invoke` on the same correlation key and `cancel`: the second `invoke` finds the
 * place taken, or reserves it again after the first answered.
 */
export const CALL_TWICE: Scenario = {
  ...CALL,
  name: 'call-twice',
  ops: { A: { invokes: 2, cancels: 1 } },
}

/** One key; `invoke` then `continueWithInput`, `drop`; the continuation must keep the generation. */
export const CONTINUE: Scenario = {
  name: 'continue',
  keys: ['A'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1, continues: 1 } },
  drops: 1,
  deviations: [],
  budget: 0,
}

/**
 * The peer answers with a task; the initiator queries it; the connection may be dropped first,
 * so the query builds one again; `closeAll`.
 */
export const TASK: Scenario = {
  name: 'task',
  keys: ['A'],
  ...NO_LIFECYCLE,
  closeAll: true,
  ops: { A: { invokes: 1, tasks: 1 } },
  drops: 1,
  peer: 'task',
  taskMethods: ['get'],
  deviations: [],
  budget: 0,
}

/** As `task`, each of the four task operations once, without `closeAll`. */
export const TASK_METHODS_ALL: Scenario = {
  ...TASK,
  name: 'task-methods',
  closeAll: false,
  ops: { A: { invokes: 1, tasks: 4 } },
  taskMethods: ['get', 'result', 'input', 'cancel'],
  drops: 0,
}

/**
 * Isolation of the in-flight table (P12): alice invokes; bob of the same tenant (C) and alice's
 * principal text in another tenant (D) each `cancel` on the same correlation key. Neither may
 * touch alice's call.
 */
export const FOREIGN_CANCEL: Scenario = {
  name: 'foreign-cancel',
  keys: ['A', 'C', 'D'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1 }, C: { cancels: 1 }, D: { cancels: 1 } },
  deviations: [],
  budget: 0,
}

/**
 * Isolation of the task table (P12): alice's call starts a task; bob of the same tenant (C)
 * queries it. He gets `unknown` and no port is asked.
 */
export const FOREIGN_TASK: Scenario = {
  name: 'foreign-task',
  keys: ['A', 'C'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1 }, C: { tasks: 1 } },
  peer: 'task',
  taskMethods: ['get'],
  deviations: [],
  budget: 0,
}

/** The lawful build of C's connection, as a prelude: every port answers in the build order. */
const C_CONNECTED: readonly string[] = [
  'ensure C',
  'answer adoption.endpoint:C ok',
  'answer credentials.acquire:C ok',
  'answer landing.start:C ok',
  'answer transports.open:pC1 ok',
  'answer transport.discover:tC1 ok',
]

/**
 * The task's account (P12, MC-17): bob (C, another peer account) holds a connection of the same
 * tenant and holding from the start; alice's task operation must build its own after hers was
 * dropped, never reuse bob's.
 */
export const TASK_ACCOUNT: Scenario = {
  name: 'task-account',
  keys: ['A', 'C'],
  ...NO_LIFECYCLE,
  ensures: 1,
  ensurers: ['C'],
  prelude: C_CONNECTED,
  ops: { A: { invokes: 1, tasks: 1 } },
  drops: 1,
  peer: 'task',
  taskMethods: ['get'],
  deviations: [],
  budget: 0,
}
