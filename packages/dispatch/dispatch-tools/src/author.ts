import { dispatchReportWait } from '@omne-harness/dispatch-tool'
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
import { HANDLERS, type Handler, type Reaching } from './commands.ts'
import { dispatchExecutor } from './dispatching.ts'
import { agentsOf } from './port.ts'
import {
  agentsAdoption,
  agentsCommandNames,
  agentsContract,
  agentsParameterCodec,
  agentsSummaries,
  tree,
  type AgentsArguments,
  type AgentsCommandName,
} from './protocol.ts'
import { reachFrom, type Answer } from './results.ts'

const AGENTS_GATES: readonly ToolGate[] = [
  { id: 'read', title: '查看', default: 'auto' },
  { id: 'dispatch', title: '派发与撤回', default: 'auto' },
  { id: 'message', title: '给别的会话发消息', default: 'auto' },
  { id: 'report', title: '交回报告', default: 'auto' },
]
const AGENTS_GATE_OF: Readonly<Record<AgentsCommandName, string>> = {
  help: 'read',
  targets: 'read',
  show: 'read',
  list: 'read',
  dispatch: 'dispatch',
  withdraw: 'dispatch',
  message: 'message',
  report: 'report',
}

const ENCODING = 'wrapped' as const
/** Only a session that work was dispatched to has a report to hand back. */
const REPORT_CONDITIONS = ['dispatched'] as const
const encoder = new TextEncoder()
const utf8 = (text: string) => encoder.encode(text)

const guide = [
  'dispatch hands one piece of work to another agent, which works in a session of its own. Write the instruction so that it stands alone: the other agent sees only what you write, except with spawn. See targets for the agent definitions and the modes each takes.',
  'delegate: the agent starts from your instruction alone. spawn: it starts from a copy of this conversation as it is now, plus your instruction. With both, this call waits for the one report and returns it; the session it works in is unattended, so it cannot ask a person. handoff: the work moves to a new main session that a person attends; this call returns as soon as that session exists, and there is no report.',
  'If this call stops waiting before the report comes, the work goes on: the report then comes to this session as a reminder. Do not dispatch the same work again. Use show to read a dispatch and withdraw to take it back before its report.',
  'message sends a note to the agent of another session. It is not a report and ends nothing. list gives the session identities, the same ones the tool Sessions uses.',
  'A failure starts with its reason, then says what to do. After a failure that says unknown, send the same command again: what took effect is recalled, not done twice.',
].join('\n\n')

const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: agentsAdoption,
    value: {
      identity: {
        id: '@omne-harness/dispatch-tools/text',
        revision: '1',
        digest: describedAdoption({
          owner: '@omne-harness/dispatch-tools',
          name: 'text',
          revision: '1',
          schema: { type: 'string' },
        }).digest,
      },
      definition: {
        schema: tree({ type: 'string' }),
        vocabulary: agentsAdoption,
        descriptions: [],
      },
    },
  },
  program: { kind: 'none' },
  body: {
    kind: 'text',
    codec: describedAdoption({
      owner: '@omne-harness/dispatch-tools',
      name: 'utf8-text-body',
      revision: '1',
      encoding: 'UTF-8',
    }),
  },
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
} as const

const menu: CommandTable = {
  name: 'Agents',
  encoding: ENCODING,
  guide,
  commands: agentsCommandNames.map(name => ({
    name,
    summary: agentsSummaries[name],
    parameters: { kind: 'declared', value: agentsContract(name) },
    returns,
  })),
}

type Plain = Exclude<AgentsArguments, { command: 'dispatch' }>

/** One call is one read or one write: what the domain answers is the answer. The dispatch command has its own two segments. */
export async function answerAgents(
  args: Plain,
  execution: Pick<ToolExecutionContext, 'signal'>,
): Promise<Answer> {
  if (args.command === 'help')
    return succeed(
      `done Agents help${args.params.name === undefined ? '' : ` ${args.params.name}`}\n${commandGuide(menu, args.params.name)}`,
    )
  const ready = await reachFrom(args.command, agentsOf(execution))
  if (!('reached' in ready)) return ready
  const handler = HANDLERS[args.command] as Handler<Reaching>
  return handler(ready.reached, args.params, ready.bound)
}

/** A failed answer is thrown with its reason: the call fails with that reason as its result. */
export const agentsExecutor = {
  async execute(args: AgentsArguments, _environment: null, context: ToolExecutionContext) {
    if (args.command === 'dispatch')
      throw new Error('dispatch runs through its checkpoint executor')
    const answer = await answerAgents(args, context)
    if ('failure' in answer) throw new Error(answer.failure.reason)
    return answer.ok
  },
}

const constructionSchema = z.strictObject({ resultMaxBytes: z.int().min(64) })

type Operation = ToolOperation<null, ToolMessageContentBlock>

function operationOf(name: AgentsCommandName, maximum: number) {
  const waits = name === 'dispatch'
  return defineToolOperation<
    AgentsArguments,
    string,
    null,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: agentsContract(name) },
    returns,
    author: {
      kind: 'ordinary',
      parameters: agentsParameterCodec(name),
      waits: waits ? [dispatchReportWait] : [],
      executor: (waits ? dispatchExecutor : agentsExecutor) as typeof agentsExecutor,
      codec: {
        adoption: agentsAdoption,
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
        adoption: agentsAdoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && utf8(value).byteLength <= maximum
            ? succeed(value)
            : fail({ reason: 'the Agents result exceeds resultMaxBytes' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
  })
}

export function createAgentsAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const read = constructionSchema.safeParse(JSON.parse(writeJsonText(construction)))
  if (!read.success)
    return fail({ field: 'construction', reason: 'Agents takes only resultMaxBytes, at least 64' })
  const operations: Record<
    string,
    {
      summary: string
      operation: Operation
      release: Readonly<{ gate: string }>
      conditions?: readonly string[]
    }
  > = {}
  for (const name of agentsCommandNames) {
    const operation = operationOf(name, read.data.resultMaxBytes)
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = {
      summary: agentsSummaries[name],
      operation: operation.ok,
      release: { gate: AGENTS_GATE_OF[name] },
      ...(name === 'report' ? { conditions: REPORT_CONDITIONS } : {}),
    }
  }
  const author = defineCommandTool({
    gates: AGENTS_GATES,
    implementation: {
      description:
        'Hand work to another agent and get its report, hand work over for good, message the agent of another session, and see how your dispatches stand.',
      backgroundAllowed: false,
      declarations: {
        adoption: agentsAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: ENCODING,
    guide,
    commands: operations,
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}

export const agentsToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/dispatch-tools',
    name: 'Agents',
    revision: '1',
    changes:
      'Commands over an attached dispatch port; the session and the call reference come from the call; dispatch waits for its report on a checkpoint.',
  }),
  createAuthor: createAgentsAuthor,
}
