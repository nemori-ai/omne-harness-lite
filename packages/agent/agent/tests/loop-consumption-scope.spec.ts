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
