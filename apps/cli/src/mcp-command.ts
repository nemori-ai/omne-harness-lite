import { mcpProtocol } from '@omne-harness/mcp-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  missingOption,
  serverOption,
  unrecognized,
  usageError,
} from './command-support.ts'
import { treeOf, type JsonTree } from './json-tree.ts'
import type { Link } from './link.ts'
import { readOptions } from './options.ts'
import { report } from './report.ts'
import { splitArguments } from './split-arguments.ts'

const JSON_SWITCH = '--json'
const NO_WAIT_SWITCH = '--no-wait'
const ARGS_OPTION = '--args'
const AFTER_OPTION = '--after'
const PAGE = 100
const POLL_MS = 500

type Action =
  | 'list'
  | 'show'
  | 'refresh'
  | 'connect'
  | 'disconnect'
  | 'events'
  | 'subscribe'
  | 'unsubscribe'
  | 'tail'

const WORDS: Readonly<Record<Action, number>> = {
  list: 0,
  show: 1,
  refresh: 1,
  connect: 1,
  disconnect: 1,
  events: 1,
  subscribe: 2,
  unsubscribe: 2,
  tail: 2,
}

const isAction = (value: string | undefined): value is Action =>
  value !== undefined && Object.hasOwn(WORDS, value)

type Endpoint = Readonly<{
  name: string
  connection: Readonly<{ state: string; reason: string | null }>
  credential: string
  credentialState?: string
  connect?: string
  use: Readonly<{ kind: string; reason?: string }>
  catalog: Readonly<{ kind: string; actions?: number; reason?: string | null }>
}>
type Subscription = Readonly<{
  name: string
  delivery: string
  state: string
  reason: string | null
  subscribers: number
}>
type Item = Readonly<{
  seq: number
  kind: string
  eventId?: string
  timestamp?: string
  data?: unknown
  reason?: string
}>
type ActionRow = Readonly<{
  name: string
  summary: string
  available: boolean
  reason: string | null
}>

function table(rows: readonly (readonly string[])[]): string {
  const widths = (rows[0] ?? []).map((_, column) =>
    Math.max(...rows.map(row => row[column]?.length ?? 0)),
  )
  const lines = rows.map(row =>
    row
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join('  ')
      .trimEnd(),
  )
  return `${lines.join('\n')}\n`
}

// The state of the credential when the server tells it (revision 2), else what is set.
const credentialOf = ({ name, credential, credentialState }: Endpoint) =>
  credentialState === 'rejected'
    ? `rejected (set the right one: omne setting set mcp:${name} credential)`
    : credentialState === 'reconnect-required'
      ? `reconnect-required (connect again: omne mcp connect ${name})`
      : (credentialState ?? credential)

const connectionOf = ({ state, reason }: Endpoint['connection']) =>
  reason === null ? state : `${state} (${reason})`
const useOf = ({ kind, reason }: Endpoint['use']) =>
  kind === 'usable' ? 'usable' : `blocked: ${reason ?? ''}`
const catalogOf = ({ kind, actions, reason }: Endpoint['catalog']) =>
  kind === 'acquired'
    ? `${String(actions)} actions`
    : `not acquired${reason === null || reason === undefined ? '' : `: ${reason}`}`

const stateOf = ({ state, reason }: Subscription) =>
  reason === null ? state : `${state} (${reason})`

const itemLine = (item: Item) =>
  item.kind === 'gap' || item.kind === 'ended'
    ? `${String(item.seq)}  -- ${item.kind}: ${item.reason ?? ''}`
    : `${String(item.seq)}  ${item.timestamp ?? ''}  ${item.eventId ?? ''}  ${JSON.stringify(item.data)}`

const RENDER = {
  list: (body: unknown) =>
    table([
      ['NAME', 'CONNECTION', 'CREDENTIAL', 'USE', 'ACTIONS'],
      ...(body as { items: Endpoint[] }).items.map(item => [
        item.name,
        connectionOf(item.connection),
        item.credentialState ?? item.credential,
        useOf(item.use),
        item.catalog.kind === 'acquired' ? String(item.catalog.actions) : '-',
      ]),
    ]),
  show: (body: unknown) => {
    const { endpoint, actions } = body as { endpoint: Endpoint; actions: ActionRow[] | null }
    const lines = [
      `Name: ${endpoint.name}`,
      `Connection: ${connectionOf(endpoint.connection)}`,
      `Credential: ${credentialOf(endpoint)}`,
      `Use: ${useOf(endpoint.use)}`,
      `Catalog: ${catalogOf(endpoint.catalog)}`,
      ...(actions === null
        ? []
        : [
            'Actions:',
            ...actions.map(
              action =>
                `  ${action.name}${action.available ? '' : ` (unavailable: ${action.reason ?? ''})`}  ${action.summary}`,
            ),
          ]),
    ]
    return `${lines.join('\n')}\n`
  },
  refresh: (body: unknown) => {
    const { refreshed, reason } = body as { refreshed: string; reason: string | null }
    return `${refreshed}${reason === null ? '' : `: ${reason}`}\n`
  },
  connect: (body: unknown) =>
    `Open this address in a browser and consent:\n${(body as { url: string }).url}\n`,
  disconnect: () => 'disconnected\n',
  events: (body: unknown) => {
    const { events } = body as {
      events: { kind: string; types?: { name: string; description: string; delivery: string[] }[] }
    }
    if (events.kind === 'not-declared') return 'The endpoint offers no events.\n'
    if (events.kind !== 'acquired') return 'Events: not acquired (refresh the endpoint first)\n'
    const types = events.types ?? []
    if (types.length === 0) return 'The endpoint offers events, but no type yet.\n'
    return table([
      ['EVENT', 'DELIVERY', 'DESCRIPTION'],
      ...types.map(type => [type.name, type.delivery.join(','), type.description]),
    ])
  },
  subscribe: (body: unknown) => {
    const { subscription } = body as { subscription: Subscription }
    return `subscribed to ${subscription.name}: ${subscription.delivery}, ${stateOf(subscription)}\n`
  },
  unsubscribe: (body: unknown) =>
    (body as { unsubscribed: string }).unsubscribed === 'unsubscribed'
      ? 'unsubscribed\n'
      : 'not subscribed\n',
  tail: (body: unknown) => {
    const { subscription, items } = body as { subscription: Subscription; items: Item[] }
    const head = `Subscription: ${subscription.name}, ${subscription.delivery}, ${stateOf(subscription)}`
    return `${[head, ...items.map(itemLine)].join('\n')}\n`
  },
}

type Invocation = Readonly<{
  action: Action
  name: string
  values: ReadonlyMap<string, string>
  word: string | undefined
  event: string | undefined
}>

function readInvocation(action: Action, rest: readonly string[]): Invocation | string {
  const name = `mcp ${action}`
  const subscribing = WORDS[action] === 2
  const accepted = subscribing
    ? [serverOption, ARGS_OPTION, ...(action === 'tail' ? [AFTER_OPTION] : [])]
    : [serverOption]
  const { words, options } = splitArguments(rest, accepted)
  const read = readOptions(options, {
    accepted,
    switches: action === 'connect' ? [JSON_SWITCH, NO_WAIT_SWITCH] : [JSON_SWITCH],
    required: [],
  })
  if (read.kind === 'unrecognized' || words.length > WORDS[action]) return unrecognized(name)
  if (read.kind === 'missing') return missingOption(name, read.option)
  if (words.length < WORDS[action])
    return missingOption(name, words.length === 0 ? '<name>' : '<event>')
  return { action, name, values: read.values, word: words[0], event: words[1] }
}

async function runMcp(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const [action, ...rest] = args
  if (!isAction(action)) return usageError(output, unrecognized('mcp'))
  const invocation = readInvocation(action, rest)
  if (typeof invocation === 'string') return usageError(output, invocation)
  const loaded = loadLogin(invocation.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const messageId = environment.services.newId()
  const result = await callOf(invocation, loaded.tenant, loaded.link, messageId)
  if (result === undefined) return usageError(output, unrecognized(invocation.name))
  const echo = { messageId, tenant: encodeTenantText(loaded.tenant) }
  const readable = result.kind === 'response' && result.outcome === 'succeeded'
  if (invocation.values.has(JSON_SWITCH) || !readable)
    return report(invocation.name, result, echo, output)
  const shown = printed(invocation, result.body, output)
  if (invocation.action !== 'connect' || shown !== 0 || invocation.values.has(NO_WAIT_SWITCH))
    return shown
  const until = Date.parse(String((result.body as { expiresAt: unknown }).expiresAt))
  return waitConnected(invocation, loaded.tenant, loaded.link, until, environment, output)
}

type Reading = Readonly<{ kind: string; outcome?: string; body?: unknown }>

/** Until the person consented or the connection was given up: connected when the credential is there, else not. */
async function waitConnected(
  invocation: Invocation,
  tenant: TenantId,
  link: Link,
  until: number,
  environment: CommandEnvironment,
  output: CliOutput,
): Promise<ExitCode> {
  const name = invocation.word ?? ''
  while (
    /* wall-clock: operation-timing -- wait for the consent until the connection is given up. */ Date.now() <
    until
  ) {
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
    const id = environment.services.newId()
    const read = (await link.call(mcpProtocol, 'read-endpoint', { tenant, name }, id)) as Reading
    if (read.kind !== 'response' || read.outcome !== 'succeeded') continue
    const { endpoint } = read.body as { endpoint: Endpoint }
    if (endpoint.connect === 'connecting') continue
    const connected = endpoint.credentialState === 'present'
    output.stdout(connected ? 'connected\n' : 'not connected\n')
    return connected ? 0 : 3
  }
  output.stdout('not connected: the consent did not come back in time\n')
  return 3
}

function printed(invocation: Invocation, body: unknown, output: CliOutput): ExitCode {
  try {
    output.stdout(RENDER[invocation.action](body))
  } catch {
    output.stderr(`omne ${invocation.name}: cannot write standard output\n`)
    return 1
  }
  return invocation.action === 'refresh' && (body as { refreshed: string }).refreshed === 'failed'
    ? 3
    : 0
}

function argumentsOf(invocation: Invocation): JsonTree | undefined {
  try {
    const value: unknown = JSON.parse(invocation.values.get(ARGS_OPTION) ?? '{}')
    const tree = treeOf(value)
    return tree.kind === 'object' && !Array.isArray(value) ? tree : undefined
  } catch {
    return undefined
  }
}

function afterOf(invocation: Invocation): number | undefined {
  const text = invocation.values.get(AFTER_OPTION) ?? '0'
  return /^(0|[1-9][0-9]{0,14})$/.test(text) ? Number(text) : undefined
}

function callOf(invocation: Invocation, tenant: TenantId, link: Link, messageId: string) {
  const name = invocation.word ?? ''
  if (WORDS[invocation.action] === 2) {
    const args = argumentsOf(invocation)
    const after = afterOf(invocation)
    if (args === undefined || after === undefined) return undefined
    const named = { tenant, name, event: invocation.event ?? '', arguments: args as never }
    if (invocation.action === 'subscribe')
      return link.call(mcpProtocol, 'subscribe-events', named, messageId)
    if (invocation.action === 'unsubscribe')
      return link.call(mcpProtocol, 'unsubscribe-events', named, messageId)
    return link.call(mcpProtocol, 'read-events', { ...named, after, limit: PAGE }, messageId)
  }
  switch (invocation.action) {
    case 'list':
      return link.call(mcpProtocol, 'list-endpoints', { tenant }, messageId)
    case 'show':
      return link.call(mcpProtocol, 'read-endpoint', { tenant, name }, messageId)
    case 'refresh':
      return link.call(mcpProtocol, 'refresh-endpoint', { tenant, name }, messageId)
    case 'connect':
      return link.call(mcpProtocol, 'begin-connect', { tenant, name }, messageId)
    case 'disconnect':
      return link.call(mcpProtocol, 'disconnect', { tenant, name }, messageId)
    case 'events':
      return link.call(mcpProtocol, 'list-event-types', { tenant, name }, messageId)
    default:
      return undefined
  }
}

export const mcpCommand: CommandSpec = {
  name: 'mcp',
  usage: 'list|show|refresh|connect|disconnect|events|subscribe|unsubscribe|tail',
  summary:
    'Show how each MCP endpoint of the acting tenant stands (list), show one with its actions (show <name>), fetch the actions of one again (refresh <name>), connect an OAuth endpoint in a browser and wait until it is connected (connect <name> [--no-wait]), end that connection (disconnect <name>), list the kinds of events one offers (events <name>), subscribe to one kind or leave it (subscribe|unsubscribe <name> <event> [--args <json>]), or show what came of a subscription (tail <name> <event> [--args <json>] [--after <seq>]).',
  run: runMcp,
}
