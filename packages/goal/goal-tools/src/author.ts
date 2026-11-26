import { GOAL_USAGE } from '@omne-harness/goal-contract'
import { hitlDecisionWait } from '@omne-harness/human-intervention-tool'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { CommandTable, ToolGate } from '@omne-harness/tool-contract'
import { z } from 'zod'
import {
  commandGuide,
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import { brief, show, submit, track } from './commands.ts'
import { goalOf } from './port.ts'
import { proposeExecutor } from './proposing.ts'
import {
  goalAdoption,
  goalCommandNames,
  goalContract,
  goalParameterCodec,
  goalSummaries,
  tree,
  type GoalArguments,
  type GoalCommandName,
} from './protocol.ts'
import { reachFrom, type Answer } from './results.ts'

export const GOAL_GATES: readonly ToolGate[] = [
  { id: 'read', title: '查看目标', default: 'auto' },
  { id: 'propose', title: '提议目标', default: 'auto' },
  { id: 'track', title: '记进展', default: 'auto' },
  { id: 'submit', title: '交查验的读数', default: 'auto' },
]
const GOAL_GATE_OF: Readonly<Record<GoalCommandName, string>> = {
  help: 'read',
  show: 'read',
  propose: 'propose',
  track: 'track',
  brief: 'read',
  submit: 'submit',
}

const ENCODING = 'wrapped' as const
/** A proposal is confirmed by a person on a card: where nobody attends there is nobody to confirm it. */
export const PROPOSE_CONDITIONS = ['person-present'] as const
/** The two commands of the session that examines for a goal are offered there and nowhere else. */
export const EXAMINING_CONDITIONS = ['examining'] as const
const CONDITIONS_OF: Readonly<Partial<Record<GoalCommandName, readonly string[]>>> = {
  propose: PROPOSE_CONDITIONS,
  brief: EXAMINING_CONDITIONS,
  submit: EXAMINING_CONDITIONS,
}
const encoder = new TextEncoder()
const utf8 = (text: string) => encoder.encode(text)
const text = (name: string, extra: object) =>
  describedAdoption({ owner: '@omne-harness/goal-tools', name, revision: '1', ...extra })

const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: goalAdoption,
    value: {
      identity: {
        id: '@omne-harness/goal-tools/text',
        revision: '1',
        digest: text('text', { schema: { type: 'string' } }).digest,
      },
      definition: { schema: tree({ type: 'string' }), vocabulary: goalAdoption, descriptions: [] },
    },
  },
  program: { kind: 'none' },
  body: { kind: 'text', codec: text('utf8-text-body', { encoding: 'UTF-8' }) },
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
} as const

const menu: CommandTable = {
  name: 'Goal',
  encoding: ENCODING,
  guide: GOAL_USAGE,
  commands: goalCommandNames.map(name => ({
    name,
    summary: goalSummaries[name],
    parameters: { kind: 'declared', value: goalContract(name) },
    returns,
  })),
}

type Plain = Exclude<GoalArguments, { command: 'propose' }>

/** One call is one read or one update of the list. The propose command has its own two segments. */
export async function answerGoal(
  args: Plain,
  execution: Pick<ToolExecutionContext, 'signal'>,
): Promise<Answer> {
  if (args.command === 'help')
    return succeed(
      `done Goal help${args.params.name === undefined ? '' : ` ${args.params.name}`}\n${commandGuide(menu, args.params.name)}`,
    )
  const ready = await reachFrom(args.command, goalOf(execution))
  if (!('reached' in ready)) return ready
  if (args.command === 'show') return show(ready.reached)
  if (args.command === 'brief') return brief(ready.reached)
  return args.command === 'submit' ? submit(ready.reached, args) : track(ready.reached, args)
}

/** A failed answer is thrown with its reason: the call fails with that reason as its result. */
export const goalExecutor = {
  async execute(args: GoalArguments, _environment: null, context: ToolExecutionContext) {
    if (args.command === 'propose') throw new Error('propose runs through its checkpoint executor')
    const answer = await answerGoal(args, context)
    if ('failure' in answer) throw new Error(answer.failure.reason)
    return answer.ok
  },
}

const constructionSchema = z.strictObject({ resultMaxBytes: z.int().min(64) })

type Operation = ToolOperation<null, ToolMessageContentBlock>

function operationOf(name: GoalCommandName, maximum: number) {
  const waits = name === 'propose'
  return defineToolOperation<
    GoalArguments,
    string,
    null,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: goalContract(name) },
    returns,
    author: {
      kind: 'ordinary',
      parameters: goalParameterCodec(name),
      waits: waits ? [hitlDecisionWait] : [],
      executor: (waits ? proposeExecutor : goalExecutor) as typeof goalExecutor,
      codec: {
        adoption: goalAdoption,
        encode: (value: unknown) =>
          typeof value === 'string' ? succeed(utf8(value)) : fail({ reason: 'text-required' }),
        decode(bytes) {
          try {
            return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
          } catch {
            return fail({ reason: 'invalid-utf8' })
          }
        },
      },
      output: {
        adoption: goalAdoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && utf8(value).byteLength <= maximum
            ? succeed(value)
            : fail({ reason: 'the Goal result exceeds resultMaxBytes' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
  })
}

export function createGoalAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const read = constructionSchema.safeParse(JSON.parse(writeJsonText(construction)))
  if (!read.success)
    return fail({ field: 'construction', reason: 'Goal takes only resultMaxBytes, at least 64' })
  const operations: Record<
    string,
    {
      summary: string
      operation: Operation
      release: Readonly<{ gate: string }>
      conditions?: readonly string[]
      readOnly: boolean
    }
  > = {}
  for (const name of goalCommandNames) {
    const operation = operationOf(name, read.data.resultMaxBytes)
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = {
      summary: goalSummaries[name],
      operation: operation.ok,
      release: { gate: GOAL_GATE_OF[name] },
      readOnly: GOAL_GATE_OF[name] === 'read',
      ...(CONDITIONS_OF[name] === undefined ? {} : { conditions: CONDITIONS_OF[name] }),
    }
  }
  const author = defineCommandTool({
    gates: GOAL_GATES,
    implementation: {
      description:
        'Read the goal of this session and how far the work is from it, propose a goal or a change of it for the person to confirm, and keep your progress list.',
      backgroundAllowed: false,
      declarations: {
        adoption: goalAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: ENCODING,
    guide: GOAL_USAGE,
    commands: operations,
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}

export const goalToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/goal-tools',
    name: 'Goal',
    revision: '1',
    changes:
      'Commands over an attached goal port; the session and the call reference come from the call; propose waits for the person on a checkpoint.',
  }),
  createAuthor: createGoalAuthor,
}
