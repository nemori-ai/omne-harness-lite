// P9–P14 of SPEC「性质与证据」(the call port, MC-16 and MC-17), with P1–P8 still checked, by the
// bounded exhaustive explorer on the real `createCalls` and `createTasks` over the real
// connection table, at the bounds of `scenarios.ts`: no scenario reaches a violation. A
// violation fails its case with the shortest schedule that showed it. The wide, task and
// isolation scenarios are CPU-heavy (tens of thousands of states, each a replay) and run in the
// slow tier. Each exploration runs inside a case, not in a hook, for the same reasons as
// `lifecycle.spec.ts`.
import { describe, expect, it } from 'vitest'
import { explore, type Exploration } from './explore.ts'
import {
  ABORT,
  CALL,
  CALL_FAULTS,
  CALL_SHUTDOWN,
  CALL_TWICE,
  CONTINUE,
  FOREIGN_CANCEL,
  FOREIGN_TASK,
  TASK,
  TASK_ACCOUNT,
  TASK_METHODS_ALL,
} from './scenarios.ts'

function violations(result: Exploration): readonly string[] {
  return result.violations.map(
    item => `${item.property} ${item.signature}: ${item.detail}\n  ${item.trace.join('\n  ')}`,
  )
}

/** The readings a run reports: states, replays, depth and time, for `verification/README.md`. */
function readings(result: Exploration): string {
  const { scenario, states, runs, depth, elapsedMs } = result
  return `${scenario.name}: ${states} states, ${runs} runs, depth ${depth}, ${elapsedMs} ms`
}

const EXPLORE_MS = 600_000

async function holds(scenario: Parameters<typeof explore>[0]): Promise<void> {
  const result = await explore(scenario)
  console.info(readings(result))
  expect(violations(result)).toEqual([])
}

describe('call: one key, invoke and cancel, lawful ports that may hang or answer late', () => {
  it('P1–P14 hold', () => holds(CALL), EXPLORE_MS)
})

describe("abort: one key, invoke and the caller's abort", () => {
  it('P1–P14 hold', () => holds(ABORT), EXPLORE_MS)
})

describe('call-faults: invoke and cancel, one port failing, rejecting or throwing', () => {
  it('P1–P14 hold', () => holds(CALL_FAULTS), EXPLORE_MS)
})

describe('continue: invoke, then continueWithInput at the generation of that moment, drop', () => {
  it('P1–P14 hold', () => holds(CONTINUE), EXPLORE_MS)
})

describe('call-shutdown: invoke, cancel and closeAll', () => {
  it('P1–P14 hold, P13 above all', { tags: ['slow'], timeout: EXPLORE_MS }, () =>
    holds(CALL_SHUTDOWN),
  )
})

describe('call-twice: two invoke on one correlation key, cancel', () => {
  it('P1–P14 hold, P11 above all', { tags: ['slow'], timeout: EXPLORE_MS }, () => holds(CALL_TWICE))
})

describe('task: the peer answers a task, the initiator queries it, drop, closeAll', () => {
  it('P1–P14 hold', { tags: ['slow'], timeout: EXPLORE_MS }, () => holds(TASK))
})

describe('task-methods: each of the four task operations once', () => {
  it('P1–P14 hold', { tags: ['slow'], timeout: EXPLORE_MS }, () => holds(TASK_METHODS_ALL))
})

describe('foreign-cancel: another principal, and the same principal text in another tenant, cancel', () => {
  it('P1–P14 hold, P12 above all', { tags: ['slow'], timeout: EXPLORE_MS }, () =>
    holds(FOREIGN_CANCEL),
  )
})

describe('foreign-task: another principal of the tenant queries the task alice started', () => {
  it('P1–P14 hold, P12 above all', { tags: ['slow'], timeout: EXPLORE_MS }, () =>
    holds(FOREIGN_TASK),
  )
})

describe('task-account: a task operation never reuses the connection of another peer account', () => {
  it('P1–P14 hold, P12 above all', { tags: ['slow'], timeout: EXPLORE_MS }, () =>
    holds(TASK_ACCOUNT),
  )
})
