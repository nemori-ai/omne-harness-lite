import type { CalendarAnswer, CalendarDomainError } from '@omne-harness/calendar-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { CommandTable } from '@omne-harness/tool-contract'
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
import { calendarOf } from './port.ts'
import {
  calendarAdoption,
  calendarCommands,
  calendarContract,
  calendarParameterCodec,
  tree,
  type CalendarArguments,
  type CalendarCommandName,
} from './protocol.ts'

const ENCODING = 'wrapped' as const
const textBody = {
  kind: 'text',
  codec: describedAdoption({
    owner: '@omne-harness/calendar-tools',
    name: 'utf8-text-body',
    revision: '1',
    encoding: 'UTF-8',
  }),
} as const
const stringSchema = describedAdoption({
  owner: '@omne-harness/calendar-tools',
  name: 'string-output',
  revision: '1',
  schema: { type: 'string' },
})
const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: calendarAdoption,
    value: {
      identity: {
        id: stringSchema.name,
        revision: stringSchema.revision,
        digest: stringSchema.digest,
      },
      definition: {
        schema: tree({ type: 'string' }),
        vocabulary: calendarAdoption,
        descriptions: [],
      },
    },
  },
  program: { kind: 'none' },
  body: textBody,
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
} as const

const guide =
  'Every date is YYYY-MM-DD in the user time zone. The calendar is the one the user set; you cannot choose another. A result names the calendar, its version and the dates it covers: tell the user which calendar the answer came from. Failures are one line, <kind> reason=<why>: coverage_insufficient (the date is outside the calendar coverage: say so, do not guess), not_configured (the user has no effective calendar: ask the user to set one), forbidden, invalid, too-large, unavailable (try later; it does not mean there are no holidays).'
const menu: CommandTable = {
  name: 'Calendar',
  encoding: ENCODING,
  guide,
  commands: calendarCommands.map(command => ({
    name: command.name,
    summary: command.summary,
    parameters: { kind: 'declared', value: calendarContract(command.name) },
    returns,
  })),
}

const KIND: Partial<Record<CalendarDomainError['code'], string>> = {
  coverage_insufficient: 'coverage_insufficient',
  unknown_calendar_version: 'coverage_insufficient',
  missing_environment: 'not_configured',
  environment_incoherent: 'not_configured',
  forbidden: 'forbidden',
  unauthenticated: 'forbidden',
  not_found: 'forbidden',
  invalid_input: 'invalid',
  invalid_timezone: 'invalid',
  search_limit: 'invalid',
}

function answerText(command: CalendarCommandName, answer: CalendarAnswer): string {
  if (answer.kind === 'error') {
    const { code, message, details } = answer.error
    const kind = KIND[code] ?? 'unavailable'
    const detail = Object.keys(details).length === 0 ? '' : ` details=${JSON.stringify(details)}`
    return `${kind} reason=${message} code=${code}${detail}`
  }
  const { calendarId, versionId, coverageStart, coverageEnd, result } = answer.value
  return `done Calendar ${command} calendar=${calendarId} version=${versionId} coverage=${coverageStart}..${coverageEnd}\n${JSON.stringify(result.value)}`
}

async function execute(
  command: CalendarCommandName,
  args: CalendarArguments,
  execution: ToolExecutionContext,
): Promise<string> {
  if (args.kind === 'help')
    return `done Calendar help${args.name === undefined ? '' : ` ${args.name}`}\n${commandGuide(menu, args.name)}`
  const calendar = calendarOf(execution)
  if (calendar === undefined) return 'unavailable reason=the calendar is not attached to this call'
  return answerText(command, await calendar.answer(args.question))
}

const utf8 = (text: string) => new TextEncoder().encode(text)

/** A result past the bound is a failure that says so; it is never cut and passed off as whole. */
function bounded(text: string, maximum: number): string {
  if (utf8(text).byteLength <= maximum) return text
  const failure = `too-large reason=the result has ${String(utf8(text).byteLength)} bytes, more than ${String(maximum)}; ask for fewer days`
  return utf8(failure).byteLength <= maximum ? failure : 'too-large'
}

function resultMaxBytesOf(construction: JsonValue): number | undefined {
  if (construction.kind !== 'object' || construction.entries.length !== 1) return undefined
  const [entry] = construction.entries
  if (entry?.key !== 'resultMaxBytes' || entry.value.kind !== 'number') return undefined
  const value = Number(entry.value.lexeme)
  return Number.isSafeInteger(value) && value >= 16 ? value : undefined
}

function operationOf(name: CalendarCommandName, maximum: number) {
  return defineToolOperation<
    CalendarArguments,
    string,
    null,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: calendarContract(name) },
    returns,
    author: {
      kind: 'ordinary',
      parameters: calendarParameterCodec(name),
      waits: [],
      executor: {
        async execute(args, _environment, execution) {
          return bounded(await execute(name, args, execution), maximum)
        },
      },
      codec: {
        adoption: calendarAdoption,
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
        adoption: calendarAdoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && utf8(value).byteLength <= maximum
            ? succeed(value)
            : fail({ reason: 'bounded-text-required' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
  })
}

export function createCalendarAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const maximum = resultMaxBytesOf(construction)
  if (maximum === undefined)
    return fail({
      field: 'construction',
      reason: 'Calendar takes only resultMaxBytes, at least 16',
    })
  const operations: Record<
    string,
    { summary: string; operation: ToolOperation<null, ToolMessageContentBlock> }
  > = {}
  for (const command of calendarCommands) {
    const operation = operationOf(command.name, maximum)
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[command.name] = { summary: command.summary, operation: operation.ok }
  }
  const author = defineCommandTool({
    implementation: {
      description:
        'Answer date questions on the calendar the user set: working days, holidays, counts and shifts. Each answer names the calendar and its version.',
      backgroundAllowed: false,
      declarations: {
        adoption: calendarAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: ENCODING,
    guide,
    gates: [{ id: 'invoke', title: '日历计算', default: 'auto' }],
    commands: operations,
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}

export const calendarToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/calendar-tools',
    name: 'Calendar',
    revision: '2',
    changes: 'help and five date questions over an attached calendar port; bounded text.',
  }),
  createAuthor: createCalendarAuthor,
}
