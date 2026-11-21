import { z } from 'zod'

/** Every value the provider runs on. There are no silent defaults: a missing or invalid value refuses to load. */
export const dispatchPolicySchema = z.strictObject({
  /** How many dispatches of one session may be accepted or started at the same time. */
  maxOpen: z.number().int().min(1).max(64),
  /** How often every tenant is looked at for dispatches that still have a step to take. */
  reconcileIntervalMs: z.number().int().min(1000),
})

export type DispatchPolicy = z.infer<typeof dispatchPolicySchema>

export class DispatchPolicyError extends Error {
  constructor(issues: string) {
    super(`The dispatch policy is missing or invalid: ${issues}`)
    this.name = 'DispatchPolicyError'
  }
}

export function parsePolicy(input: unknown): DispatchPolicy {
  const parsed = dispatchPolicySchema.safeParse(input)
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
  throw new DispatchPolicyError(issues.join('; '))
}
