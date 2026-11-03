import type { CalendarSupplyApplication } from '@omne-harness/calendar'
import {
  calendarImportSeedInputSchema,
  calendarRefreshInputSchema,
  type CalendarCallContext,
} from '@omne-harness/calendar-contract'
import { z } from 'zod'
import type { CalendarRunnerEvent } from './events.ts'

export const timerDelaySchema = z.number().int().min(1).max(2_147_483_647)
const operationKeySchema = calendarRefreshInputSchema.unwrap().shape.operationKey

export const calendarRunnerConfigurationSchema = z.strictObject({
  contextSupplier: z.custom<() => Promise<CalendarCallContext>>(
    value => typeof value === 'function',
  ),
  seed: calendarImportSeedInputSchema.nullable(),
  initializationOperationKey: operationKeySchema,
  acknowledgementKey: operationKeySchema,
  intervalMs: timerDelaySchema,
  drainTimeoutMs: timerDelaySchema,
  limit: z.number().int().min(1).max(100),
  phases: z.strictObject({
    recover: z.boolean(),
    runDue: z.boolean(),
    deliverReactions: z.boolean(),
  }),
  observer: z.strictObject({
    name: z.string().trim().min(1),
    observe: z.custom<(event: CalendarRunnerEvent) => void | Promise<void>>(
      value => typeof value === 'function',
    ),
  }),
})

export type CalendarRunnerConfiguration = z.infer<typeof calendarRunnerConfigurationSchema>
export type CalendarSupplyRunnerOptions = CalendarRunnerConfiguration &
  Readonly<{ supply: CalendarSupplyApplication }>
