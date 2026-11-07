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
 * The mark decides the loss (P15, contract S7): one key; `invoke` (the peer answers a task), then
 * the initiator's `getTask`. One port call fails: with the mark (`fail`), or, for `transport.call`,
 * the peer's answer and the task method, without it (`fail-usable`). The same scenario reaches
 * both endings on a ready connection: a marked failure loses it, an unmarked one leaves it ready.
 */
export const MARKS: Scenario = {
  name: 'marks',
  keys: ['A'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1, tasks: 1 } },
  peer: 'task',
  taskMethods: ['get'],
  deviations: ['fail', 'fail-usable'],
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
 * As `call`, with a `release` of the key: wherever the close of the connection lands, during the
 * build the call started, between its build and its send, or after the send, nothing goes to the
 * transport of the closed connection after it, a request or a cancel (P16, MC-10).
 */
export const CALL_RELEASE: Scenario = {
  ...CALL,
  name: 'call-release',
  releases: 1,
}

/**
 * As `continue`, with `closeAll`: a continuation in flight at the shutdown answers as one that
 * starts after it, whatever step it waited at (P13 at the answer); the step after the store read
 * would refuse it with `unknown` once the shutdown closed its connection.
 */
export const CONTINUE_SHUTDOWN: Scenario = {
  ...CONTINUE,
  name: 'continue-shutdown',
  closeAll: true,
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

/** Alice's call answered with the task `t1`, as a prelude: every port answers in the send order. */
const A_STARTED_TASK: readonly string[] = [
  'invoke A',
  'answer adoption.endpoint:A ok',
  'answer eligibility.check:A ok',
  'answer store.read:A ok',
  'answer adoption.endpoint:A ok',
  'answer credentials.acquire:A ok',
  'answer landing.start:A ok',
  'answer transports.open:pA1 ok',
  'answer transport.discover:tA1 ok',
  'answer transport.call:tA1 ok',
  'answer transport.answer:r1 ok',
]

/**
 * The task id given again on another peer account (P12, MC-17 step 1): alice's task `t1` is on
 * her first account (A); the peer answers `t1` again to her call on another account (E), which
 * lands on the same key of the task table. Her task operation must not act through E's
 * connection on a task A started: the key is ambiguous and the operation answers `unknown`.
 */
export const TASK_COLLISION: Scenario = {
  name: 'task-collision',
  keys: ['A', 'E'],
  ...NO_LIFECYCLE,
  prelude: A_STARTED_TASK,
  // A's one `invoke` is the prelude's; the exploration branches over E's call and A's query.
  ops: { A: { invokes: 1, tasks: 1 }, E: { invokes: 1 } },
  peer: 'task',
  taskMethods: ['get'],
  deviations: [],
  budget: 0,
}
