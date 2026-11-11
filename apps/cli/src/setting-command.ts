// `omne setting list|set|show|unset` (SPEC「设置命令」): the settings of the acting tenant, through
// the four governance operations `list-settings`, `set-setting`, `describe-setting` and
// `clear-setting`. The asset and the item are words on the command line; the secret of `set` comes
// from standard input or a hidden prompt, never from the command line. It goes into the request and
// nowhere else. `show` prints the two layers of the item, the tenant's own and the deployment's, as
// two lines; `--json` prints the result object instead.
import {
  createGovernanceClient,
  tenantText,
  type CallerResult,
  type GovernanceRequest,
} from '@omne-harness/sdk'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  attempt,
  loadLogin,
  localFailure,
  missingOption,
  serverOption,
  text,
  unrecognized,
  usageError,
} from './command-support.ts'
import { readOptions } from './options.ts'
import { exitCodeOf, report, type RequestEcho } from './report.ts'

const protocolVersion = 'governance-public/1'
const JSON_SWITCH = '--json'

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

/** One layer of a secret item in words: its state and, when the custody recorded it, the time. */
function layerText(layer: unknown): string {
  const state = text(layer, 'state')
  const words =
    state === 'unbound'
      ? 'not set'
      : state === 'usable'
        ? 'set'
        : state === 'revoked'
          ? 'set, but revoked'
          : 'set, but it cannot be read'
  const at = text(layer, 'configuredAt')
  return at === '' ? words : `${words} (configured at ${at})`
}

/** The human summary of `show`: one line per layer. A non-success result names its outcome only. */
function summary(result: CallerResult): string {
  if (result.kind === 'uncertain') return 'Result: uncertain\n'
  const { outcome, body } = result.message
  if (outcome !== 'succeeded') return `Result: ${outcome}\n`
  const layers = body as { own?: unknown; official?: unknown }
  return `Your key: ${layerText(layers.own)}\nDeployment default: ${layerText(layers.official)}\n`
}

function writeSummary(name: string, result: CallerResult, output: CliOutput): ExitCode {
  const code = exitCodeOf(result)
  try {
    output.stdout(summary(result))
  } catch {
    output.stderr(`omne ${name}: cannot write standard output\n`)
    return 1
  }
  if (code === 5) output.stderr(`omne ${name}: result uncertain\n`)
  return code
}

/** `[<category>:]<name>`: the text before the first colon is the category. Both parts are non-empty. */
function assetOf(text: string): AssetSelector | undefined {
  const colon = text.indexOf(':')
  if (colon === -1) return text === '' ? undefined : { name: text }
  const category = text.slice(0, colon)
  const name = text.slice(colon + 1)
  return category === '' || name === '' ? undefined : { category, name }
}

/** What one action names: its options, and the asset and item it acts on. */
type Invocation =
  | Readonly<{ action: 'list'; values: ReadonlyMap<string, string>; asset?: AssetSelector }>
  | Readonly<{
      action: Exclude<Action, 'list'>
      values: ReadonlyMap<string, string>
      asset: AssetSelector
      item: string
    }>

/** Reads the words and options of one action, or the text of the usage error that refuses them. */
function readInvocation(
  action: Action,
  rest: readonly string[],
  name: string,
): Invocation | string {
  const { words, options } = split(rest)
  const read = readOptions(options, {
    accepted: [serverOption],
    required: [],
    ...(action === 'show' ? { switches: [JSON_SWITCH] } : {}),
  })
  if (read.kind === 'unrecognized') return unrecognized(name)
  if (read.kind === 'missing') return missingOption(name, read.option)
  const expected = WORDS[action]
  if (words.length > expected.length) return unrecognized(name)
  const missing = action === 'list' ? undefined : expected[words.length]
  if (missing !== undefined) return missingOption(name, missing)
  const [assetText, item = ''] = words
  const asset = assetText === undefined ? undefined : assetOf(assetText)
  if (assetText !== undefined && asset === undefined) return unrecognized(name)
  if (action === 'list')
    return asset === undefined
      ? { action, values: read.values }
      : { action, values: read.values, asset }
  if (asset === undefined || item === '') return unrecognized(name)
  return { action, values: read.values, asset, item }
}

/** The secret of `set`, from standard input or a hidden prompt; the exit code when there is none. */
async function readSecret(
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<string | ExitCode> {
  const secret = await environment.services.readCredential(output.stderr)
  if (secret.kind === 'failure') return localFailure(output, secret.message)
  if (secret.value === '') return usageError(output, 'omne: empty secret\n')
  return secret.value
}

async function runSetting(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const [action, ...rest] = args
  if (!isAction(action)) return usageError(output, unrecognized('setting'))
  const name = `setting ${action}`
  const invocation = readInvocation(action, rest, name)
  if (typeof invocation === 'string') return usageError(output, invocation)

  const loaded = loadLogin(invocation.values, output, environment, 'governance')
  if (loaded.kind === 'exit') return loaded.code
  const messageId = environment.services.newId()
  const head = {
    protocolVersion,
    messageId,
    proof: { kind: 'present', value: loaded.state.loginProof },
    actingTenant: loaded.tenant,
  } as const
  let request: GovernanceRequest
  if (invocation.action === 'list')
    request = {
      ...head,
      operation: 'list-settings',
      body: invocation.asset === undefined ? {} : { asset: invocation.asset },
    }
  else {
    const { asset, item } = invocation
    if (invocation.action === 'set') {
      const secret = await readSecret(output, environment)
      if (typeof secret !== 'string') return secret
      request = { ...head, operation: 'set-setting', body: { asset, item, secret } }
    } else
      request = {
        ...head,
        operation: invocation.action === 'show' ? 'describe-setting' : 'clear-setting',
        body: { asset, item },
      }
  }

  const client = createGovernanceClient({ transport: loaded.opened.transport })
  const result = await attempt(() => client.submit(request))
  if (result === undefined) return usageError(output, unrecognized(name))
  // The echo holds the request number and the tenant only: never the body, so never the secret.
  const echo: RequestEcho = { messageId, tenant: tenantText(loaded.tenant) }
  if (action === 'show' && !invocation.values.has(JSON_SWITCH))
    return writeSummary(name, result, output)
  return report(name, result, echo, output)
}

export const settingCommand: CommandSpec = {
  name: 'setting',
  usage: 'list|set|show|unset',
  summary: 'List the settings of the acting tenant, or set, show or unset a secret one.',
  run: runSetting,
}
