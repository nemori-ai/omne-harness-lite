import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
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
import { read, submit, writeRequestOf, type ReadArguments, type WriteArguments } from './calls.ts'
import { schedulesOf, type BoundSchedules, type ScheduleFaces } from './port.ts'
import {
  ACTIVATION_KIND,
  activationCommands,
  activationSchema,
  describeActivation,
} from './describe.ts'
import {
  schedulesAdoption,
  schedulesCommandNames,
  schedulesContract,
  schedulesParameterCodec,
  schedulesSummaries,
  tree,
  type SchedulesArguments,
  type SchedulesCommandName,
} from './protocol.ts'
import { writeLine } from './text.ts'

const SCHEDULES_GATES: readonly ToolGate[] = [
  { id: 'read', title: '查看', default: 'auto' },
  { id: 'draft', title: '起草', default: 'auto' },
  { id: 'activate', title: '让安排生效', default: 'auto' },
]
const SCHEDULES_GATE_OF: Readonly<Record<SchedulesCommandName, string>> = {
  help: 'read',
  preview: 'read',
  list: 'read',
  show: 'read',
  history: 'read',
  recover: 'read',
  draft: 'draft',
  revise: 'draft',
  discard: 'draft',
  create: 'activate',
  update: 'activate',
  replace: 'activate',
  promote: 'activate',
  pause: 'activate',
  resume: 'activate',
  stop: 'activate',
}

const ENCODING = 'wrapped' as const
const encoder = new TextEncoder()
const utf8 = (text: string) => encoder.encode(text)

const guide = [
  'A definition has label, recurrence, limits and purpose. It always follows the user time zone and calendar; you cannot pick a calendar. Preview a definition before you create it.',
  'create makes a schedule that takes effect now. draft saves one that does not run until promote; use it when the owner should look first.',
  'Every change to a saved schedule takes the revision you last read with show or list; a stale revision answers conflict and changes nothing.',
  'A write that answers unknown may or may not have happened: call recover with its operation; do not send it again.',
  'Failures are one line, <kind> reason=<why> code=<code>: not_found, conflict, limited, invalid, coverage_insufficient, not_configured, unavailable.',
].join('\n\n')

export const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: schedulesAdoption,
    value: {
      identity: {
        id: '@omne-harness/schedule-tools/text',
        revision: '1',
        digest: describedAdoption({
          owner: '@omne-harness/schedule-tools',
          name: 'text',
          revision: '1',
          schema: { type: 'string' },
        }).digest,
      },
      definition: {
        schema: tree({ type: 'string' }),
        vocabulary: schedulesAdoption,
        descriptions: [],
      },
    },
  },
  program: { kind: 'none' },
  body: {
    kind: 'text',
    codec: describedAdoption({
      owner: '@omne-harness/schedule-tools',
      name: 'utf8-text-body',
      revision: '1',
      encoding: 'UTF-8',
    }),
  },
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
} as const

const menu: CommandTable = {
  name: 'Schedules',
  encoding: ENCODING,
  guide,
  commands: schedulesCommandNames.map(name => ({
    name,
    summary: schedulesSummaries[name],
    parameters: { kind: 'declared', value: schedulesContract(name) },
    returns,
  })),
}

const WRITES = new Set([
  'create',
  'draft',
  'update',
  'revise',
  'replace',
  'promote',
  'pause',
  'resume',
  'stop',
  'discard',
])
const isWrite = (args: SchedulesArguments): args is WriteArguments => WRITES.has(args.command)

const UNATTACHED = 'unavailable reason=the schedule services are not attached to this call'

async function reach(
  execution: ToolExecutionContext,
): Promise<Readonly<{ bound: BoundSchedules; faces: ScheduleFaces }> | string> {
  const bound = schedulesOf(execution)
  if (bound === undefined) return UNATTACHED
  const faces = await bound.faces()
  if ('kind' in faces)
    return faces.reason === 'forbidden'
      ? 'not_found reason=the call does not act for the owner of these schedules'
      : 'unavailable reason=the schedule services are not available'
  return { bound, faces }
}

/** One call is one read or one write: whatever the domain answers is the result. */
async function execute(args: SchedulesArguments, execution: ToolExecutionContext) {
  if (args.command === 'help')
    return `done Schedules help${args.params.name === undefined ? '' : ` ${args.params.name}`}\n${commandGuide(menu, args.params.name)}`
  const reached = await reach(execution)
  if (typeof reached === 'string') return reached
  const { bound, faces } = reached
  if (!isWrite(args)) return read(faces, args as ReadArguments, bound.now())
  const request = writeRequestOf(args, { operationKey: bound.operationKey('initial') })
  if ('invalid' in request) return request.invalid
  return writeLine(args.command, await submit(faces, request))
}

export const schedulesExecutor = {
  execute: (args: SchedulesArguments, _environment: null, context: ToolExecutionContext) =>
    execute(args, context),
}

/** A text result: UTF-8 bytes, checked against the tool's resultMaxBytes. */
export function textResult(tool: string, maximum: number) {
  return {
    codec: {
      adoption: schedulesAdoption,
      encode: (value: unknown) =>
        typeof value === 'string' ? succeed(utf8(value)) : fail({ reason: 'text-required' }),
      decode(bytes: Uint8Array) {
        try {
          return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
        } catch {
          return fail({ reason: 'invalid-utf8' })
        }
      },
    },
    output: {
      adoption: schedulesAdoption,
      check: ({ value }: { value: unknown }) =>
        typeof value === 'string' && utf8(value).byteLength <= maximum
          ? succeed(value)
          : fail({ reason: `the ${tool} result exceeds resultMaxBytes` }),
    },
    renderer: { render: (value: string) => succeed(value) },
    program: { kind: 'none' as const },
  }
}

export function resultMaxBytesOf(construction: JsonValue): number | undefined {
  if (construction.kind !== 'object' || construction.entries.length !== 1) return undefined
  const [entry] = construction.entries
  if (entry?.key !== 'resultMaxBytes' || entry.value.kind !== 'number') return undefined
  const value = Number(entry.value.lexeme)
  return Number.isSafeInteger(value) && value >= 64 ? value : undefined
}

export function createSchedulesAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const maximum = resultMaxBytesOf(construction)
  if (maximum === undefined)
    return fail({
      field: 'construction',
      reason: 'Schedules takes only resultMaxBytes, at least 64',
    })
  const operations: Record<
    string,
    {
      summary: string
      operation: ToolOperation<null, ToolMessageContentBlock>
      release: ToolCommandRelease
    }
  > = {}
  for (const name of schedulesCommandNames) {
    const activates = (activationCommands as readonly string[]).includes(name)
    const operation = defineToolOperation<
      SchedulesArguments,
      string,
      null,
      ToolMessageContentBlock,
      Extract<ToolOperationParameters, { kind: 'declared' }>
    >({
      parameters: { kind: 'declared', value: schedulesContract(name) },
      returns,
      ...(activates ? { describeRelease: describeActivation as never } : {}),
      author: {
        kind: 'ordinary',
        parameters: schedulesParameterCodec(name),
        waits: [],
        executor: schedulesExecutor,
        ...textResult('Schedules', maximum),
      },
    })
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = {
      summary: schedulesSummaries[name],
      operation: operation.ok,
      release: activates
        ? {
            gate: SCHEDULES_GATE_OF[name],
            detail: { kind: ACTIVATION_KIND, schema: activationSchema },
          }
        : { gate: SCHEDULES_GATE_OF[name] },
    }
  }
  const author = defineCommandTool({
    gates: SCHEDULES_GATES,
    implementation: {
      description:
        'Create, change and read the owner schedules, and preview their next times with the calendar each one used.',
      backgroundAllowed: false,
      declarations: {
        adoption: schedulesAdoption,
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

export const schedulesToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/schedule-tools',
    name: 'Schedules',
    revision: '3',
    changes: 'Commands over an attached schedules port; one call is one read or one write.',
  }),
  createAuthor: createSchedulesAuthor,
}
