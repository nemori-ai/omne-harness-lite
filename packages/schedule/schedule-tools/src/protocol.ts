import { z } from 'zod'
import * as schedule from '@omne-harness/schedule-contract'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const schedulesAdoption = describedAdoption({
  owner: '@omne-harness/schedule-tools',
  name: 'schedules-protocol',
  revision: '2',
  changes:
    'One declaration with the command named in the call; definitions follow the user environment.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/schedule-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 4096,
  maxMembers: 512,
  maxStringLength: 65_536,
  maxNumberLength: 64,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('Schedules protocol JSON is not bounded')
  return read.value
}

/** A definition as the agent writes it: no calendar binding and no overlay, so it cannot pick a calendar. */
export const agentDefinitionSchema = z.strictObject({
  label: schedule.ScheduleLabelSchema,
  recurrence: schedule.ScheduleRecurrenceSchema,
  limits: schedule.ScheduleRuleLimitsSchema,
  purpose: schedule.SchedulePurposeSchema,
})
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>

/** The full definition: it follows the owner's environment. */
export function definitionOf(agent: AgentDefinition) {
  return schedule.ScheduleDefinitionSchema.safeParse({
    ...agent,
    binding: { kind: 'followUserEnvironment' },
    calendarOverlay: null,
  })
}

const scheduleId = schedule.ScheduleIdSchema
const revision = z.int().min(1)
const reason = schedule.ScheduleReasonSchema
const control = z.enum(['promote', 'pause', 'resume', 'stop', 'discard'])

export const schedulesCommandNames = [
  'help',
  'preview',
  'create',
  'draft',
  'list',
  'show',
  'history',
  'update',
  'revise',
  'replace',
  ...control.options,
  'recover',
] as const
export type SchedulesCommandName = (typeof schedulesCommandNames)[number]

const shapes = {
  help: z.strictObject({ name: z.enum(schedulesCommandNames).optional() }),
  preview: z.strictObject({
    definition: agentDefinitionSchema.optional(),
    schedule: scheduleId.optional(),
    count: z.int().min(1).max(20).optional(),
  }),
  create: z.strictObject({ definition: agentDefinitionSchema }),
  draft: z.strictObject({ definition: agentDefinitionSchema, reason }),
  list: z.strictObject({
    state: schedule.ScheduleControlSchema.optional(),
    limit: z.int().min(1).max(50).optional(),
    after: z.string().min(1).optional(),
  }),
  show: z.strictObject({ schedule: scheduleId }),
  history: z.strictObject({ schedule: scheduleId }),
  update: z.strictObject({
    schedule: scheduleId,
    revision,
    label: schedule.ScheduleLabelSchema.optional(),
    instruction: schedule.ScheduleInstructionSchema.optional(),
  }),
  revise: z.strictObject({
    schedule: scheduleId,
    revision,
    definition: agentDefinitionSchema,
    reason,
  }),
  replace: z.strictObject({
    schedule: scheduleId,
    revision,
    definition: agentDefinitionSchema,
    reason,
  }),
  promote: z.strictObject({ schedule: scheduleId, revision, reason: reason.optional() }),
  pause: z.strictObject({ schedule: scheduleId, revision, reason: reason.optional() }),
  resume: z.strictObject({ schedule: scheduleId, revision, reason: reason.optional() }),
  stop: z.strictObject({ schedule: scheduleId, revision, reason: reason.optional() }),
  discard: z.strictObject({ schedule: scheduleId, revision, reason: reason.optional() }),
  recover: z.strictObject({ operation: schedule.ScheduleOperationRefSchema }),
} as const satisfies Record<SchedulesCommandName, z.ZodType>

export type SchedulesArguments = {
  [K in SchedulesCommandName]: Readonly<{ command: K; params: z.output<(typeof shapes)[K]> }>
}[SchedulesCommandName]

export const schedulesSummaries: Readonly<Record<SchedulesCommandName, string>> = {
  help: 'Read command usage.',
  preview:
    'The next times of a definition or a saved schedule, each with the calendar and version it used. Saves nothing.',
  create: 'Create a schedule that takes effect now.',
  draft: 'Save a schedule as a draft: it does not run until it is promoted. Give a reason.',
  list: 'List schedules, newest first.',
  show: 'One schedule: definition, state, author and the next time.',
  history: 'The revisions of one schedule.',
  update:
    'Rename a schedule or change its instruction: the goal body its agent work is to achieve. Give the revision you read.',
  revise: 'Rewrite a draft. Give the revision you read.',
  replace: 'Replace the rule of an active schedule; the old one becomes superseded.',
  promote: 'Bring a draft into effect.',
  pause: 'Pause an active schedule.',
  resume: 'Resume a paused schedule.',
  stop: 'Stop a schedule for good.',
  discard: 'Discard your own draft for good.',
  recover: 'Read the outcome of a write that answered unknown, by its operation.',
}

export function schedulesContract(name: SchedulesCommandName): ParameterContract {
  const document = z.toJSONSchema(shapes[name], { io: 'input', unrepresentable: 'any' })
  const { $schema: _dialect, ...schema } = document as Record<string, unknown>
  return { schema: tree(schema), vocabulary, descriptions: [] }
}

const strictJson = createDefaultParameterCodec(limits)

/** Parses one command's params; anything the schema refuses is invalid before a service is asked. */
export function schedulesParameterCodec(
  name: SchedulesCommandName,
): ParameterCodec<SchedulesArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: schedulesAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const parsed = shapes[name].safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!parsed.success)
        return fail({ kind: 'invalid', reason: parsed.error.issues[0]?.message ?? 'invalid' })
      if (name === 'update' && 'label' in parsed.data === 'instruction' in parsed.data)
        return fail({
          kind: 'invalid',
          reason: 'update takes exactly one of label and instruction',
        })
      return succeed({ command: name, params: parsed.data } as SchedulesArguments)
    },
  }
}
