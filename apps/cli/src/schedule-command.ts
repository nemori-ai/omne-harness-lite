import { readFileSync } from 'node:fs'
import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { BodyOf } from '@omne-harness/sdk/core'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  missingOption,
  serverOption,
  unrecognized,
  usageError,
  type Option,
  refusedRequest,
} from './command-support.ts'
import { treeOf, type JsonTree } from './json-tree.ts'
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { report } from './report.ts'

type Operations = ScheduleProtocol['operations']
type Action = BodyOf<Operations['manage-schedule']>['action']
type Control = NonNullable<BodyOf<Operations['list-schedules']>['control']>

const QUERY = '--query'
const COUNT = /^(0|[1-9][0-9]*)$/
const CONTROLS = ['draft', 'active', 'paused', 'stopped', 'exhausted', 'discarded', 'superseded']

/** The parts of an invocation that the subcommand reads; a string is the usage error. */
type Read = Readonly<{ values: Option; file: (name: string) => JsonTree | string }>
type Spec = Readonly<{
  options: readonly string[]
  required: readonly string[]
  switches?: readonly string[]
  send: (read: Read, context: Context) => ((link: Link) => Promise<CallResult>) | string
}>
type Context = Readonly<{ tenant: TenantId; newId: () => string; messageId: string }>

const text = (values: Option, name: string) => values.get(name) ?? ''
const countOf = (value: string | undefined) =>
  value !== undefined && COUNT.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : undefined

function call<K extends keyof Operations & string>(
  operation: K,
  body: BodyOf<Operations[K]>,
  messageId: string,
) {
  return (link: Link) => link.call(scheduleProtocol, operation, body, messageId)
}

/** A manage action by its human name; the revision guards against changing a schedule that moved on. */
function manage(
  options: readonly string[],
  required: readonly string[],
  action: (read: Read) => Action | string,
): Spec {
  return {
    options: ['--schedule', '--revision', '--action-id', ...options],
    required: ['--schedule', '--revision', ...required],
    switches: [QUERY],
    send(read, { tenant, newId, messageId }) {
      const revision = countOf(read.values.get('--revision'))
      if (revision === undefined) return 'revision'
      const built = action(read)
      if (typeof built === 'string') return built
      const queried = read.values.has(QUERY)
      if (queried && !read.values.has('--action-id')) return 'action-id'
      const body = {
        tenant,
        actionId: read.values.get('--action-id') ?? newId(),
        schedule: text(read.values, '--schedule'),
        revision,
        action: built,
      }
      return call(queried ? 'query-manage-schedule' : 'manage-schedule', body, messageId)
    },
  }
}
const reason = (read: Read) => read.values.get('--reason') ?? null
const control = (kind: 'promote' | 'pause' | 'resume' | 'stop' | 'discard') =>
  manage(['--reason'], [], read => ({ kind, reason: reason(read) }))
const rework = (kind: 'revise' | 'replace') =>
  manage(['--definition-file', '--reason'], ['--definition-file', '--reason'], read => {
    const definition = read.file('--definition-file')
    return typeof definition === 'string'
      ? definition
      : { kind, definition, reason: text(read.values, '--reason') }
  })

const SPECS: Readonly<Record<string, Spec>> = {
  list: {
    options: ['--state'],
    required: [],
    switches: ['--all'],
    send(read, { tenant, messageId }) {
      const state = read.values.get('--state')
      if (state !== undefined && !CONTROLS.includes(state)) return 'state'
      return call(
        'list-schedules',
        {
          tenant,
          control: (state ?? null) as Control | null,
          terminal: read.values.has('--all'),
          cursor: null,
          limit: 100,
        },
        messageId,
      )
    },
  },
  show: {
    options: ['--schedule'],
    required: ['--schedule'],
    send: (read, { tenant, messageId }) =>
      call('read-schedule', { tenant, schedule: text(read.values, '--schedule') }, messageId),
  },
  history: {
    options: ['--schedule'],
    required: ['--schedule'],
    send: (read, { tenant, messageId }) =>
      call(
        'read-revisions',
        { tenant, schedule: text(read.values, '--schedule'), cursor: null, limit: 100 },
        messageId,
      ),
  },
  agenda: {
    options: ['--start', '--end', '--timezone'],
    required: ['--start', '--end', '--timezone'],
    send: (read, { tenant, messageId }) =>
      call(
        'read-agenda',
        {
          tenant,
          from: text(read.values, '--start'),
          to: text(read.values, '--end'),
          timezone: text(read.values, '--timezone'),
          cursor: null,
        },
        messageId,
      ),
  },
  preview: {
    options: ['--schedule', '--definition-file', '--count'],
    required: [],
    send(read, { tenant, messageId }) {
      const count = countOf(read.values.get('--count') ?? '5')
      if (count === undefined || count === 0) return 'count'
      const byId = read.values.get('--schedule')
      const hasFile = read.values.has('--definition-file')
      if ((byId === undefined) === !hasFile) return 'one of --schedule and --definition-file'
      if (byId !== undefined)
        return call(
          'preview',
          { tenant, source: { kind: 'schedule', schedule: byId }, count },
          messageId,
        )
      const definition = read.file('--definition-file')
      if (typeof definition === 'string') return definition
      return call(
        'preview',
        { tenant, source: { kind: 'definition', definition }, count },
        messageId,
      )
    },
  },
  create: {
    options: ['--definition-file', '--create-id', '--reason'],
    required: ['--definition-file'],
    switches: ['--draft', QUERY],
    send(read, { tenant, newId, messageId }) {
      const definition = read.file('--definition-file')
      if (typeof definition === 'string') return definition
      const queried = read.values.has(QUERY)
      if (queried && !read.values.has('--create-id')) return 'create-id'
      const body = {
        tenant,
        createId: read.values.get('--create-id') ?? newId(),
        definition,
        state: read.values.has('--draft') ? ('draft' as const) : ('active' as const),
        reason: reason(read),
      }
      return call(queried ? 'query-create-schedule' : 'create-schedule', body, messageId)
    },
  },
  jobs: {
    options: ['--schedule'],
    required: [],
    send: (read, { tenant, messageId }) =>
      call(
        'list-jobs',
        { tenant, schedule: read.values.get('--schedule') ?? null, cursor: null, limit: 100 },
        messageId,
      ),
  },
  job: {
    options: ['--job'],
    required: ['--job'],
    send: (read, { tenant, messageId }) =>
      call('read-job', { tenant, job: text(read.values, '--job') }, messageId),
  },
  'session-jobs': {
    options: ['--session'],
    required: ['--session'],
    send: (read, { tenant, messageId }) =>
      call('read-session-jobs', { tenant, session: text(read.values, '--session') }, messageId),
  },
  'cancel-job': {
    options: ['--job', '--action-id'],
    required: ['--job'],
    switches: [QUERY],
    send(read, { tenant, newId, messageId }) {
      const queried = read.values.has(QUERY)
      if (queried && !read.values.has('--action-id')) return 'action-id'
      const body = {
        tenant,
        actionId: read.values.get('--action-id') ?? newId(),
        job: text(read.values, '--job'),
      }
      return call(queried ? 'query-cancel-job' : 'cancel-job', body, messageId)
    },
  },
  'start-job': {
    options: ['--work-file', '--start-id'],
    required: ['--work-file'],
    switches: [QUERY],
    send(read, { tenant, newId, messageId }) {
      const work = read.file('--work-file')
      if (typeof work === 'string') return work
      const queried = read.values.has(QUERY)
      if (queried && !read.values.has('--start-id')) return 'start-id'
      const body = { tenant, startId: read.values.get('--start-id') ?? newId(), work }
      return call(queried ? 'query-start-job' : 'start-job', body, messageId)
    },
  },
  rename: manage(['--label'], ['--label'], read => ({
    kind: 'rename',
    label: text(read.values, '--label'),
  })),
  edit: manage(['--instruction-file'], ['--instruction-file'], read => {
    const instruction = read.file('--instruction-file')
    return typeof instruction === 'string' ? instruction : { kind: 'edit', instruction }
  }),
  revise: rework('revise'),
  replace: rework('replace'),
  promote: control('promote'),
  pause: control('pause'),
  resume: control('resume'),
  stop: control('stop'),
  discard: control('discard'),
}

function fileReader(values: Option) {
  return (name: string): JsonTree | string => {
    const path = values.get(name)
    if (path === undefined) return name
    try {
      return treeOf(JSON.parse(readFileSync(path, 'utf8')))
    } catch {
      return `${name} is not a readable JSON file`
    }
  }
}

async function runSchedule(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const [action = '', ...rest] = args
  const name = `schedule ${action}`
  const spec = Object.hasOwn(SPECS, action) ? SPECS[action] : undefined
  if (spec === undefined) return usageError(output, unrecognized('schedule'))
  const options = readOptions(rest, {
    accepted: [serverOption, ...spec.options],
    required: spec.required,
    ...(spec.switches === undefined ? {} : { switches: spec.switches }),
  })
  if (options.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (options.kind === 'missing') return usageError(output, missingOption(name, options.option))
  const loaded = loadLogin(options.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const messageId = environment.services.newId()
  const send = spec.send(
    { values: options.values, file: fileReader(options.values) },
    { tenant: loaded.tenant, newId: environment.services.newId, messageId },
  )
  if (typeof send === 'string') return usageError(output, `omne ${name}: ${send}\n`)
  const result = await send(loaded.link)
  if (result.kind === 'rejected') return usageError(output, refusedRequest(name, result.rejection))
  return report(name, result, { messageId, tenant: encodeTenantText(loaded.tenant) }, output)
}

export const scheduleCommand: CommandSpec = {
  name: 'schedule',
  usage:
    'list|show|history|agenda|preview|create|jobs|job|session-jobs|cancel-job|start-job|<action>',
  summary:
    'Read, preview and create the schedules of the acting tenant, or change one by an action: rename, edit, revise, replace, promote, pause, resume, stop or discard. List the Jobs of a schedule or of the tenant, show one, list the Jobs a session carries out (session-jobs), cancel one, or start one directly.',
  run: runSchedule,
}
