import { z } from 'zod'
import {
  calendarIdSchema,
  calendarProbeObservationSchema,
  calendarSourceStandingSchema,
  calendarSeedMaterialSchema,
  contentHashSchema,
  instantSchema,
} from '@omne-harness/calendar-contract'
import { ackSchema, commandSchema, operationQuerySchema } from '../storage/schema.ts'

export const PARTICIPANT = 'calendar.supply'
export const PROTOCOL = 'calendar-supply-storage/1'
export const HANDLER = 'calendar.supply-read'
export const DOMAIN = 'system.calendar'
export const AUTHORITY_FACT = {
  key: 'calendar.supply-authority',
  protocol: 'calendar-supply-authority/1',
} as const
export const RESULT_FACT = { key: 'calendar.supply-result', protocol: PROTOCOL } as const
export const MIGRATION = { owner: PARTICIPANT, id: 'calendar-supply-1' } as const
export const TABLES = [
  'ca_supply_runs',
  'ca_supply_probes',
  'ca_supply_sources',
  'ca_supply_acks',
  'ca_supply_materials',
] as const
export const PAGE_LIMIT = 100
export const MAX_MATERIAL_BYTES = 67_108_864
export const MAX_RECORD_BYTES = 4 * 1024 * 1024
export const READ_BYTES = 128 * 1024 * 1024
export const text = z
  .string()
  .min(1)
  .refine(value => value.isWellFormed())
export const key = text.refine(value => Buffer.byteLength(value) <= 128)
export const scopeSchema = z.strictObject({ systemScopeRef: text, calendarId: calendarIdSchema })
export const runSchema = z.strictObject({ command: commandSchema, preparedAt: instantSchema })
export const completionSchema = operationQuerySchema.extend({
  operationRef: text,
  completedAt: instantSchema,
  disposition: z.enum(['published', 'noChange', 'withheld', 'rejected']),
})
export const probeQuerySchema = scopeSchema.extend({
  operationKey: key,
  fingerprint: contentHashSchema,
})
export const probeSchema = probeQuerySchema.extend({
  policyVersion: text,
  observation: calendarProbeObservationSchema,
  nextDue: instantSchema,
})
export const acknowledgementQuerySchema = z.strictObject({ id: text, acknowledgementKey: key })
export const storedSchema = z.strictObject({
  reference: text,
  material: calendarSeedMaterialSchema,
})
export const healthSchema = z.strictObject({
  sources: z.array(calendarSourceStandingSchema),
  consecutiveFailures: z.int().nonnegative(),
  lastSuccess: instantSchema.nullable(),
  pendingRuns: z.array(runSchema),
})
export const writeSchema = z
  .discriminatedUnion('action', [
    z.strictObject({ action: z.literal('run.prepare'), systemScopeRef: text, payload: runSchema }),
    z.strictObject({
      action: z.literal('run.complete'),
      systemScopeRef: text,
      payload: completionSchema,
    }),
    z.strictObject({
      action: z.literal('probe.record'),
      systemScopeRef: text,
      payload: probeSchema,
    }),
    z.strictObject({ action: z.literal('ack.prepare'), systemScopeRef: text, payload: ackSchema }),
    z.strictObject({
      action: z.literal('material.preserve'),
      systemScopeRef: text,
      payload: storedSchema,
    }),
  ])
  .superRefine((input, ctx) => {
    const nested =
      input.action === 'run.prepare'
        ? input.payload.command.address.systemScopeRef
        : input.action === 'run.complete'
          ? input.payload.address.systemScopeRef
          : input.action === 'probe.record'
            ? input.payload.systemScopeRef
            : input.systemScopeRef
    if (nested !== input.systemScopeRef) ctx.addIssue({ code: 'custom', message: 'scopeMismatch' })
  })
export type Write = z.infer<typeof writeSchema>
export const readSchema = z.discriminatedUnion('kind', [
  scopeSchema.extend({ kind: z.literal('health') }),
  z.strictObject({ kind: z.literal('material'), systemScopeRef: text, reference: text }),
  z.strictObject({
    kind: z.literal('pending'),
    systemScopeRef: text,
    limit: z.int().min(1).max(PAGE_LIMIT),
  }),
  z.strictObject({
    kind: z.literal('due'),
    systemScopeRef: text,
    at: instantSchema,
    limit: z.int().min(1).max(PAGE_LIMIT),
  }),
])
export type Read = z.infer<typeof readSchema>
