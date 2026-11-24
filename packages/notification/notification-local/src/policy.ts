import { z } from 'zod'
import { BODY_CEILING, channelNameSchema } from '@omne-harness/notification-contract'

const destinationDefault = z.strictObject({
  channel: channelNameSchema,
  minLevel: z.enum(['strong', 'weak']),
})

/** Every value the provider runs on. There are no silent defaults: a missing or invalid value refuses to load. */
export const notificationPolicySchema = z
  .strictObject({
    bodyLength: z.number().int().min(1).max(BODY_CEILING),
    causalDepth: z.number().int().min(0).max(64),
    pageLimit: z.number().int().min(1).max(500),
    listLimit: z.number().int().min(1).max(50),
    retry: z.strictObject({
      maxAttempts: z.number().int().min(1).max(20),
      backoffMs: z.array(z.number().int().min(0)).max(20),
    }),
    deliverTimeoutMs: z.number().int().min(1).max(600_000),
    beat: z.strictObject({
      defaultMinutes: z.number().int().min(1).nullable(),
      minMinutes: z.number().int().min(1),
      maxMinutes: z.number().int().min(1),
    }),
    scanIntervalMs: z.number().int().min(1000),
    recipients: z.strictObject({
      person: destinationDefault,
      agent: destinationDefault.nullable(),
    }),
  })
  .refine(({ beat }) => beat.minMinutes <= beat.maxMinutes, 'The beat range is empty')
  .refine(
    ({ beat }) =>
      beat.defaultMinutes === null ||
      (beat.defaultMinutes >= beat.minMinutes && beat.defaultMinutes <= beat.maxMinutes),
    'The default beat is outside the beat range',
  )

export type NotificationPolicy = z.infer<typeof notificationPolicySchema>

export class NotificationPolicyError extends Error {
  constructor(issues: string) {
    super(`The notification policy is missing or invalid: ${issues}`)
    this.name = 'NotificationPolicyError'
  }
}

export function parsePolicy(input: unknown): NotificationPolicy {
  const parsed = notificationPolicySchema.safeParse(input)
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
  throw new NotificationPolicyError(issues.join('; '))
}
