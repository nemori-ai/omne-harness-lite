import { z } from 'zod'
import * as schedule from '@omne-harness/schedule-contract'
import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'
import { tree } from './protocol.ts'

export const jobsAdoption = describedAdoption({
  owner: '@omne-harness/schedule-tools',
  name: 'jobs-protocol',
  revision: '1',
  changes: 'One declaration with the command named in the call; Jobs of schedules and direct ones.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/schedule-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})

export const jobsCommandNames = ['help', 'list', 'show', 'start', 'cancel'] as const
export type JobsCommandName = (typeof jobsCommandNames)[number]

const shapes = {
  help: z.strictObject({ name: z.enum(jobsCommandNames).optional() }),
  list: z.strictObject({
    schedule: schedule.ScheduleIdSchema.optional(),
    limit: z.int().min(1).max(50).optional(),
    after: z.string().min(1).optional(),
  }),
  show: z.strictObject({ job: schedule.ScheduleJobIdSchema.optional() }),
  start: z.strictObject({ work: schedule.ScheduleWorkAsWrittenSchema }),
  cancel: z.strictObject({ job: schedule.ScheduleJobIdSchema }),
} as const satisfies Record<JobsCommandName, z.ZodType>

export type JobsArguments = {
  [K in JobsCommandName]: Readonly<{ command: K; params: z.output<(typeof shapes)[K]> }>
}[JobsCommandName]

export const jobsSummaries: Readonly<Record<JobsCommandName, string>> = {
  help: 'Read command usage.',
  list: 'The runs of one schedule, or of all schedules and direct starts, newest first: each slot with its Job, and each missed stretch.',
  show: 'One Job: its work, state, outcome, where it runs and each step it took. Without job: the Jobs this session carries out or carried out, newest first.',
  start:
    'Start one Job now, outside any schedule: agent work in a new session or in one that exists (current is this session), or a registered program. It counts toward no schedule.',
  cancel: 'Cancel one Job: one not started never starts; a running one is asked to stop.',
}

export function jobsContract(name: JobsCommandName): ParameterContract {
  const document = z.toJSONSchema(shapes[name], { io: 'input', unrepresentable: 'any' })
  const { $schema: _dialect, ...schema } = document as Record<string, unknown>
  return { schema: tree(schema), vocabulary, descriptions: [] }
}

const strictJson = createDefaultParameterCodec({
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 4096,
  maxMembers: 512,
  maxStringLength: 65_536,
  maxNumberLength: 64,
})

/** Parses one command's params; anything the schema refuses is invalid before a service is asked. */
export function jobsParameterCodec(name: JobsCommandName): ParameterCodec<JobsArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: jobsAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const parsed = shapes[name].safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!parsed.success)
        return fail({ kind: 'invalid', reason: parsed.error.issues[0]?.message ?? 'invalid' })
      return succeed({ command: name, params: parsed.data } as JobsArguments)
    },
  }
}
