import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { encodeTenantText, readTenantText } from '@omne-harness/public-contract'
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
  switches?: readonly string[]
}>

const ON_TENANT: Action = { words: 2, options: ['--resume'] }
const ACTIONS: Readonly<Record<string, Action>> = {
  register: { words: 1, options: ['--type', '--resume'] },
  list: { words: 0, options: [] },
  show: { words: 1, options: [] },
  grant: ON_TENANT,
  'grant-admin': ON_TENANT,
  'revoke-admin': ON_TENANT,
  remove: ON_TENANT,
  leave: { words: 1, options: ['--resume'] },
  destroy: { words: 1, options: ['--resume'], switches: ['--yes'] },
}

/** The actions that change a relation of another tenant, by the operation each one is. */
const CHANGES = {
  grant: 'grant-participation',
  'grant-admin': 'grant-admin',
  'revoke-admin': 'revoke-admin',
  remove: 'remove',
} as const
const DESTROYS =
  'this ends the registration and every relation of the workspace; its directories are not deleted. To do it, run it again with --yes'

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
    switches: spec.switches ?? [],
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

type Commit = Exclude<
  keyof typeof workspaceProtocol.operations,
  `query-${string}` | 'list' | 'describe'
>

/** Resumed, the query comes first: only an operation that was not committed is committed now. */
async function commit(ready: Ready, call: Commit, fields: object): Promise<ExitCode> {
  const { name, values, login, messageId, output } = ready
  const { tenant, link } = login
  const resumed = values.get('--resume')
  const operation = resumed ?? ready.newId()
  const body = { tenant, operation, ...fields } as never
  const request = { messageId, tenant: encodeTenantText(tenant), operation }
  if (resumed !== undefined) {
    const known = await link.call(workspaceProtocol, `query-${call}`, body, messageId)
    if (known === undefined) return usageError(output, unrecognized(name))
    const open = known.kind === 'response' && known.outcome === 'not-committed'
    if (!open) return report(name, known, request, output)
  }
  const result = await link.call(workspaceProtocol, call, body, messageId)
  if (result === undefined) return usageError(output, unrecognized(name))
  if (exitCodeOf(result) === 5)
    output.stderr(`omne ${name}: to learn the result, run it again with --resume ${operation}\n`)
  return report(name, result, request, output)
}

const registers = ({ words, values }: Ready) => {
  const type = values.get('--type')
  return { address: addressOf(words[0] ?? ''), ...(type === undefined ? {} : { type }) }
}

/** A tenant that does not read as one is a usage error: nothing is sent. */
function onTenant(ready: Ready, call: Commit): Promise<ExitCode> | ExitCode {
  const target = readTenantText(ready.words[1] ?? '')
  if (target === undefined) return usageError(ready.output, unrecognized(ready.name))
  return commit(ready, call, { workspace: ready.words[0], target })
}

function destroy(ready: Ready): Promise<ExitCode> | ExitCode {
  if (!ready.values.has('--yes'))
    return usageError(ready.output, `omne ${ready.name}: ${DESTROYS}\n`)
  return commit(ready, 'destroy', { workspace: ready.words[0] })
}

const ACT: Readonly<Record<string, (ready: Ready) => Promise<ExitCode> | ExitCode>> = {
  register: ready => commit(ready, 'register', registers(ready)),
  list: ready => read(ready),
  ...Object.fromEntries(
    Object.entries(CHANGES).map(([action, call]) => [
      action,
      (ready: Ready) => onTenant(ready, call),
    ]),
  ),
  leave: ready => commit(ready, 'leave', { workspace: ready.words[0] }),
  destroy,
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
  return ACT[action]?.(ready) ?? read(ready, words[0])
}

export const workspaceCommand: CommandSpec = {
  name: 'workspace',
  usage: 'register|list|show|grant|grant-admin|revoke-admin|remove|leave|destroy',
  summary:
    'Register a directory of the server as a workspace without touching what is in it (register <directory>, --type <type>), list your workspaces or show one (show <workspace>); let another tenant take part or end that (grant, grant-admin, revoke-admin, remove <workspace> <tenant>), leave one, or destroy one with --yes: the directories stay. A commit takes --resume <operation>.',
  run: runWorkspace,
}
