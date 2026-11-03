import { Temporal } from '@js-temporal/polyfill'
import {
  calendarOwnerSchema,
  calendarCallContextSchema,
  localDateSchema,
  instantSchema,
  timezoneSchema,
} from '@omne-harness/calendar-contract'
import { z } from 'zod'

export const SCHEDULE_PROTOCOL = 'omne.calendar-schedule/1'
export const ScheduleRefSchema = z.string().min(1)
export const ScheduleUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
export const ScheduleIdSchema = ScheduleUuidSchema.brand<'ScheduleId'>()
export const ScheduleOperationRefSchema = ScheduleUuidSchema.brand<'ScheduleOperationRef'>()
export const ScheduleOwnerSchema = calendarOwnerSchema
export type ScheduleOwner = z.infer<typeof ScheduleOwnerSchema>
export const ScheduleCallContextSchema = calendarCallContextSchema
export type ScheduleCallContext = z.infer<typeof ScheduleCallContextSchema>
export const ScheduleLocalDateSchema = localDateSchema
export const ScheduleInstantSchema = instantSchema
export const ScheduleTimezoneSchema = timezoneSchema
export const ScheduleCivilSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  .refine(value => {
    try {
      return (
        Temporal.PlainDateTime.from(value, { overflow: 'reject' }).toString({
          smallestUnit: 'second',
        }) === value
      )
    } catch {
      return false
    }
  })
  .brand<'ScheduleCivil'>()
export const ScheduleTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)
export const ScheduleRevisionSchema = z.int().positive()
export const ScheduleFingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .brand<'ScheduleFingerprint'>()
export function scheduleUtf8TextSchema(maximum: number) {
  return z
    .string()
    .min(1)
    .refine(value => Buffer.byteLength(value, 'utf8') <= maximum, 'UTF-8 byte limit exceeded')
}
export function scheduleCodePointTextSchema(maximum: number) {
  return z
    .string()
    .min(1)
    .refine(value => Array.from(value).length <= maximum, 'Code point limit exceeded')
}
export const ScheduleLabelSchema = scheduleCodePointTextSchema(200)
export const ScheduleInstructionSchema = scheduleUtf8TextSchema(65_536)
export const ScheduleReasonSchema = scheduleCodePointTextSchema(1_024)
export const ScheduleOperationKeySchema = scheduleUtf8TextSchema(128)

// Reject objects with runtime serialization behavior before Zod copies their properties.
function isJsonData(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number')
    return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))
  if (typeof value !== 'object' || ancestors.has(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false
  if (Object.getOwnPropertySymbols(value).length !== 0) return false
  ancestors.add(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const valid =
    Object.entries(descriptors).every(([key, descriptor]) => {
      if (Array.isArray(value) && key === 'length') return true
      return (
        descriptor.enumerable === true &&
        'value' in descriptor &&
        isJsonData(descriptor.value, ancestors)
      )
    }) &&
    (!Array.isArray(value) || Object.keys(value).length === value.length)
  ancestors.delete(value)
  return valid
}
export const ScheduleJsonValueSchema = z
  .unknown()
  .refine(value => isJsonData(value), 'Expected plain JSON data with finite safe numbers')
  .pipe(z.json())
export type ScheduleJsonValue = z.infer<typeof ScheduleJsonValueSchema>
export type ScheduleId = z.infer<typeof ScheduleIdSchema>
export type ScheduleOperationRef = z.infer<typeof ScheduleOperationRefSchema>
export type ScheduleCivil = z.infer<typeof ScheduleCivilSchema>
export type ScheduleInstant = z.infer<typeof ScheduleInstantSchema>
export type ScheduleFingerprint = z.infer<typeof ScheduleFingerprintSchema>
