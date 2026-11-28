import { expect, it } from 'vitest'
import {
  createGoalLocalApplication,
  GoalPolicyError,
  goalPolicySchema,
} from '@omne-harness/goal-local'

it('the policy has no silent default: every value is asked for, and bounded', () => {
  expect(goalPolicySchema.safeParse({ reconcileIntervalMs: 1000 }).success).toBe(true)
  for (const policy of [{}, { reconcileIntervalMs: 999 }, { reconcileIntervalMs: 1000, more: 1 }])
    expect(goalPolicySchema.safeParse(policy).success).toBe(false)
})

it('a policy that does not stand says which value, before anything is opened', async () => {
  const options = { policy: { reconcileIntervalMs: 5 } } as never
  const refused = createGoalLocalApplication(options)
  await expect(refused).rejects.toBeInstanceOf(GoalPolicyError)
  await expect(refused).rejects.toThrow(
    'The goal policy is missing or invalid: reconcileIntervalMs',
  )
})
