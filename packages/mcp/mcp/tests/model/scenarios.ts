import type { Scenario } from './explore.ts'

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

export const BOUNDS: Scenario = { ...REBUILD, name: 'bounds', anyBound: true }

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

export const TWO_ACCOUNTS: Scenario = {
  ...TWO_KEYS,
  name: 'two-accounts',
  keys: ['A', 'C'],
}

const NO_LIFECYCLE = { ensures: 0, releases: 0, closeAll: false, loses: 0 } as const

export const CALL: Scenario = {
  name: 'call',
  keys: ['A'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1, cancels: 1 } },
  deviations: [],
  budget: 0,
}

export const ABORT: Scenario = {
  name: 'abort',
  keys: ['A'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1 } },
  aborts: 1,
  deviations: [],
  budget: 0,
}

export const CALL_SHUTDOWN: Scenario = {
  ...CALL,
  name: 'call-shutdown',
  closeAll: true,
}

export const CALL_FAULTS: Scenario = {
  ...CALL,
  name: 'call-faults',
  deviations: ['fail', 'reject', 'throw'],
  budget: 1,
}

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

export const CALL_TWICE: Scenario = {
  ...CALL,
  name: 'call-twice',
  ops: { A: { invokes: 2, cancels: 1 } },
}

export const CONTINUE: Scenario = {
  name: 'continue',
  keys: ['A'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1, continues: 1 } },
  drops: 1,
  deviations: [],
  budget: 0,
}

export const CALL_RELEASE: Scenario = {
  ...CALL,
  name: 'call-release',
  releases: 1,
}

export const CONTINUE_SHUTDOWN: Scenario = {
  ...CONTINUE,
  name: 'continue-shutdown',
  closeAll: true,
}

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

export const TASK_METHODS_ALL: Scenario = {
  ...TASK,
  name: 'task-methods',
  closeAll: false,
  ops: { A: { invokes: 1, tasks: 4 } },
  taskMethods: ['get', 'result', 'input', 'cancel'],
  drops: 0,
}

export const FOREIGN_CANCEL: Scenario = {
  name: 'foreign-cancel',
  keys: ['A', 'C', 'D'],
  ...NO_LIFECYCLE,
  ops: { A: { invokes: 1 }, C: { cancels: 1 }, D: { cancels: 1 } },
  deviations: [],
  budget: 0,
}

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

const C_CONNECTED: readonly string[] = [
  'ensure C',
  'answer adoption.endpoint:C ok',
  'answer credentials.acquire:C ok',
  'answer landing.start:C ok',
  'answer transports.open:pC1 ok',
  'answer transport.discover:tC1 ok',
]

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

export const TASK_COLLISION: Scenario = {
  name: 'task-collision',
  keys: ['A', 'E'],
  ...NO_LIFECYCLE,
  prelude: A_STARTED_TASK,
  ops: { A: { invokes: 1, tasks: 1 }, E: { invokes: 1 } },
  peer: 'task',
  taskMethods: ['get'],
  deviations: [],
  budget: 0,
}
