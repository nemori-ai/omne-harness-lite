import { calendarProtocol, type CalendarProtocol } from '@omne-harness/calendar-protocol'
import { encodeTenantText } from '@omne-harness/public-contract'
import type { BodyOf } from '@omne-harness/sdk/core'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  missingOption,
  serverOption,
  unrecognized,
  usageError,
  type Option,
} from './command-support.ts'
import { readOptions } from './options.ts'
import { report } from './report.ts'

type Question = BodyOf<CalendarProtocol['operations']['answer']>['question']

const COUNT = /^(0|[1-9][0-9]*)$/
const POSITIVE = /^[1-9][0-9]*$/

type Asked = Readonly<{
  options: readonly string[]
  switches?: readonly string[]
  question: (values: Option) => Question | undefined
}>

const text = (values: Option, name: string) => values.get(name) ?? ''
const count = (value: string, pattern: RegExp) =>
  pattern.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined

/** Each question names its dates; `--calendar` and `--version` name the basis, else the settings choose it. */
const QUESTIONS: Readonly<Record<string, Asked>> = {
  day: { options: ['--date'], question: v => ({ kind: 'day', date: text(v, '--date') }) },
  count: {
    options: ['--start', '--end'],
    question: v => ({ kind: 'count', from: text(v, '--start'), to: text(v, '--end') }),
  },
  shift: {
    options: ['--date', '--days'],
    switches: ['--backward'],
    question: v => {
      const days = count(text(v, '--days'), COUNT)
      return days === undefined
        ? undefined
        : {
            kind: 'shift',
            date: text(v, '--date'),
            direction: v.has('--backward') ? 'backward' : 'forward',
            days,
          }
    },
  },
  next: {
    options: ['--after', '--count'],
    question: v => {
      const n = count(text(v, '--count'), POSITIVE)
      return n === undefined ? undefined : { kind: 'next', after: text(v, '--after'), count: n }
    },
  },
  nth: {
    options: ['--start', '--end', '--ordinal'],
    question: v => {
      const given = text(v, '--ordinal')
      const ordinal = given === 'last' ? 'last' : count(given, POSITIVE)
      return ordinal === undefined
        ? undefined
        : { kind: 'nth', periodStart: text(v, '--start'), periodEnd: text(v, '--end'), ordinal }
    },
  },
}
const READS = {
  list: 'list-calendars',
  environment: 'read-environment',
  health: 'read-supply-health',
} as const
type Read = (typeof READS)[keyof typeof READS]

/** What one invocation asks: a read of its own, or a date question. */
type Request =
  | Readonly<{ kind: 'read'; operation: Read; values: Option }>
  | Readonly<{ kind: 'answer'; question: Question; values: Option }>

function requestOf(action: string, rest: readonly string[]): Request | string {
  const name = `calendar ${action}`
  if (Object.hasOwn(READS, action)) {
    const read = readOptions(rest, { accepted: [serverOption], required: [] })
    return read.kind === 'options'
      ? { kind: 'read', operation: READS[action as keyof typeof READS], values: read.values }
      : unrecognized(name)
  }
  const asked = QUESTIONS[action]
  if (!Object.hasOwn(QUESTIONS, action) || asked === undefined) return unrecognized('calendar')
  const read = readOptions(rest, {
    accepted: [serverOption, ...asked.options, '--calendar', '--version'],
    required: asked.options,
    ...(asked.switches === undefined ? {} : { switches: asked.switches }),
  })
  if (read.kind === 'unrecognized') return unrecognized(name)
  if (read.kind === 'missing') return missingOption(name, read.option)
  const question = asked.question(read.values)
  return question === undefined
    ? unrecognized(name)
    : { kind: 'answer', question, values: read.values }
}

/** The calendar and version a question names, when it names them; the server judges the pair. */
function basisOf(values: Option): Readonly<{ calendar?: string; version?: string }> {
  const calendar = values.get('--calendar')
  const version = values.get('--version')
  return {
    ...(calendar === undefined ? {} : { calendar }),
    ...(version === undefined ? {} : { version }),
  }
}

async function runCalendar(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const [action = '', ...rest] = args
  const name = `calendar ${action}`
  const request = requestOf(action, rest)
  if (typeof request === 'string') return usageError(output, request)
  const loaded = loadLogin(request.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const messageId = environment.services.newId()
  const { tenant, link } = loaded
  const result =
    request.kind === 'read'
      ? await link.call(calendarProtocol, request.operation, { tenant }, messageId)
      : await link.call(
          calendarProtocol,
          'answer',
          { tenant, question: request.question, ...basisOf(request.values) },
          messageId,
        )
  if (result === undefined) return usageError(output, unrecognized(name))
  return report(name, result, { messageId, tenant: encodeTenantText(tenant) }, output)
}

export const calendarCommand: CommandSpec = {
  name: 'calendar',
  usage: 'list|environment|health|day|count|shift|next|nth',
  summary:
    'Ask a date question on the calendar your settings choose, or on one you name with --calendar and --version: list the calendars, read the one in effect, read the supply health, or classify, count, shift and list working days.',
  run: runCalendar,
}
