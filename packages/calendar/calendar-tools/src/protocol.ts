import { z } from 'zod'
import {
  calendarListInputSchema,
  calendarGetInputSchema,
  calendarResolveSchema,
  calendarListResultSchema,
  calendarGetResultSchema,
  calendarEffectiveResultSchema,
  calendarResolveResultSchema,
} from '@omne-harness/calendar-contract'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const calendarToolArgumentsSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('list'), input: calendarListInputSchema }),
  z.strictObject({ action: z.literal('get'), input: calendarGetInputSchema }),
  z.strictObject({ action: z.literal('effective') }),
  z.strictObject({ action: z.literal('resolve'), input: calendarResolveSchema }),
])
export type CalendarToolArguments = z.infer<typeof calendarToolArgumentsSchema>
export const calendarToolResultSchema = z.union([
  calendarListResultSchema,
  calendarGetResultSchema,
  calendarEffectiveResultSchema,
  calendarResolveResultSchema,
])
export type CalendarToolResult = z.infer<typeof calendarToolResultSchema>

export const argumentLimits = {
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 1024,
  maxMembers: 128,
  maxStringLength: 32_768,
  maxNumberLength: 64,
}
export const resultLimits = {
  maxBytes: 16_777_216,
  maxDepth: 64,
  maxItems: 1_000_000,
  maxMembers: 1024,
  maxStringLength: 16_777_216,
  maxNumberLength: 64,
}
export const calendarToolAdoption = describedAdoption({
  owner: '@omne-harness/calendar-tools',
  name: 'calendar-query',
  revision: '1',
  protocol: 'omne.calendar-schedule/1',
  actions: ['list', 'get', 'effective', 'resolve'],
  permission: 'calendar.read',
  argumentLimits,
  resultLimits,
})
export function jsonTree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), resultLimits)
  if (read.kind !== 'ok') throw new TypeError(`Calendar JSON conversion failed: ${read.kind}`)
  return read.value
}
export function nativeJson(value: JsonValue): unknown {
  return JSON.parse(writeJsonText(value))
}
export function unbox<T>(value: Outcome<T, unknown>): T {
  if ('failure' in value) throw new TypeError(JSON.stringify(value.failure))
  return value.ok
}
const strictJson = unbox(createDefaultParameterCodec(argumentLimits))
export const calendarToolParameterCodec: ParameterCodec<CalendarToolArguments> = {
  adoption: calendarToolAdoption,
  parse(input) {
    const read = strictJson.parse(input)
    if ('failure' in read) return read
    const parsed = calendarToolArgumentsSchema.safeParse(nativeJson(read.ok))
    return parsed.success
      ? succeed(parsed.data)
      : fail({ kind: 'invalid', reason: parsed.error.message })
  },
}
export const resultSchemas = {
  list: calendarListResultSchema,
  get: calendarGetResultSchema,
  effective: calendarEffectiveResultSchema,
  resolve: calendarResolveResultSchema,
}
