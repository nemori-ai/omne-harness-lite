// P9–P14 of SPEC「性质与证据」(the call port, MC-16 and MC-17), with P1–P8 still checked, and
// P15 (contract S7: a failure without the `unusable` mark does not lose the connection), by the
// bounded exhaustive explorer on the real `createCalls` and `createTasks` over the real
// connection table, at the bounds of `scenarios.ts`: no scenario reaches a violation. A
// violation fails its case with the shortest schedule that showed it. The two-invoke,
// continue-shutdown, task and task-account scenarios are CPU-heavy (thousands of states, each a
// replay) and run in the slow tier. Each exploration runs inside a case, not in a hook, for the same reasons as
// `lifecycle.spec.ts`.
import { describe, expect, it } from 'vitest'
import { explore, type Exploration } from './explore.ts'
import {
  ABORT,
  CALL,
  CALL_FAULTS,
  CALL_RELEASE,
  CALL_SHUTDOWN,
  CALL_TWICE,
  CONTINUE,
  CONTINUE_SHUTDOWN,
  FOREIGN_CANCEL,
  FOREIGN_TASK,
  MARKS,
  TASK,
  TASK_ACCOUNT,
  TASK_COLLISION,
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

describe('marks: invoke and getTask, one request failing with or without the unusable mark', () => {
  it(
    'P1–P15 hold: a failure without the mark leaves the ready connection ready (P15, S7, T1); a marked one loses it',
    async () => {
      const result = await explore(MARKS)
      console.info(readings(result))
      expect(violations(result)).toEqual([])
      // Each request port reaches both endings on a ready connection: the property is not vacuous.
      expect(result.failureEndings).toEqual([
        'transport.answer fail lost',
        'transport.answer fail-usable ready',
        'transport.call fail lost',
        'transport.call fail-usable ready',
        'transport.getTask fail lost',
        'transport.getTask fail-usable ready',
      ])
    },
    EXPLORE_MS,
  )
})

describe('continue: invoke, then continueWithInput at the generation of that moment, drop', () => {
  it('P1–P14 hold', () => holds(CONTINUE), EXPLORE_MS)
})

describe('call-shutdown: invoke, cancel and closeAll', () => {
  it('P1–P14 hold, P13 above all', () => holds(CALL_SHUTDOWN), EXPLORE_MS)
})

describe('call-release: invoke, cancel and release of the key', () => {
  it('P1–P16 hold, P16 above all', () => holds(CALL_RELEASE), EXPLORE_MS)
})

describe('continue-shutdown: invoke, then continueWithInput, drop, closeAll', () => {
  it('P1–P14 hold, P13 at the answer above all', { tags: ['slow'], timeout: EXPLORE_MS }, () =>
    holds(CONTINUE_SHUTDOWN),
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
  it('P1–P14 hold, P12 above all', () => holds(FOREIGN_CANCEL), EXPLORE_MS)
})

describe('foreign-task: another principal of the tenant queries the task alice started', () => {
  it('P1–P14 hold, P12 above all', () => holds(FOREIGN_TASK), EXPLORE_MS)
})

describe('task-account: a task operation never reuses the connection of another peer account', () => {
  it('P1–P14 hold, P12 above all', { tags: ['slow'], timeout: EXPLORE_MS }, () =>
    holds(TASK_ACCOUNT),
  )
})

describe('task-collision: the peer gives the task id again on another peer account of the same principal', () => {
  it('P1–P14 hold, P12 above all', { tags: ['slow'], timeout: EXPLORE_MS }, () =>
    holds(TASK_COLLISION),
  )
})
