import { readFile } from 'node:fs/promises'
import {
  accessProtocol,
  encodeTenantText,
  guestContract,
  type ProtocolContract,
} from '@omne-harness/public-contract'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  missingOption,
  serverOption,
  unrecognized,
  usageError,
} from './command-support.ts'
import type { CallResult } from './link.ts'
import { readOptions } from './options.ts'
import { report } from './report.ts'
import { splitArguments } from './split-arguments.ts'

const NAME = 'call'
const BODY = '--body'
const NAMED = /^([a-z][a-z0-9-]*)\/v([1-9][0-9]*)$/u

type Told = Readonly<{ name: string; major: number; contract: unknown }>

const said = (output: CliOutput, line: string): ExitCode =>
  usageError(output, `omne call: ${line}\n`)

async function bodyOf(given: string | undefined): Promise<Readonly<{ body: unknown }> | string> {
  if (given === undefined) return { body: {} }
  let text = given
  if (given.startsWith('@')) {
    try {
      text = await readFile(given.slice(1), 'utf8')
    } catch {
      return `cannot read ${given.slice(1)}`
    }
  }
  try {
    return { body: JSON.parse(text) as unknown }
  } catch {
    return `${BODY} takes a JSON value or @<file>`
  }
}

/** Why `scoped` gave no protocols to call: the kind of result, or the outcome it answered. */
const unreadOf = (result: CallResult | undefined): string =>
  result === undefined ? 'refused' : result.kind === 'response' ? result.outcome : result.kind

async function runCall(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const { words, options } = splitArguments(args, [serverOption, BODY])
  const read = readOptions(options, { accepted: [serverOption, BODY], switches: [], required: [] })
  if (read.kind === 'unrecognized' || words.length > 2)
    return usageError(output, unrecognized(NAME))
  if (read.kind === 'missing') return usageError(output, missingOption(NAME, read.option))
  const [named = '', operation] = words
  if (operation === undefined) return usageError(output, missingOption(NAME, '<operation>'))
  const parts = NAMED.exec(named)
  if (parts === null)
    return said(output, 'the protocol is written <name>/v<major>, such as weather/v1')
  const given = await bodyOf(read.values.get(BODY))
  if (typeof given === 'string') return said(output, given)

  const loaded = loadLogin(read.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const { link, tenant } = loaded
  const scoped = await link.call(accessProtocol, 'scoped', {}, environment.services.newId())
  if (scoped?.kind !== 'response' || scoped.outcome !== 'succeeded') {
    output.stderr(
      `omne call: the protocols of the acting tenant cannot be read now (${unreadOf(scoped)})\n`,
    )
    return 4
  }
  const told = (scoped.body as { protocols: readonly Told[] }).protocols
  const wanted = told.find(each => each.name === parts[1] && String(each.major) === parts[2])
  if (wanted === undefined) {
    const has = told.map(each => `${each.name}/v${String(each.major)}`).join(', ') || 'none'
    return said(output, `the acting tenant has no protocol ${named}; it has ${has}`)
  }
  const made = guestContract(wanted.contract)
  if (!('ok' in made))
    return said(output, `the contract of ${named} cannot be read: ${made.reason}`)
  const protocol: ProtocolContract = made.ok.contract
  if (!Object.hasOwn(protocol.operations, operation)) {
    const has = Object.keys(protocol.operations).join(', ')
    return said(output, `${named} has no operation ${operation}; it has ${has}`)
  }
  const messageId = environment.services.newId()
  const result = await link.call(protocol, operation, given.body as never, messageId)
  if (result === undefined)
    return said(output, `the body does not fit the rule of ${named} ${operation}`)
  if (result.kind !== 'response' || result.outcome !== 'succeeded')
    return report(NAME, result, { messageId, tenant: encodeTenantText(tenant) }, output)
  try {
    output.stdout(`${JSON.stringify(result.body)}\n`)
  } catch {
    output.stderr('omne call: cannot write standard output\n')
    return 1
  }
  return 0
}

export const callCommand: CommandSpec = {
  name: NAME,
  usage: '<protocol>/v<major> <operation> [--body <JSON or @file>]',
  summary:
    "Call an operation of a protocol of the acting tenant (one a plugin serves), by the contract the server tells; the answer's body goes to standard output.",
  run: runCall,
}
