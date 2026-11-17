import { assetsProtocol } from '@omne-harness/assets-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  localFailure,
  missingOption,
  serverOption,
  text,
  unrecognized,
  usageError,
} from './command-support.ts'
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { exitCodeOf, report, type RequestEcho } from './report.ts'

const JSON_SWITCH = '--json'
const VALUE_OPTION = '--value'
const PAGE_LIMIT = 100
const MAX_PAGES = 10_000

type Action = 'list' | 'set' | 'show' | 'unset'

type AssetSelector = { readonly category?: string; readonly name: string }

function isAction(value: string | undefined): value is Action {
  return value === 'list' || value === 'set' || value === 'show' || value === 'unset'
}

const WORDS: Readonly<Record<Action, readonly string[]>> = {
  list: ['<asset>'],
  set: ['<asset>', '<item>'],
  show: ['<asset>', '<item>'],
  unset: ['<asset>', '<item>'],
}

const VALUE_OPTIONS: readonly string[] = [serverOption, VALUE_OPTION]

const OPTION_RULES: Readonly<
  Record<Action, Readonly<{ accepted: readonly string[]; switches?: readonly string[] }>>
> = {
  list: { accepted: [serverOption] },
  set: { accepted: [serverOption, VALUE_OPTION] },
  show: { accepted: [serverOption], switches: [JSON_SWITCH] },
  unset: { accepted: [serverOption] },
}

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

const SECRET_STATES: Readonly<Record<string, string>> = {
  unset: 'not set',
  available: 'set',
  revoked: 'set, but revoked',
  unreadable: 'set, but it cannot be read',
}

function secretText(state: string): string {
  return SECRET_STATES[state] ?? 'set, but it cannot be read'
}

function summary(result: CallResult): string {
  if (result.kind === 'uncertain') return 'Result: uncertain\n'
  if (result.kind === 'unavailable') return 'Result: unavailable\n'
  if (result.outcome !== 'succeeded') return `Result: ${result.outcome}\n`
  const item = (result.body as { item?: unknown }).item
  if (text(item, 'kind') !== 'secret')
    return `Not a secret setting (${text(item, 'kind')}). Add --json to read it.\n`
  return `Your key: ${secretText(text(item, 'own'))}\nDeployment default: ${secretText(text(item, 'official'))}\n`
}

function writeSummary(name: string, result: CallResult, output: CliOutput): ExitCode {
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

function assetOf(text: string): AssetSelector | undefined {
  const colon = text.indexOf(':')
  if (colon === -1) return text === '' ? undefined : { name: text }
  const category = text.slice(0, colon)
  const name = text.slice(colon + 1)
  return category === '' || name === '' ? undefined : { category, name }
}

type Targeted = Readonly<{
  values: ReadonlyMap<string, string>
  asset: AssetSelector
  item: string
}>

type Invocation =
  | Readonly<{ action: 'list'; values: ReadonlyMap<string, string>; asset?: AssetSelector }>
  | (Targeted & Readonly<{ action: Exclude<Action, 'list'> }>)

function readInvocation(
  action: Action,
  rest: readonly string[],
  name: string,
): Invocation | string {
  const { words, options } = split(rest)
  const read = readOptions(options, { ...OPTION_RULES[action], required: [] })
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

async function readSecret(
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<string | ExitCode> {
  const secret = await environment.services.readCredential(output.stderr)
  if (secret.kind === 'failure') return localFailure(output, secret.message)
  if (secret.value === '') return usageError(output, 'omne: empty secret\n')
  return secret.value
}

type Listing =
  | { readonly kind: 'complete'; readonly items: readonly unknown[]; readonly completeness: string }
  | { readonly kind: 'stopped'; readonly result: CallResult }
  | { readonly kind: 'broken'; readonly reason: string }
  | { readonly kind: 'refused' }

function pageOf(body: unknown): {
  items: readonly unknown[]
  next: string | null
  partial: boolean
} {
  const { items, next, completeness } = body as {
    items: readonly unknown[]
    next: string | null
    completeness: string
  }
  return { items, next, partial: completeness === 'partial' }
}

async function listAll(
  link: Link,
  tenant: TenantId,
  asset: AssetSelector | undefined,
  firstMessageId: string,
  newId: () => string,
): Promise<Listing> {
  const items: unknown[] = []
  let partial = false
  let after: string | null = null
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await link.call(
      assetsProtocol,
      'list-settings',
      { tenant, ...(asset === undefined ? {} : { asset }), after, limit: PAGE_LIMIT },
      page === 1 ? firstMessageId : newId(),
    )
    if (result === undefined) return { kind: 'refused' }
    if (result.kind !== 'response' || result.outcome !== 'succeeded')
      return { kind: 'stopped', result }
    const read = pageOf(result.body)
    items.push(...read.items)
    partial ||= read.partial
    if (read.next === null)
      return { kind: 'complete', items, completeness: partial ? 'partial' : 'complete' }
    if (read.next === after) return { kind: 'broken', reason: 'a page did not advance the cursor' }
    after = read.next
  }
  return { kind: 'broken', reason: `more than ${MAX_PAGES} pages` }
}

async function runList(
  name: string,
  link: Link,
  tenant: TenantId,
  asset: AssetSelector | undefined,
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const { newId } = environment.services
  const messageId = newId()
  const echo: RequestEcho = { messageId, tenant: encodeTenantText(tenant) }
  const listing = await listAll(link, tenant, asset, messageId, newId)
  if (listing.kind === 'refused') return usageError(output, unrecognized(name))
  if (listing.kind === 'broken') return localFailure(output, `omne ${name}: ${listing.reason}\n`)
  if (listing.kind === 'stopped') return report(name, listing.result, echo, output)
  const body = { items: listing.items, completeness: listing.completeness }
  return report(name, { kind: 'response', outcome: 'succeeded', body }, echo, output)
}

/** The protocol carries a JSON value as a tagged tree; the command line gives it as JSON text. */
type JsonTree =
  | { readonly kind: 'null' }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly lexeme: string }
  | { readonly kind: 'array'; readonly items: readonly JsonTree[] }
  | {
      readonly kind: 'object'
      readonly entries: readonly { readonly key: string; readonly value: JsonTree }[]
    }

function treeOf(value: unknown): JsonTree {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: JSON.stringify(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(treeOf) }
  return {
    kind: 'object',
    entries: Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({
      key,
      value: treeOf(entry),
    })),
  }
}

type WriteValue =
  | Readonly<{ kind: 'ordinary'; value: JsonTree }>
  | Readonly<{ kind: 'secret'; secret: string }>
  | null

function ordinaryValueOf(name: string, values: ReadonlyMap<string, string>) {
  const given = values.get(VALUE_OPTION)
  if (given === undefined) return undefined
  try {
    return { value: treeOf(JSON.parse(given)) }
  } catch {
    return `omne ${name}: --value takes a JSON value\n`
  }
}

async function runWrite(
  name: string,
  action: 'set' | 'unset',
  invocation: Targeted,
  link: Link,
  tenant: TenantId,
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const { newId } = environment.services
  const { asset, item } = invocation
  const readId = newId()
  const ordinary = action === 'set' ? ordinaryValueOf(name, invocation.values) : undefined
  if (typeof ordinary === 'string') return usageError(output, ordinary)
  let value: WriteValue = null
  if (ordinary !== undefined) value = { kind: 'ordinary', value: ordinary.value }
  else if (action === 'set') {
    const read = await readSecret(output, environment)
    if (typeof read !== 'string') return read
    value = { kind: 'secret', secret: read }
  }
  const tenantEcho = encodeTenantText(tenant)
  const described = await link.call(
    assetsProtocol,
    'describe-setting',
    { tenant, asset, item },
    readId,
  )
  if (described === undefined) return usageError(output, unrecognized(name))
  if (described.kind !== 'response' || described.outcome !== 'succeeded')
    return report(name, described, { messageId: readId, tenant: tenantEcho }, output)
  const describedItem = (described.body as { item?: unknown }).item
  if (value?.kind === 'ordinary' && text(describedItem, 'kind') === 'secret')
    return usageError(output, `omne ${name}: a secret is read from the prompt, not from --value\n`)

  const messageId = newId()
  const target = {
    tenant,
    asset,
    item,
    operation: newId(),
    expectedRevision: text(describedItem, 'revision'),
  }
  const result =
    value === null
      ? await link.call(assetsProtocol, 'clear-setting', target, messageId)
      : await link.call(assetsProtocol, 'set-setting', { ...target, value }, messageId)
  if (result === undefined) return usageError(output, unrecognized(name))
  // The echo holds the request number and the tenant only: never the body, so never the secret.
  return report(name, result, { messageId, tenant: tenantEcho }, output)
}

async function runShow(
  name: string,
  invocation: Targeted,
  link: Link,
  tenant: TenantId,
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const messageId = environment.services.newId()
  const { asset, item } = invocation
  const result = await link.call(
    assetsProtocol,
    'describe-setting',
    { tenant, asset, item },
    messageId,
  )
  if (result === undefined) return usageError(output, unrecognized(name))
  if (!invocation.values.has(JSON_SWITCH)) return writeSummary(name, result, output)
  return report(name, result, { messageId, tenant: encodeTenantText(tenant) }, output)
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

  const loaded = loadLogin(invocation.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const { link, tenant } = loaded
  switch (invocation.action) {
    case 'list':
      return runList(name, link, tenant, invocation.asset, output, environment)
    case 'show':
      return runShow(name, invocation, link, tenant, output, environment)
    case 'set':
    case 'unset':
      return runWrite(name, invocation.action, invocation, link, tenant, output, environment)
  }
}

export const settingCommand: CommandSpec = {
  name: 'setting',
  usage: 'list|set|show|unset',
  summary:
    'List the settings of the acting tenant, or set, show or unset one; set reads a secret from the prompt, or takes --value <JSON>.',
  run: runSetting,
}
