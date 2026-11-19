import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { encodeTenantText } from '@omne-harness/public-contract'
import { workspaceProtocol } from '@omne-harness/workspace-protocol'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  serverOption,
  unrecognized,
  usageError,
  type Option,
} from './command-support.ts'
import { readOptions } from './options.ts'
import { exitCodeOf, report } from './report.ts'

/** The directory is on the server's node. Where this machine can resolve it, its real path is sent. */
function addressOf(directory: string): string {
  const absolute = resolve(directory)
  try {
    return realpathSync(absolute)
  } catch {
    return absolute
  }
}

type Action = Readonly<{
  /** How many words follow the action before the options. */
  words: number
  options: readonly string[]
}>

const ACTIONS: Readonly<Record<string, Action>> = {
  register: { words: 1, options: ['--type', '--resume'] },
  list: { words: 0, options: [] },
  show: { words: 1, options: [] },
}

type Parsed = Readonly<{ action: string; words: readonly string[]; values: Option }>

function parse(args: readonly string[]): Parsed | string {
  const [action = '', ...rest] = args
  const spec = ACTIONS[action]
  if (!Object.hasOwn(ACTIONS, action) || spec === undefined) return unrecognized('workspace')
  const words = rest.slice(0, spec.words)
  if (words.length < spec.words || words.some(word => word.startsWith('--')))
    return unrecognized(`workspace ${action}`)
  const read = readOptions(rest.slice(spec.words), {
    accepted: [serverOption, ...spec.options],
    required: [],
  })
  return read.kind === 'options'
    ? { action, words, values: read.values }
    : unrecognized(`workspace ${action}`)
}

type Ready = Readonly<{
  name: string
  words: readonly string[]
  values: Option
  login: Extract<ReturnType<typeof loadLogin>, { kind: 'login' }>
  messageId: string
  output: CliOutput
  newId: () => string
}>

/** A read answers once; what it answered is the report. `workspace` given, it is a describe. */
async function read(ready: Ready, workspace?: string): Promise<ExitCode> {
  const { name, login, messageId, output } = ready
  const { tenant, link } = login
  const result =
    workspace === undefined
      ? await link.call(workspaceProtocol, 'list', { tenant }, messageId)
      : await link.call(workspaceProtocol, 'describe', { tenant, workspace }, messageId)
  if (result === undefined) return usageError(output, unrecognized(name))
  return report(name, result, { messageId, tenant: encodeTenantText(tenant) }, output)
}

/** Resumed, the query comes first: only an operation that was not committed is committed now. */
async function register(ready: Ready): Promise<ExitCode> {
  const { name, words, values, login, messageId, output } = ready
  const { tenant, link } = login
  const resumed = values.get('--resume')
  const operation = resumed ?? ready.newId()
  const type = values.get('--type')
  const body = {
    tenant,
    operation,
    address: addressOf(words[0] ?? ''),
    ...(type === undefined ? {} : { type }),
  }
  const request = { messageId, tenant: encodeTenantText(tenant), operation }
  if (resumed !== undefined) {
    const known = await link.call(workspaceProtocol, 'query-register', body, messageId)
    if (known === undefined) return usageError(output, unrecognized(name))
    const open = known.kind === 'response' && known.outcome === 'not-committed'
    if (!open) return report(name, known, request, output)
  }
  const result = await link.call(workspaceProtocol, 'register', body, messageId)
  if (result === undefined) return usageError(output, unrecognized(name))
  if (exitCodeOf(result) === 5)
    output.stderr(`omne ${name}: to learn the result, run it again with --resume ${operation}\n`)
  return report(name, result, request, output)
}

async function runWorkspace(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const parsed = parse(args)
  if (typeof parsed === 'string') return usageError(output, parsed)
  const { action, words, values } = parsed
  const login = loadLogin(values, output, environment)
  if (login.kind === 'exit') return login.code
  const { newId } = environment.services
  const ready = {
    name: `workspace ${action}`,
    words,
    values,
    login,
    messageId: newId(),
    output,
    newId,
  }
  if (action === 'register') return register(ready)
  return action === 'list' ? read(ready) : read(ready, words[0] ?? '')
}

export const workspaceCommand: CommandSpec = {
  name: 'workspace',
  usage: 'register <directory> [--type <type>] [--resume <operation>] | list | show <workspace>',
  summary:
    'Register a directory of the server as a workspace without touching what is in it, list your workspaces, or show one with its instances.',
  run: runWorkspace,
}
