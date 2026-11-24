import type { JsonValue } from '@omne-harness/json-text'
import { fail } from '@omne-harness/operation-result'
import type { CommandTable, ToolCommandRelease, ToolGate } from '@omne-harness/tool-contract'
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
import { resultMaxBytesOf, returns, textResult } from './author.ts'
import { runJobs } from './jobs-calls.ts'
import {
  jobsAdoption,
  jobsCommandNames,
  jobsContract,
  jobsParameterCodec,
  jobsSummaries,
  type JobsArguments,
  type JobsCommandName,
} from './jobs-protocol.ts'
import { jobsOf } from './port.ts'

const GATES: readonly ToolGate[] = [
  { id: 'read', title: '查看', default: 'auto' },
  { id: 'start', title: '发起', default: 'auto' },
  { id: 'cancel', title: '取消', default: 'auto' },
]
const GATE_OF: Readonly<Record<JobsCommandName, string>> = {
  help: 'read',
  list: 'read',
  show: 'read',
  start: 'start',
  cancel: 'cancel',
}

const ENCODING = 'wrapped' as const
const guide = [
  'A Job is one run: a schedule makes one at each time it accepts, and start makes one outside any schedule. list shows the runs of one schedule, or of all, newest first; a missed stretch is one row with how many times were missed and why.',
  'start runs a program the deployment registered; it counts toward no schedule. cancel stops a Job: one not started never starts, a running one is asked to stop and ends cancelled once the program has stopped.',
  'A write that answers unknown may or may not have happened: read with show or list; do not send it again.',
  'Failures are one line, <kind> reason=<why> code=<code>: not_found, conflict, invalid, unavailable.',
].join('\n\n')

const menu: CommandTable = {
  name: 'Jobs',
  encoding: ENCODING,
  guide,
  commands: jobsCommandNames.map(name => ({
    name,
    summary: jobsSummaries[name],
    parameters: { kind: 'declared', value: jobsContract(name) },
    returns,
  })),
}

async function execute(args: JobsArguments, execution: ToolExecutionContext): Promise<string> {
  if (args.command === 'help')
    return `done Jobs help${args.params.name === undefined ? '' : ` ${args.params.name}`}\n${commandGuide(menu, args.params.name)}`
  const bound = jobsOf(execution)
  if (bound === undefined)
    return 'unavailable reason=the Job services are not attached to this call'
  const faces = await bound.faces()
  if ('kind' in faces)
    return faces.reason === 'forbidden'
      ? 'not_found reason=the call does not act for the owner of these Jobs'
      : 'unavailable reason=the Job services are not available'
  return runJobs(args, faces, bound)
}

export const jobsExecutor = {
  execute: (args: JobsArguments, _environment: null, context: ToolExecutionContext) =>
    execute(args, context),
}

export function createJobsAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const maximum = resultMaxBytesOf(construction)
  if (maximum === undefined)
    return fail({ field: 'construction', reason: 'Jobs takes only resultMaxBytes, at least 64' })
  const operations: Record<
    string,
    {
      summary: string
      operation: ToolOperation<null, ToolMessageContentBlock>
      release: ToolCommandRelease
    }
  > = {}
  for (const name of jobsCommandNames) {
    const operation = defineToolOperation<
      JobsArguments,
      string,
      null,
      ToolMessageContentBlock,
      Extract<ToolOperationParameters, { kind: 'declared' }>
    >({
      parameters: { kind: 'declared', value: jobsContract(name) },
      returns,
      author: {
        kind: 'ordinary',
        parameters: jobsParameterCodec(name),
        waits: [],
        executor: jobsExecutor,
        ...textResult('Jobs', maximum),
      },
    })
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = {
      summary: jobsSummaries[name],
      operation: operation.ok,
      release: { gate: GATE_OF[name] },
    }
  }
  const author = defineCommandTool({
    gates: GATES,
    implementation: {
      description:
        'See the runs of the owner schedules and their outcomes, run a registered program once, or cancel a run.',
      backgroundAllowed: false,
      declarations: {
        adoption: jobsAdoption,
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

export const jobsToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/schedule-tools',
    name: 'Jobs',
    revision: '1',
    changes: 'Commands over an attached Jobs port; one call is one read or one write.',
  }),
  createAuthor: createJobsAuthor,
}
