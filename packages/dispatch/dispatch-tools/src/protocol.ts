import { z } from 'zod'
import {
  DISPATCH_MODES,
  DISPATCH_STATES,
  dispatchIdSchema,
  sessionRefSchema,
  TEXT_CEILING,
} from '@omne-harness/dispatch-contract'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const agentsAdoption = describedAdoption({
  owner: '@omne-harness/dispatch-tools',
  name: 'agents-protocol',
  revision: '1',
  changes:
    'One declaration with the command named in the call; the session that dispatches, reports or sends comes from the call.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/dispatch-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 1_048_576,
  maxDepth: 16,
  maxItems: 1024,
  maxMembers: 64,
  maxStringLength: TEXT_CEILING,
  maxNumberLength: 32,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('Agents protocol JSON is not bounded')
  return read.value
}

export const agentsCommandNames = [
  'help',
  'targets',
  'dispatch',
  'show',
  'withdraw',
  'report',
  'message',
  'list',
] as const
export type AgentsCommandName = (typeof agentsCommandNames)[number]

/** What a listed session is to the session of the call. The values are those of the session directory. */
export const LIST_RELATIONS = [
  'self',
  'parent',
  'child',
  'sibling',
  'upper',
  'lower',
  'rest',
  'handed-off',
  'handed-from',
  'unrelated',
] as const

const text = z.string().min(1).max(TEXT_CEILING)
const shapes = {
  help: z.strictObject({ name: z.enum(agentsCommandNames).optional() }),
  targets: z.strictObject({}),
  dispatch: z.strictObject({
    mode: z.enum(DISPATCH_MODES),
    agent: z.string().min(1).max(200),
    instruction: text,
    expectation: z.string().min(1).max(4000).optional(),
  }),
  show: z.strictObject({ dispatch: dispatchIdSchema }),
  withdraw: z.strictObject({ dispatch: dispatchIdSchema }),
  report: z.strictObject({ text }),
  message: z.strictObject({
    to: sessionRefSchema,
    text,
    id: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,64}$/)
      .optional(),
  }),
  list: z.strictObject({
    relation: z.enum(LIST_RELATIONS).optional(),
    attendance: z.enum(['attended', 'unattended']).optional(),
    definition: z.string().min(1).max(200).optional(),
    dispatch: z.enum(DISPATCH_STATES).optional(),
    archived: z.boolean().optional(),
    cursor: z.string().min(1).max(4096).optional(),
    limit: z.int().min(1).max(50).optional(),
  }),
} as const satisfies Record<AgentsCommandName, z.ZodType>

export type AgentsArguments = {
  [K in AgentsCommandName]: Readonly<{ command: K; params: z.output<(typeof shapes)[K]> }>
}[AgentsCommandName]
export type ArgumentsOf<K extends AgentsCommandName> = Extract<AgentsArguments, { command: K }>

export const agentsSummaries: Readonly<Record<AgentsCommandName, string>> = {
  help: 'Read command usage.',
  targets:
    'List the agent definitions you can dispatch to now, with the type and a description of each.',
  dispatch:
    'Hand one piece of work to another agent in a new session. delegate and spawn wait here for its one report; handoff returns when the new session exists.',
  show: 'Read one dispatch: its state, its report, where the report went, and how far a stop got.',
  withdraw:
    'Take back a dispatch you made, before its report. Asks its run to stop; it does not archive the session.',
  report: 'Hand back the one report of the work that was dispatched to this session.',
  message:
    'Send one message to the agent of another session of this tenant. It ends no dispatch and is no report.',
  list: 'List sessions with what each is to yours, who attends it, its definition and the state of its dispatch.',
}

/** The contract's values are immutable, which zod writes as `readOnly`: in a schema that means "do not send". */
const sendable = (ctx: { jsonSchema: { readOnly?: boolean } }) => {
  delete ctx.jsonSchema.readOnly
}

export function agentsContract(name: AgentsCommandName): ParameterContract {
  const document = z.toJSONSchema(shapes[name], { override: sendable })
  const { $schema: _dialect, ...schema } = document as Record<string, unknown>
  return { schema: tree(schema), vocabulary, descriptions: [] }
}

const strictJson = createDefaultParameterCodec(limits)

/** Parses one command's params. A field the command does not have is invalid: it is never dropped silently. */
export function agentsParameterCodec(name: AgentsCommandName): ParameterCodec<AgentsArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: agentsAdoption,
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
      return succeed({ command: name, params: parsed.data } as AgentsArguments)
    },
  }
}
