// The consumptions that the coordinator mints name their execution. Session keeps the call
// registrations of a session by consumption, and a session holds the executions of all its Runs:
// the same step of two executions must be two consumptions, or the second Run's call registration
// conflicts with the first one's (#502 D4, defect B).
import { describe, expect, it } from 'vitest'
import { decodeActionId, decodeConsumptionId } from '@omne-harness/agent-contract'
import { mainConsumption, stepOf, toolConsumption } from '../src/loop/identities.ts'
import { execution, ok } from './journal-support.ts'

describe('a consumption names its execution as well as its step', () => {
  it('the main reply of the same step in two executions is two consumptions', () => {
    const step = stepOf(1)
    const first = mainConsumption(execution('run-a/execution'), step)
    const second = mainConsumption(execution('run-b/execution'), step)
    expect(first).not.toBe(second)
    expect(mainConsumption(execution('run-a/execution'), step)).toBe(first)
    for (const value of [first, second])
      expect(decodeConsumptionId(String(value))).toEqual({ ok: value })
  })

  it('the result of the same Tool action in two executions is two consumptions', () => {
    const action = ok(decodeActionId('step-1/tool/0'))
    const first = toolConsumption(execution('run-a/execution'), action)
    const second = toolConsumption(execution('run-b/execution'), action)
    expect(first).not.toBe(second)
    for (const value of [first, second])
      expect(decodeConsumptionId(String(value))).toEqual({ ok: value })
  })
})
