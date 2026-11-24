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
import type { Link } from './link.ts'
import { readOptions } from './options.ts'
import { report } from './report.ts'
import { splitArguments } from './split-arguments.ts'

const JSON_SWITCH = '--json'

type Action = 'list' | 'show' | 'refresh'

const WORDS: Readonly<Record<Action, number>> = { list: 0, show: 1, refresh: 1 }

const isAction = (value: string | undefined): value is Action =>
  value !== undefined && Object.hasOwn(WORDS, value)

type Endpoint = Readonly<{
  name: string
  connection: Readonly<{ state: string; reason: string | null }>
  credential: string
  use: Readonly<{ kind: string; reason?: string }>
  catalog: Readonly<{ kind: string; actions?: number; reason?: string | null }>
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

const connectionOf = ({ state, reason }: Endpoint['connection']) =>
  reason === null ? state : `${state} (${reason})`
const useOf = ({ kind, reason }: Endpoint['use']) =>
  kind === 'usable' ? 'usable' : `blocked: ${reason ?? ''}`
const catalogOf = ({ kind, actions, reason }: Endpoint['catalog']) =>
  kind === 'acquired'
    ? `${String(actions)} actions`
    : `not acquired${reason === null || reason === undefined ? '' : `: ${reason}`}`

const RENDER = {
  list: (body: unknown) =>
    table([
      ['NAME', 'CONNECTION', 'CREDENTIAL', 'USE', 'ACTIONS'],
      ...(body as { items: Endpoint[] }).items.map(item => [
        item.name,
        connectionOf(item.connection),
        item.credential,
        useOf(item.use),
        item.catalog.kind === 'acquired' ? String(item.catalog.actions) : '-',
      ]),
    ]),
  show: (body: unknown) => {
    const { endpoint, actions } = body as { endpoint: Endpoint; actions: ActionRow[] | null }
    const lines = [
      `Name: ${endpoint.name}`,
      `Connection: ${connectionOf(endpoint.connection)}`,
      `Credential: ${endpoint.credential}`,
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
}

type Invocation = Readonly<{
  action: Action
  name: string
  values: ReadonlyMap<string, string>
  word: string | undefined
}>

function readInvocation(action: Action, rest: readonly string[]): Invocation | string {
  const name = `mcp ${action}`
  const { words, options } = splitArguments(rest, [serverOption])
  const read = readOptions(options, {
    accepted: [serverOption],
    switches: [JSON_SWITCH],
    required: [],
  })
  if (read.kind === 'unrecognized' || words.length > WORDS[action]) return unrecognized(name)
  if (read.kind === 'missing') return missingOption(name, read.option)
  if (words.length < WORDS[action]) return missingOption(name, '<name>')
  return { action, name, values: read.values, word: words[0] }
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
  return printed(invocation, result.body, output)
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

function callOf(invocation: Invocation, tenant: TenantId, link: Link, messageId: string) {
  const name = invocation.word ?? ''
  switch (invocation.action) {
    case 'list':
      return link.call(mcpProtocol, 'list-endpoints', { tenant }, messageId)
    case 'show':
      return link.call(mcpProtocol, 'read-endpoint', { tenant, name }, messageId)
    case 'refresh':
      return link.call(mcpProtocol, 'refresh-endpoint', { tenant, name }, messageId)
  }
}

export const mcpCommand: CommandSpec = {
  name: 'mcp',
  usage: 'list|show|refresh',
  summary:
    'Show how each MCP endpoint of the acting tenant stands (list), show one with its actions (show <name>), or fetch the actions of one again (refresh <name>).',
  run: runMcp,
}
