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

async function runWorkspace(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const parsed = parse(args)
  if (typeof parsed === 'string') return usageError(output, parsed)
  const { action, words, values } = parsed
  const name = `workspace ${action}`
  const loaded = loadLogin(values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const { tenant, link } = loaded
  const messageId = environment.services.newId()
  const echo = { messageId, tenant: encodeTenantText(tenant) }

  if (action === 'list') {
    const result = await link.call(workspaceProtocol, 'list', { tenant }, messageId)
    return result === undefined
      ? usageError(output, unrecognized(name))
      : report(name, result, echo, output)
  }
  if (action === 'show') {
    const body = { tenant, workspace: words[0] ?? '' }
    const result = await link.call(workspaceProtocol, 'describe', body, messageId)
    return result === undefined
      ? usageError(output, unrecognized(name))
      : report(name, result, echo, output)
  }

  const resumed = values.get('--resume')
  const operation = resumed ?? environment.services.newId()
  const type = values.get('--type')
  const body = {
    tenant,
    operation,
    address: addressOf(words[0] ?? ''),
    ...(type === undefined ? {} : { type }),
  }
  const request = { ...echo, operation }
  if (resumed !== undefined) {
    const known = await link.call(workspaceProtocol, 'query-register', body, messageId)
    if (known === undefined) return usageError(output, unrecognized(name))
    const done = known.kind === 'response' && known.outcome === 'succeeded'
    const open = known.kind === 'response' && known.outcome === 'not-committed'
    if (done || !open) return report(name, known, request, output)
  }
  const result = await link.call(workspaceProtocol, 'register', body, messageId)
  if (result === undefined) return usageError(output, unrecognized(name))
  if (exitCodeOf(result) === 5)
    output.stderr(`omne ${name}: to learn the result, run it again with --resume ${operation}\n`)
  return report(name, result, request, output)
}

export const workspaceCommand: CommandSpec = {
  name: 'workspace',
  usage: 'register <directory> [--type <type>] [--resume <operation>] | list | show <workspace>',
  summary:
    'Register a directory of the server as a workspace without touching what is in it, list your workspaces, or show one with its instances.',
  run: runWorkspace,
}
