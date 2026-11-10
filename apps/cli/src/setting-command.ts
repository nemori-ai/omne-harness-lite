// `omne setting list|set|show|unset` (SPEC「设置命令」): the settings of the acting tenant, through
// the four governance operations `list-settings`, `set-setting`, `describe-setting` and
// `clear-setting`. The asset and the item are words on the command line; the secret of `set` comes
// from standard input or a hidden prompt, never from the command line. It goes into the request and
// nowhere else.
import { createGovernanceClient, tenantText, type GovernanceRequest } from '@omne-harness/sdk'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  attempt,
  loadLogin,
  localFailure,
  missingOption,
  serverOption,
  unrecognized,
  usageError,
} from './command-support.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'

const protocolVersion = 'governance-public/1'

type Action = 'list' | 'set' | 'show' | 'unset'

/** The asset of the public contract's setting operations; the request type checks the shape. */
type AssetSelector = { readonly category?: string; readonly name: string }

function isAction(value: string | undefined): value is Action {
  return value === 'list' || value === 'set' || value === 'show' || value === 'unset'
}

/** The words each action takes after its name: `list` takes the asset optionally. */
const WORDS: Readonly<Record<Action, readonly string[]>> = {
  list: ['<asset>'],
  set: ['<asset>', '<item>'],
  show: ['<asset>', '<item>'],
  unset: ['<asset>', '<item>'],
}

/** Options that take a value, so the word after one is its value and not a positional word. */
const VALUE_OPTIONS: readonly string[] = [serverOption]

/** Splits the words of the command from its options. Anything that starts with `-` is an option. */
function split(args: readonly string[]): { words: string[]; options: string[] } {
  const words: string[] = []
  const options: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (VALUE_OPTIONS.includes(arg)) {
      options.push(arg)
      const value = args[index + 1]
      if (value !== undefined) options.push(value)
      index += 1
    } else if (arg.startsWith('-')) options.push(arg)
    else words.push(arg)
  }
  return { words, options }
}

/** `[<category>:]<name>`: the text before the first colon is the category. Both parts are non-empty. */
function assetOf(text: string): AssetSelector | undefined {
  const colon = text.indexOf(':')
  if (colon === -1) return text === '' ? undefined : { name: text }
  const category = text.slice(0, colon)
  const name = text.slice(colon + 1)
  return category === '' || name === '' ? undefined : { category, name }
}

async function runSetting(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const [action, ...rest] = args
  if (!isAction(action)) return usageError(output, unrecognized('setting'))
  const name = `setting ${action}`
  const { words, options } = split(rest)
  const read = readOptions(options, { accepted: [serverOption], required: [] })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const expected = WORDS[action]
  if (words.length > expected.length) return usageError(output, unrecognized(name))
  const missing = action === 'list' ? undefined : expected[words.length]
  if (missing !== undefined) return usageError(output, missingOption(name, missing))
  const [assetText, item = ''] = words
  const asset = assetText === undefined ? undefined : assetOf(assetText)
  if (assetText !== undefined && asset === undefined) return usageError(output, unrecognized(name))
  if (action !== 'list' && item === '') return usageError(output, unrecognized(name))

  const loaded = loadLogin(read.values, output, environment, 'governance')
  if (loaded.kind === 'exit') return loaded.code
  const messageId = environment.services.newId()
  const head = {
    protocolVersion,
    messageId,
    proof: { kind: 'present', value: loaded.state.loginProof },
    actingTenant: loaded.tenant,
  } as const
  let request: GovernanceRequest
  if (action === 'list')
    request = {
      ...head,
      operation: 'list-settings',
      body: asset === undefined ? {} : { asset },
    }
  else if (asset === undefined) return usageError(output, unrecognized(name))
  else if (action === 'set') {
    const secret = await environment.services.readCredential(output.stderr)
    if (secret.kind === 'failure') return localFailure(output, secret.message)
    if (secret.value === '') return usageError(output, 'omne: empty secret\n')
    request = { ...head, operation: 'set-setting', body: { asset, item, secret: secret.value } }
  } else
    request = {
      ...head,
      operation: action === 'show' ? 'describe-setting' : 'clear-setting',
      body: { asset, item },
    }

  const client = createGovernanceClient({ transport: loaded.opened.transport })
  const result = await attempt(() => client.submit(request))
  if (result === undefined) return usageError(output, unrecognized(name))
  // The echo holds the request number and the tenant only: never the body, so never the secret.
  const echo: RequestEcho = { messageId, tenant: tenantText(loaded.tenant) }
  return report(name, result, echo, output)
}

export const settingCommand: CommandSpec = {
  name: 'setting',
  usage: 'list|set|show|unset',
  summary: 'List the settings of the acting tenant, or set, show or unset a secret one.',
  run: runSetting,
}
