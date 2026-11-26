import {
  ChangeSchema,
  GoalDraftSchema,
  SubmissionSchema,
  TrackSchema,
} from '@omne-harness/goal-contract'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'
import { z } from 'zod'

export const goalAdoption = describedAdoption({
  owner: '@omne-harness/goal-tools',
  name: 'goal-protocol',
  revision: '1',
  changes: 'One declaration with the command named in the call; the session comes from the call.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/goal-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 1_048_576,
  maxDepth: 32,
  maxItems: 1024,
  maxMembers: 64,
  maxStringLength: 65_536,
  maxNumberLength: 32,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('Goal protocol JSON is not bounded')
  return read.value
}

/** Every command of the tool. None of them sets, changes, pauses, resumes, cancels or settles a goal. */
export const goalCommandNames = ['help', 'show', 'propose', 'track', 'brief', 'submit'] as const
export type GoalCommandName = (typeof goalCommandNames)[number]

const shapes = {
  help: z.strictObject({ name: z.enum(goalCommandNames).optional() }),
  show: z.strictObject({}),
  propose: z.strictObject({
    body: GoalDraftSchema.optional(),
    changes: z.array(ChangeSchema).min(1).optional(),
  }),
  track: TrackSchema,
  brief: z.strictObject({}),
  submit: SubmissionSchema,
} as const satisfies Record<GoalCommandName, z.ZodType>

export type GoalArguments = {
  [K in GoalCommandName]: Readonly<{ command: K; params: z.output<(typeof shapes)[K]> }>
}[GoalCommandName]
export type ArgumentsOf<K extends GoalCommandName> = Extract<GoalArguments, { command: K }>

export const goalSummaries: Readonly<Record<GoalCommandName, string>> = {
  help: 'Read command usage.',
  show: 'Read the goal of this session, how far each entry is from done, and your progress list.',
  propose:
    'Put a goal, or changes to the goal that stands, in front of the person on a card and wait for their answer. Give body to set a goal, or changes to revise one. Nothing stands until they confirm.',
  track:
    'Update your progress list by entry number: where each criterion is, the call ids of the tool calls that show it, a note. It changes nothing of the goal itself.',
  brief:
    'Only in a session that examines for a goal: read the brief of the batch you are to examine.',
  submit:
    'Only in a session that examines for a goal: hand in one reading for each criterion of the batch, with the call ids of your own tool calls that show it and what you saw. It changes nothing of the goal itself.',
}

/** The contract's values are immutable, which zod writes as `readOnly`: in a schema that means "do not send". */
const sendable = (ctx: { jsonSchema: { readOnly?: boolean } }) => {
  delete ctx.jsonSchema.readOnly
}

export function goalContract(name: GoalCommandName): ParameterContract {
  const document = z.toJSONSchema(shapes[name], { override: sendable, unrepresentable: 'any' })
  const { $schema: _dialect, ...schema } = document as Record<string, unknown>
  return { schema: tree(schema), vocabulary, descriptions: [] }
}

const strictJson = createDefaultParameterCodec(limits)
const ONE_OF = 'give body to set a goal, or changes to revise one, not both and not neither'

/** Parses one command's params. A field the command does not have is invalid: it is never dropped silently. */
export function goalParameterCodec(name: GoalCommandName): ParameterCodec<GoalArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: goalAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const parsed = shapes[name].safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!parsed.success) {
        const problems = parsed.error.issues.map(({ path, message }) =>
          path.length === 0 ? message : `${path.join('.')}: ${message}`,
        )
        return fail({ kind: 'invalid', reason: problems.join('; ') })
      }
      const given = parsed.data as { body?: unknown; changes?: unknown }
      if (name === 'propose' && (given.body === undefined) === (given.changes === undefined))
        return fail({ kind: 'invalid', reason: ONE_OF })
      return succeed({ command: name, params: parsed.data } as GoalArguments)
    },
  }
}
