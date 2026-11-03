import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { z } from 'zod'
import * as schedule from '@omne-harness/schedule-contract'
import {
  readJsonText,
  writeJsonText,
  type JsonValue,
  type JsonLimits,
} from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeToolOperationId, type ToolFailure } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  decodeToolInstanceId,
  decodeToolRevision,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

const [update, revise, consent, control, replace] = schedule.ScheduleCommandSchema.options
export const scheduleToolCommandSchema = z.discriminatedUnion('action', [
  update.extend({ meta: update.shape.meta.omit({ operationKey: true }) }),
  revise.extend({ meta: revise.shape.meta.omit({ operationKey: true }) }),
  consent.extend({ meta: consent.shape.meta.omit({ operationKey: true }) }),
  control.extend({ meta: control.shape.meta.omit({ operationKey: true }) }),
  replace.extend({ meta: replace.shape.meta.omit({ operationKey: true }) }),
])
export const scheduleToolArgumentsSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('create'),
    input: schedule.ScheduleCreateRequestSchema.extend({
      meta: schedule.ScheduleCreateRequestSchema.shape.meta.omit({ operationKey: true }),
    }),
  }),
  z.strictObject({ action: z.literal('execute'), input: scheduleToolCommandSchema }),
  z.strictObject({
    action: z.literal('queryOperation'),
    input: schedule.ScheduleOperationLocatorSchema,
  }),
  z.strictObject({ action: z.literal('list'), input: schedule.ScheduleListRequestSchema }),
  z.strictObject({ action: z.literal('get'), input: schedule.ScheduleGetRequestSchema }),
  z.strictObject({
    action: z.literal('revisions'),
    input: schedule.ScheduleRevisionsRequestSchema,
  }),
  z.strictObject({
    action: z.literal('executions'),
    input: schedule.ScheduleExecutionsRequestSchema,
  }),
  z.strictObject({ action: z.literal('agenda'), input: schedule.ScheduleAgendaRequestSchema }),
  z.strictObject({ action: z.literal('preview'), input: schedule.SchedulePreviewRequestSchema }),
])
export type ScheduleToolArguments = z.infer<typeof scheduleToolArgumentsSchema>
export const argumentLimits = Object.freeze({
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 200_000,
  maxMembers: 512,
  maxStringLength: 65_536,
  maxNumberLength: 64,
})
export const resultLimits = Object.freeze({
  maxBytes: 4_194_304,
  maxDepth: 32,
  maxItems: 200_000,
  maxMembers: 512,
  maxStringLength: 1_048_576,
  maxNumberLength: 64,
})
export const summaryMaxBytes = 32_768
export const scheduleToolAdoption = Object.freeze(
  describedAdoption({
    owner: '@omne-harness/schedule-tools',
    name: 'schedule',
    revision: '1',
    protocol: 'omne.calendar-schedule/1',
    actions: [
      'create',
      'execute',
      'queryOperation',
      'list',
      'get',
      'revisions',
      'executions',
      'agenda',
      'preview',
    ],
    capabilities: ['schedule.read', 'schedule.write'],
    argumentLimits,
    resultLimits,
    summaryMaxBytes,
  }),
)
export const adoptionSchema = z.strictObject({
  owner: z.string().min(1),
  name: z.string().min(1),
  revision: z.string().min(1),
  digest: z.string().min(1),
})
export const evidenceSchema = z.strictObject({
  owner: z.string().min(1),
  record: z.string().min(1),
  revision: z.string().min(1),
  digest: z.string().min(1),
})
export function toolIdentitySchema<T>(decode: (value: unknown) => Outcome<T, unknown>) {
  return z.string().transform((value, ctx) => {
    const result = decode(value)
    if ('ok' in result) return result.ok
    ctx.addIssue({ code: 'custom', message: 'Invalid Tool identity' })
    return z.NEVER
  })
}
const operationId = toolIdentitySchema(decodeToolOperationId)
export const toolFailureSchema: z.ZodType<ToolFailure> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('denied'), action: z.string() }),
  z.strictObject({ kind: z.literal('invalid'), field: z.string(), reason: z.string() }),
  z.strictObject({ kind: z.enum(['conflict', 'commit-unknown']), operation: operationId }),
  z.strictObject({
    kind: z.literal('unavailable'),
    dependency: z.string(),
    diagnostic: z.string(),
  }),
  z.strictObject({ kind: z.literal('not-settled') }),
  z.strictObject({
    kind: z.literal('stale-instance'),
    instance: toolIdentitySchema(decodeToolInstanceId),
  }),
  z.strictObject({
    kind: z.literal('stale-revision'),
    current: toolIdentitySchema(decodeToolRevision),
  }),
  z.strictObject({ kind: z.literal('invalid-cursor'), reason: z.string() }),
  z.strictObject({ kind: z.literal('unsupported'), adoption: adoptionSchema, reason: z.string() }),
])
const result = <A extends ScheduleToolArguments['action'], S extends z.ZodType>(
  action: A,
  value: S,
  write = false,
) =>
  z.strictObject({
    kind: z.literal('result'),
    action: z.literal(action),
    result: value,
    operation: write ? schedule.ScheduleOperationLocatorSchema.options[1] : z.null(),
  })
export const scheduleToolResultSchema = z.union([
  result('create', schedule.ScheduleManagementResultSchema, true),
  result('execute', schedule.ScheduleManagementResultSchema, true),
  result('queryOperation', schedule.ScheduleOperationResultSchema),
  result('list', schedule.ScheduleListResultSchema),
  result('get', schedule.ScheduleGetResultSchema),
  result('revisions', schedule.ScheduleRevisionsResultSchema),
  result('executions', schedule.ScheduleExecutionsResultSchema),
  result('agenda', schedule.ScheduleAgendaResultSchema),
  result('preview', schedule.SchedulePreviewResultSchema),
  z.strictObject({
    kind: z.literal('adapterFailure'),
    action: z.enum([
      'create',
      'execute',
      'queryOperation',
      'list',
      'get',
      'revisions',
      'executions',
      'agenda',
      'preview',
    ]),
    failure: toolFailureSchema,
    operation: z.null(),
  }),
])
export type ScheduleToolResult = z.infer<typeof scheduleToolResultSchema>
export function unbox<T>(outcome: Outcome<T, unknown>): T {
  if ('failure' in outcome) throw new TypeError('Invalid adapter configuration')
  return outcome.ok
}
export function jsonTree(value: unknown, limits: JsonLimits = resultLimits): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('output_limit')
  return read.value
}
export function nativeJson(value: JsonValue): unknown {
  return JSON.parse(writeJsonText(value))
}
export function canonical(value: unknown): string {
  const encoded = canonicalize(value)
  if (encoded === undefined) throw new TypeError('Non-JSON value')
  return encoded
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
export function same(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
const jsonCodec = unbox(createDefaultParameterCodec(argumentLimits))
export const scheduleToolParameterCodec: ParameterCodec<ScheduleToolArguments> = {
  adoption: scheduleToolAdoption,
  parse(input) {
    const read = jsonCodec.parse(input)
    if ('failure' in read) return read
    const parsed = scheduleToolArgumentsSchema.safeParse(nativeJson(read.ok))
    return parsed.success
      ? succeed(parsed.data)
      : fail({ kind: 'invalid', reason: parsed.error.message })
  },
}
export function invalid(field: string, reason: string): ToolFailure {
  return { kind: 'invalid', field, reason }
}
export function unavailable(diagnostic: string): ToolFailure {
  return { kind: 'unavailable', dependency: 'schedule-tools', diagnostic }
}
