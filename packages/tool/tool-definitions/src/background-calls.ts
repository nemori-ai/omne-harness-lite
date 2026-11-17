import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { CommandTable, ParameterContract } from '@omne-harness/tool-contract'
import {
  commandGuide,
  createDefaultParameterCodec,
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type ParameterCodec,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import {
  backgroundCallsOf,
  type BackgroundCallItem,
  type BackgroundFailure,
  type BackgroundOutputView,
  type BackgroundReply,
} from './background-calls-port.ts'
import { parseConstruction, tree } from './protocol.ts'
import { textReturns } from './returns.ts'

export const BKG_TOOL_CALLS = 'BkgToolCalls'
export const backgroundCallsAdoption = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'bkg-tool-calls-protocol',
  revision: '1',
  changes: 'See, read and stop the calls of the current Session that run in the background.',
})
const commandNames = ['help', 'list', 'output', 'terminate'] as const
type CommandName = (typeof commandNames)[number]
export type BackgroundArguments =
  | Readonly<{ kind: 'help'; name?: string }>
  | Readonly<{ kind: 'list' }>
  | Readonly<{ kind: 'output'; id: string; after: string | null }>
  | Readonly<{ kind: 'terminate'; id: string; reason: string }>

const REASON_MAX = 500
const id = { type: 'string', pattern: '^b[1-9][0-9]*$' }
const definitions: Readonly<
  Record<
    CommandName,
    Readonly<{
      summary: string
      required: readonly string[]
      properties: object
      descriptions: readonly Readonly<{ path: string; text: string }>[]
    }>
  >
> = {
  help: {
    summary: 'Read command usage.',
    required: [],
    properties: { name: { type: 'string', enum: commandNames } },
    descriptions: [{ path: 'name', text: 'Command name. Omit for the complete menu.' }],
  },
  list: {
    summary: 'List the calls of this Session in the background, with short id, intent and state.',
    required: [],
    properties: {},
    descriptions: [],
  },
  output: {
    summary: 'Read the output of one call; pass the next position to read only what is new.',
    required: ['id'],
    properties: { id, after: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] } },
    descriptions: [
      { path: 'id', text: 'Short id from list, such as b2.' },
      { path: 'after', text: 'The next position of the previous read. Omit to read the latest.' },
    ],
  },
  terminate: {
    summary: 'Ask Tool to stop one call. The answer is requested, not stopped.',
    required: ['id', 'reason'],
    properties: { id, reason: { type: 'string', minLength: 1, maxLength: REASON_MAX } },
    descriptions: [
      { path: 'id', text: 'Short id from list, such as b2.' },
      { path: 'reason', text: `Why you stop it, one line, at most ${REASON_MAX} characters.` },
    ],
  },
}

function parametersOf(name: CommandName): ParameterContract {
  const definition = definitions[name]
  return {
    vocabulary: backgroundCallsAdoption,
    schema: tree({
      type: 'object',
      additionalProperties: false,
      required: definition.required,
      properties: definition.properties,
    }),
    descriptions: definition.descriptions,
  }
}

const base = createDefaultParameterCodec({
  maxBytes: 65536,
  maxDepth: 4,
  maxItems: 8,
  maxMembers: 8,
  maxStringLength: 4096,
  maxNumberLength: 32,
})
if ('failure' in base) throw new TypeError(base.failure.reason)
const jsonCodec = base.ok
const invalid = (field: string) =>
  fail({ kind: 'invalid', reason: `invalid-field:${field}` } as const)
const SHORT_ID = /^b[1-9][0-9]*$/u

function text(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

function parseHelp(values: ReadonlyMap<string, JsonValue>) {
  const topic = values.get('name')
  if (topic === undefined) return succeed<BackgroundArguments>({ kind: 'help' })
  const named = text(topic)
  return named !== undefined && commandNames.some(command => command === named)
    ? succeed<BackgroundArguments>({ kind: 'help', name: named })
    : invalid('name')
}

function parseOutput(id: string, values: ReadonlyMap<string, JsonValue>) {
  const given = values.get('after')
  const after = given === undefined || given.kind === 'null' ? null : text(given)
  return after === undefined || after === ''
    ? invalid('after')
    : succeed<BackgroundArguments>({ kind: 'output', id, after })
}

function parseTerminate(id: string, values: ReadonlyMap<string, JsonValue>) {
  const reason = text(values.get('reason'))
  const oneLine = reason !== undefined && reason.trim() !== '' && !/[\n\r]/u.test(reason)
  return oneLine && [...reason].length <= REASON_MAX
    ? succeed<BackgroundArguments>({ kind: 'terminate', id, reason })
    : invalid('reason')
}

function parse(name: CommandName, value: JsonValue) {
  if (value.kind !== 'object') return invalid('params')
  const values = new Map(value.entries.map(entry => [entry.key, entry.value]))
  const extra = [...values.keys()].find(key => !Object.hasOwn(definitions[name].properties, key))
  if (extra !== undefined) return invalid(extra)
  if (name === 'list') return succeed<BackgroundArguments>({ kind: 'list' })
  if (name === 'help') return parseHelp(values)
  const id = text(values.get('id'))
  if (id === undefined || !SHORT_ID.test(id)) return invalid('id')
  return name === 'output' ? parseOutput(id, values) : parseTerminate(id, values)
}

function parameterCodec(name: CommandName): ParameterCodec<BackgroundArguments> {
  return {
    adoption: backgroundCallsAdoption,
    parse(input) {
      const answer = jsonCodec.parse(input)
      return 'failure' in answer ? answer : parse(name, answer.ok)
    },
  }
}

const returns = textReturns(backgroundCallsAdoption)
const guide =
  'BkgToolCalls sees, reads and stops the calls of this Session that run in the background. list shows each call with its short id (b1, b2, ...), intent, action, state and last output line. output reads one call: pass the next position it gives as after to read only what came since. terminate asks Tool to stop one call and needs a reason; the answer is requested, not stopped, and the outcome still arrives later as a system reminder. Do not poll: you are woken when a background call ends. It starts nothing in the background itself.'
const menu: CommandTable = {
  name: BKG_TOOL_CALLS,
  encoding: 'wrapped',
  guide,
  commands: commandNames.map(name => ({
    name,
    summary: definitions[name].summary,
    parameters: { kind: 'declared', value: parametersOf(name) },
    returns,
  })),
}

function failureText(command: string, failure: BackgroundFailure): string {
  switch (failure.kind) {
    case 'not-found':
      return `${BKG_TOOL_CALLS} ${command}: no call ${failure.id} in this Session. Use list for the short ids.`
    case 'denied':
      return `${BKG_TOOL_CALLS} ${command}: denied.`
    case 'unavailable':
      return `${BKG_TOOL_CALLS} ${command}: unavailable: ${failure.diagnostic}`
  }
}

const STOP_TEXT = { requested: 'stop requested', accepted: 'stop accepted', proven: 'stopped' }

export function listLine(item: BackgroundCallItem): string {
  const stop =
    item.stop === null
      ? ''
      : `  [${STOP_TEXT[item.stop.progress]} by ${item.stop.by}${item.stop.reason === null ? '' : `: ${item.stop.reason}`}]`
  const last = item.lastLine === null ? '' : `  | ${item.lastLine}`
  return `${item.id}  ${item.status}  ${item.intent ?? '(no intent)'}  ${item.action}${stop}${last}`
}

function outputText(view: BackgroundOutputView): string {
  const head = `${view.id} ${view.status}`
  const ended =
    view.status === 'ended'
      ? '\nThe call ended; its outcome is in a system reminder. Do not call it again to get it.'
      : ''
  switch (view.output.kind) {
    case 'none':
      return `${head}\nNo output body: the call has written no output that can be read.${ended}`
    case 'unreadable':
      return `${head}\nThe output cannot be read now: ${view.output.reason}${ended}`
    default:
      return `${head}\n${view.output.text}\nnext: ${view.output.next} (${view.output.kind}; pass it as after to read only what is new)${ended}`
  }
}

function answerText<T>(command: string, reply: BackgroundReply<T>, show: (ok: T) => string) {
  return 'failure' in reply
    ? failureText(command, reply.failure)
    : `done ${BKG_TOOL_CALLS} ${command}\n${show(reply.ok)}`
}

async function execute(args: BackgroundArguments, context: ToolExecutionContext): Promise<string> {
  if (args.kind === 'help')
    return `done ${BKG_TOOL_CALLS} help${args.name === undefined ? '' : ` ${args.name}`}\n${commandGuide(menu, args.name)}`
  const calls = backgroundCallsOf(context)
  if (calls === undefined)
    return failureText(args.kind, { kind: 'unavailable', diagnostic: 'the Session is not bound' })
  switch (args.kind) {
    case 'list':
      return answerText('list', await calls.list(), items =>
        items.length === 0 ? 'No calls in the background.' : items.map(listLine).join('\n'),
      )
    case 'output':
      return answerText(
        'output',
        await calls.output({ id: args.id, after: args.after }),
        outputText,
      )
    case 'terminate':
      return answerText(
        'terminate',
        await calls.terminate({ id: args.id, reason: args.reason }),
        stop =>
          stop.kind === 'ended'
            ? `${stop.id} already ended; nothing to stop.`
            : `${stop.id} stop requested. It has not stopped yet; its outcome arrives later as a system reminder that says you stopped it.`,
      )
  }
}

function operationOf(name: CommandName, maximum: number) {
  const tooLarge = `${BKG_TOOL_CALLS} ${name}: the answer exceeds resultMaxBytes; read output with a later after.`
  return defineToolOperation<
    BackgroundArguments,
    string,
    null,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: parametersOf(name) },
    returns,
    author: {
      kind: 'ordinary',
      parameters: parameterCodec(name),
      waits: [],
      executor: {
        async execute(args, _environment, context) {
          const answer = await execute(args, context)
          return new TextEncoder().encode(answer).byteLength <= maximum ? answer : tooLarge
        },
      },
      codec: {
        adoption: backgroundCallsAdoption,
        encode: (value: unknown) =>
          typeof value === 'string'
            ? succeed(new TextEncoder().encode(value))
            : fail({ reason: 'text-required' }),
        decode(bytes) {
          try {
            return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
          } catch {
            return fail({ reason: 'invalid-utf8' })
          }
        },
      },
      output: {
        adoption: backgroundCallsAdoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && new TextEncoder().encode(value).byteLength <= maximum
            ? succeed(value)
            : fail({ reason: 'unavailable: output exceeds resultMaxBytes' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
  })
}

export function createBackgroundCallsAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const parsed = parseConstruction(construction, [
    {
      name: 'resultMaxBytes',
      kind: 'positive',
      required: true,
      description: 'Maximum complete UTF-8 output bytes.',
    },
  ])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const maximum = parsed.ok.number('resultMaxBytes', 0)
  const commands: Record<
    string,
    { summary: string; operation: ToolOperation<null, ToolMessageContentBlock> }
  > = {}
  for (const name of commandNames) {
    const operation = operationOf(name, maximum)
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    commands[name] = { summary: definitions[name].summary, operation: operation.ok }
  }
  const author = defineCommandTool({
    implementation: {
      description:
        'See, read and stop the calls of the current Session that run in the background.',
      backgroundAllowed: false,
      declarations: {
        adoption: backgroundCallsAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: 'wrapped',
    guide,
    commands,
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}

export const backgroundCallsToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: BKG_TOOL_CALLS,
    revision: '1',
    returns: 'Text answers for the model: the list, a part of one output, or a stop request.',
    changes: 'Four commands over the calls of the current Session in the background.',
  }),
  createAuthor: createBackgroundCallsAuthor,
}
