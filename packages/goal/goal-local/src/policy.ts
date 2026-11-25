import { z } from 'zod'

/** Every value the provider runs on. There are no silent defaults: a missing or invalid value refuses to load. */
export const goalPolicySchema = z.strictObject({
  /** How often every tenant is looked at for goals that still owe their session a reminder. */
  reconcileIntervalMs: z.number().int().min(1000),
})

export type GoalPolicy = z.infer<typeof goalPolicySchema>

export class GoalPolicyError extends Error {
  constructor(issues: string) {
    super(`The goal policy is missing or invalid: ${issues}`)
    this.name = 'GoalPolicyError'
  }
}

export function parsePolicy(input: unknown): GoalPolicy {
  const parsed = goalPolicySchema.safeParse(input)
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
  throw new GoalPolicyError(issues.join('; '))
}
