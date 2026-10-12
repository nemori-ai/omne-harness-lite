import { expect, it } from 'vitest'
import { checkSessionDriverPolicy } from '@omne-harness-lite/session-runtime'
import { SessionDriverConfig } from '../src/cordis.ts'

it('validates plugin configuration with the actual shared policy owner', async () => {
  const policy = {
    scanLimit: 4,
    intervalMs: 20,
    maxTasks: 2,
    maxHeld: 8,
    maxFailures: 16,
    maxStepsPerPass: 4,
  }
  const result = await SessionDriverConfig['~standard'].validate(policy)
  expect(result).toEqual({ value: policy })
  const parsed = SessionDriverConfig.parse(policy)
  policy.maxTasks = 99
  expect(parsed.maxTasks).toBe(2)
  expect(Object.isFrozen(parsed)).toBe(true)
})

it('rejects extra, missing and malformed policy fields with the same Core result', async () => {
  const policy = {
    scanLimit: 4,
    intervalMs: 20,
    maxTasks: 2,
    maxHeld: 8,
    maxFailures: 16,
    maxStepsPerPass: 4,
  }
  const { maxHeld: _removed, ...missing } = policy
  for (const input of [
    missing,
    { ...policy, maxTasks: '2' },
    { ...policy, maxTasks: 0 },
    { ...policy, callback: () => true },
  ]) {
    expect(checkSessionDriverPolicy(input)).toEqual({ invalidInput: true })
    const result = await SessionDriverConfig['~standard'].validate(input)
    expect(result).toHaveProperty('issues')
  }
})
