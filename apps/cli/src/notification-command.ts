import {
  notificationProtocol,
  type NotificationProtocol,
} from '@omne-harness/notification-protocol'
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
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'

type Operations = NotificationProtocol['operations']
type Mark = BodyOf<Operations['mark']>['operation']

/** The command line is the owner's: the inbox is the person's, and a send is the owner's own post unless told otherwise. */
const PERSON = { kind: 'person' } as const
const OWN_SOURCE = 'owner.posts'
const OWN_TYPE = 'post'
const PAGE = 20
const COUNT = /^(0|[1-9][0-9]*)$/

type Context = Readonly<{ tenant: TenantId; newId: () => string; messageId: string }>
/** What one invocation sends, and what of it the printed result repeats. A string is the usage error. */
type Sending = Readonly<{
  echo: RequestEcho
  call: (link: Link) => Promise<CallResult>
  /** Written to standard error after a result nobody knows. */
  uncertain?: string
}>
type Spec = Readonly<{
  options: readonly string[]
  required: readonly string[]
  switches?: readonly string[]
  send: (values: Option, context: Context) => Sending | string
}>

const countOf = (value: string | undefined) =>
  value !== undefined && COUNT.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : undefined

function call<K extends keyof Operations & string>(
  operation: K,
  body: BodyOf<Operations[K]>,
  messageId: string,
) {
  return (link: Link) => link.call(notificationProtocol, operation, body, messageId)
}

const REF = ['--event', '--source']
/** One notification of the person, by the send it came from. */
const refOf = (values: Option) => ({
  source: values.get('--source') ?? OWN_SOURCE,
  event: values.get('--event') ?? '',
})

const mark = (operation: Mark): Spec => ({
  options: REF,
  required: ['--event'],
  send(values, { tenant, messageId }) {
    const ref = refOf(values)
    return {
      echo: ref,
      call: call('mark', { tenant, recipient: PERSON, ...ref, operation }, messageId),
    }
  },
})

const SPECS: Readonly<Record<string, Spec>> = {
  send: {
    options: ['--title', '--body', '--event', '--source', '--type', '--subject', '--replace'],
    required: ['--title'],
    send(values, { tenant, newId, messageId }) {
      const ref = {
        source: values.get('--source') ?? OWN_SOURCE,
        event: values.get('--event') ?? newId(),
      }
      const body = {
        tenant,
        ...ref,
        type: values.get('--type') ?? OWN_TYPE,
        subject: values.get('--subject') ?? null,
        title: values.get('--title') ?? '',
        body: values.get('--body') ?? '',
        locator: null,
        replaceKey: values.get('--replace') ?? null,
        renotify: false,
        named: [PERSON],
      }
      return {
        echo: ref,
        call: call('send', body, messageId),
        uncertain: `omne notification send: ask what became of it with: omne notification sent --source ${ref.source} --event ${ref.event}\n`,
      }
    },
  },
  sent: {
    options: REF,
    required: ['--event'],
    send(values, { tenant, messageId }) {
      const ref = refOf(values)
      return { echo: ref, call: call('query-send', { tenant, ...ref }, messageId) }
    },
  },
  list: {
    options: ['--after', '--limit'],
    required: [],
    switches: ['--all'],
    send(values, { tenant, messageId }) {
      const after = values.has('--after') ? countOf(values.get('--after')) : null
      const limit = values.has('--limit') ? countOf(values.get('--limit')) : PAGE
      if (after === undefined) return 'after'
      if (limit === undefined) return 'limit'
      const filter = values.has('--all') ? ('all' as const) : ('unresolved' as const)
      return {
        echo: {},
        call: call('list-inbox', { tenant, recipient: PERSON, filter, after, limit }, messageId),
      }
    },
  },
  show: {
    options: REF,
    required: ['--event'],
    send(values, { tenant, messageId }) {
      const ref = refOf(values)
      return {
        echo: ref,
        call: call('read-notification', { tenant, recipient: PERSON, ...ref }, messageId),
      }
    },
  },
  seen: mark('seen'),
  done: mark('done'),
  dismiss: mark('dismiss'),
  restore: mark('restore'),
  sources: {
    options: [],
    required: [],
    send: (_values, { tenant, messageId }) => ({
      echo: {},
      call: call('list-sources', { tenant }, messageId),
    }),
  },
}

/** The action and its options as given; a string is the usage error. */
function invocationOf(
  args: readonly string[],
): Readonly<{ name: string; spec: Spec; values: Option }> | string {
  const [action = '', ...rest] = args
  const name = `notification ${action}`
  const spec = Object.hasOwn(SPECS, action) ? SPECS[action] : undefined
  if (spec === undefined) return unrecognized('notification')
  const options = readOptions(rest, {
    accepted: [serverOption, ...spec.options],
    required: spec.required,
    switches: spec.switches ?? [],
  })
  if (options.kind === 'unrecognized') return unrecognized(name)
  if (options.kind === 'missing') return missingOption(name, options.option)
  return { name, spec, values: options.values }
}

async function runNotification(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const invocation = invocationOf(args)
  if (typeof invocation === 'string') return usageError(output, invocation)
  const { name, spec, values } = invocation
  const loaded = loadLogin(values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const { newId } = environment.services
  const messageId = newId()
  const sending = spec.send(values, { tenant: loaded.tenant, newId, messageId })
  if (typeof sending === 'string') return usageError(output, `omne ${name}: ${sending}\n`)
  const result = await sending.call(loaded.link)
  if (result.kind === 'rejected') return usageError(output, refusedRequest(name, result.rejection))
  const echo = { messageId, tenant: encodeTenantText(loaded.tenant), ...sending.echo }
  const code = report(name, result, echo, output)
  if (code === 5 && sending.uncertain !== undefined) output.stderr(sending.uncertain)
  return code
}

export const notificationCommand: CommandSpec = {
  name: 'notification',
  usage: 'send|sent|list|show|seen|done|dismiss|restore|sources',
  summary:
    'Post a notification to yourself and ask what became of it, list and read the inbox of the acting tenant, mark a notification seen, done, dismissed or restored, or list the sources.',
  run: runNotification,
}
