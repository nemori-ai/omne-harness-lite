import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assetsProtocol, type AssetsProtocol } from '@omne-harness/assets-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { BodyOf } from '@omne-harness/sdk/core'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  localFailure,
  missingOption,
  serverOption,
  unrecognized,
  usageError,
} from './command-support.ts'
import { treeOf, type JsonTree } from './json-tree.ts'
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { exitCodeOf, report } from './report.ts'
import { splitArguments } from './split-arguments.ts'

const JSON_SWITCH = '--json'
const YES_SWITCH = '--yes'
const DATA_OPTION = '--data'
const DIR_OPTION = '--dir'
const RESUME_OPTION = '--resume'
const PAGE_LIMIT = 100
const MAX_PAGES = 10_000

type Action = 'categories' | 'list' | 'show' | 'create' | 'enable' | 'disable' | 'remove' | 'watch'
type Rule = Readonly<{ words: number; accepted: readonly string[]; switches: readonly string[] }>

const READ: Rule = { words: 1, accepted: [serverOption], switches: [JSON_SWITCH] }
const CHANGE: Rule = { words: 1, accepted: [serverOption, RESUME_OPTION], switches: [JSON_SWITCH] }
const RULES: Readonly<Record<Action, Rule>> = {
  categories: { ...READ, words: 0 },
  list: READ,
  show: READ,
  create: { ...CHANGE, accepted: [...CHANGE.accepted, DATA_OPTION, DIR_OPTION] },
  enable: CHANGE,
  disable: CHANGE,
  remove: { ...CHANGE, switches: [JSON_SWITCH, YES_SWITCH] },
  watch: { words: 0, accepted: [serverOption], switches: [] },
}
const VALUE_OPTIONS = [serverOption, DATA_OPTION, DIR_OPTION, RESUME_OPTION]

const isAction = (value: string | undefined): value is Action =>
  value !== undefined && Object.hasOwn(RULES, value)

type Operations = AssetsProtocol['operations']
type Capability = Readonly<{ category: string; name: string }>
type Invocation = Readonly<{
  action: Action
  name: string
  values: ReadonlyMap<string, string>
  word: string | undefined
}>
type Context = Readonly<{
  invocation: Invocation
  link: Link
  tenant: TenantId
  output: CliOutput
  environment: CommandEnvironment
  sent: { messageId: string }
}>
type Outcome = CallResult | undefined | Readonly<{ kind: 'broken'; reason: string }>

function capabilityOf(text: string | undefined): Capability | undefined {
  if (text === undefined) return undefined
  const colon = text.indexOf(':')
  const category = text.slice(0, colon)
  const name = text.slice(colon + 1)
  return colon < 1 || name === '' || name.includes(':') ? undefined : { category, name }
}

function readInvocation(action: Action, rest: readonly string[]): Invocation | string {
  const name = `asset ${action}`
  const { words, options } = splitArguments(rest, VALUE_OPTIONS)
  const { words: expected, accepted, switches } = RULES[action]
  const read = readOptions(options, { accepted, switches, required: [] })
  if (read.kind === 'unrecognized' || words.length > expected) return unrecognized(name)
  if (read.kind === 'missing') return missingOption(name, read.option)
  if (words.length < expected)
    return missingOption(name, action === 'list' ? '<category>' : '<category>:<name>')
  return { action, name, values: read.values, word: words[0] }
}

/** A call with a fresh message number; the report echoes the last one sent. */
function call<K extends keyof Operations & string>(
  context: Context,
  operation: K,
  body: BodyOf<Operations[K]>,
): Promise<CallResult | undefined> {
  const messageId = context.environment.services.newId()
  context.sent.messageId = messageId
  return context.link.call(assetsProtocol, operation, body, messageId)
}

function answer(context: Context, result: Outcome, operation?: string): ExitCode {
  const { invocation, output, tenant, sent } = context
  if (result === undefined) return usageError(output, unrecognized(invocation.name))
  if (result.kind === 'broken')
    return localFailure(output, `omne ${invocation.name}: ${result.reason}\n`)
  const echo = {
    messageId: sent.messageId,
    tenant: encodeTenantText(tenant),
    ...(operation === undefined ? {} : { operation }),
  }
  const code = report(invocation.name, result, echo, output)
  if (code === 5 && operation !== undefined)
    output.stderr(
      `omne ${invocation.name}: to learn the outcome, run the same command with ${RESUME_OPTION} ${operation}\n`,
    )
  return code
}

/** A recall that found the original outcome; not committed or not there means send it now. */
const recalledOutcome = (result: CallResult | undefined): result is CallResult =>
  result !== undefined &&
  !(result.kind === 'response' && ['not-committed', 'not-found'].includes(result.outcome))

async function listAll(context: Context, category: string | undefined): Promise<Outcome> {
  const items: unknown[] = []
  let after: string | null = null
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { tenant } = context
    const result =
      category === undefined
        ? await call(context, 'list-categories', { after, limit: PAGE_LIMIT })
        : await call(context, 'list-assets', { tenant, category, after, limit: PAGE_LIMIT })
    if (result?.kind !== 'response' || result.outcome !== 'succeeded') return result
    const read = result.body as { items: readonly unknown[]; next: string | null }
    items.push(...read.items)
    if (read.next === null)
      return { ...result, body: { ...(result.body as object), items, next: null } }
    if (read.next === after) return { kind: 'broken', reason: 'a page did not advance the cursor' }
    after = read.next
  }
  return { kind: 'broken', reason: `more than ${MAX_PAGES} pages` }
}

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

type Row = Readonly<{
  name: string
  version: string
  enabled: boolean
  origin: string
  summary: Readonly<{ title: string; description: string }> | null
}>
type Described = Readonly<{
  item: Row
  content: Readonly<{ kind: string; entries?: readonly { path: string; bytes: number }[] }>
  standing: Readonly<{ kind: string; reason?: string }>
  settings: boolean
}>

const RENDER = {
  categories: (body: unknown) =>
    table([
      ['CATEGORY', 'CREATION', 'TITLE'],
      ...(body as { items: { category: string; creation: string; title: string }[] }).items.map(
        item => [item.category, item.creation, item.title],
      ),
    ]),
  list: (body: unknown) =>
    table([
      ['NAME', 'ENABLED', 'ORIGIN', 'VERSION', 'TITLE'],
      ...(body as { items: Row[] }).items.map(row => [
        row.name,
        row.enabled ? 'yes' : 'no',
        row.origin,
        row.version.slice(0, 19),
        row.summary?.title ?? '',
      ]),
    ]),
  show: (body: unknown) => {
    const { item, content, standing, settings } = body as Described
    const files = (content.entries ?? []).map(entry => `  ${entry.path}  ${entry.bytes}`)
    const lines = [
      `Name: ${item.name}`,
      `Version: ${item.version}`,
      `Origin: ${item.origin}`,
      `Enabled: ${item.enabled ? 'yes' : 'no'}`,
      `In use: ${standing.kind === 'selected' ? 'yes' : `no (${standing.reason ?? standing.kind})`}`,
      `Settings: ${settings ? 'yes, see omne setting list' : 'none'}`,
      ...(item.summary === null
        ? []
        : [`Title: ${item.summary.title}`, `About: ${item.summary.description}`]),
      ...(content.kind === 'directory' ? ['Files:', ...files] : ['Content: data, add --json']),
    ]
    return `${lines.join('\n')}\n`
  },
}

function shown(context: Context, result: Outcome, render: (body: unknown) => string): ExitCode {
  const readable = result?.kind === 'response' && result.outcome === 'succeeded'
  if (context.invocation.values.has(JSON_SWITCH) || !readable) return answer(context, result)
  try {
    context.output.stdout(render(result.body))
  } catch {
    context.output.stderr(`omne ${context.invocation.name}: cannot write standard output\n`)
    return 1
  }
  return exitCodeOf(result)
}

/** The holding of a change: read from the asset, or from the operation when it is resumed. */
async function holdingOf(context: Context, capability: Capability): Promise<string | ExitCode> {
  const resumed = context.invocation.values.get(RESUME_OPTION)
  const slash = resumed?.indexOf('/') ?? -1
  if (resumed !== undefined && slash > 0) return resumed.slice(slash + 1)
  const described = await call(context, 'describe-asset', { tenant: context.tenant, ...capability })
  if (described?.kind !== 'response' || described.outcome !== 'succeeded')
    return answer(context, described)
  return (described.body as Described & { item: { holding: string } }).item.holding
}

/** A change carries its holding in its operation, so a recall still knows it once the asset is gone. */
async function runHoldingChange(context: Context, capability: Capability): Promise<ExitCode> {
  const { invocation, tenant, output } = context
  if (invocation.action === 'remove' && !invocation.values.has(YES_SWITCH))
    return usageError(
      output,
      `omne asset remove: removing ${capability.category}:${capability.name} cannot be undone, and its settings fall away; add ${YES_SWITCH} to remove it\n`,
    )
  const holding = await holdingOf(context, capability)
  if (typeof holding !== 'string') return holding
  const resumed = invocation.values.get(RESUME_OPTION)
  const operation = resumed ?? `${context.environment.services.newId()}/${holding}`
  const enabled = invocation.action === 'enable'
  const request =
    invocation.action === 'remove'
      ? ({ kind: 'remove-asset', holding } as const)
      : ({ kind: 'set-asset-enabled', holding, enabled } as const)
  if (resumed !== undefined) {
    const recalled = await call(context, 'query-asset-operation', { tenant, operation, request })
    if (recalledOutcome(recalled)) return answer(context, recalled, operation)
  }
  const result =
    request.kind === 'remove-asset'
      ? await call(context, 'remove-asset', { tenant, operation, holding })
      : await call(context, 'set-asset-enabled', { tenant, operation, holding, enabled })
  return answer(context, result, operation)
}

async function dataOf(given: string): Promise<JsonTree | string> {
  let text = given
  if (given.startsWith('@')) {
    try {
      text = await readFile(given.slice(1), 'utf8')
    } catch {
      return `cannot read ${given.slice(1)}`
    }
  }
  try {
    return treeOf(JSON.parse(text))
  } catch {
    return `${DATA_OPTION} takes a JSON value or @<file>`
  }
}

async function runCreateData(context: Context, capability: Capability, given: string) {
  const { invocation, tenant, output } = context
  const body = await dataOf(given)
  if (typeof body === 'string') return usageError(output, `omne ${invocation.name}: ${body}\n`)
  const resumed = invocation.values.get(RESUME_OPTION)
  const operation = resumed ?? context.environment.services.newId()
  if (resumed !== undefined) {
    const request = { kind: 'create-asset', ...capability, body } as const
    const recalled = await call(context, 'query-asset-operation', { tenant, operation, request })
    if (recalledOutcome(recalled)) return answer(context, recalled, operation)
  }
  const result = await call(context, 'create-asset', { tenant, operation, ...capability, body })
  return answer(context, result, operation)
}

type LocalFile = Readonly<{ path: string; file: string; bytes: number }>

/** Every regular file under the directory with its path in the package; anything else stops it all. */
async function filesOf(root: string, prefix = ''): Promise<LocalFile[] | string> {
  const found: LocalFile[] = []
  const entries = await readdir(join(root, prefix), { withFileTypes: true })
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    const file = join(root, path)
    if (entry.isSymbolicLink()) return `${path} is a symbolic link`
    if (entry.isDirectory()) {
      const inner = await filesOf(root, path)
      if (typeof inner === 'string') return inner
      found.push(...inner)
    } else if (entry.isFile()) found.push({ path, file, bytes: (await lstat(file)).size })
    else return `${path} is not a regular file`
  }
  return found
}

async function send(
  context: Context,
  upload: string,
  file: LocalFile,
  from: number,
  partBytes: number,
): Promise<Outcome | 'sent'> {
  const bytes = new Uint8Array(await readFile(file.file))
  let offset = from
  while (offset < bytes.length) {
    const part = bytes.subarray(offset, offset + partBytes)
    const { tenant } = context
    const result = await call(context, 'append-asset-upload', {
      tenant,
      upload,
      path: file.path,
      offset,
      bytes: part,
    })
    if (result?.kind !== 'response' || result.outcome !== 'succeeded') return result
    const received = (result.body as { received: number }).received
    if (received <= offset) return { kind: 'broken', reason: `${file.path} did not advance` }
    offset = received
  }
  return 'sent'
}

async function uploadAll(
  context: Context,
  operation: string,
  capability: Capability,
  files: readonly LocalFile[],
) {
  const { tenant } = context
  const manifest = files.map(({ path, bytes }) => ({ path, bytes }))
  const begun = await call(context, 'begin-asset-upload', {
    tenant,
    operation,
    ...capability,
    manifest,
  })
  if (begun?.kind !== 'response' || begun.outcome !== 'succeeded') return begun
  const { partBytes, received } = begun.body as {
    partBytes: number
    received: readonly { path: string; bytes: number }[]
  }
  for (const file of files) {
    const from = received.find(entry => entry.path === file.path)?.bytes ?? 0
    const stopped = await send(context, operation, file, from, partBytes)
    if (stopped !== 'sent') return stopped
  }
  return call(context, 'commit-asset-upload', { tenant, upload: operation })
}

async function runCreateDirectory(context: Context, capability: Capability, directory: string) {
  const { invocation, tenant, output } = context
  let files: LocalFile[] | string
  try {
    files = await filesOf(directory)
  } catch {
    files = `cannot read ${directory}`
  }
  if (typeof files === 'string')
    return localFailure(output, `omne ${invocation.name}: ${files}; nothing was sent\n`)
  const resumed = invocation.values.get(RESUME_OPTION)
  const operation = resumed ?? context.environment.services.newId()
  if (resumed !== undefined) {
    const request = { kind: 'commit-asset-upload' } as const
    const recalled = await call(context, 'query-asset-operation', { tenant, operation, request })
    if (recalledOutcome(recalled)) return answer(context, recalled, operation)
  }
  return answer(context, await uploadAll(context, operation, capability, files), operation)
}

async function runWatch(context: Context): Promise<ExitCode> {
  const { link, tenant, environment, output } = context
  const frames = link.observe(
    assetsProtocol,
    'observe-assets',
    { tenant },
    environment.services.newId(),
  )
  for (;;) {
    const next = await frames.next()
    if (next.done !== true) {
      output.stdout('changed\n')
      continue
    }
    const end = next.value
    output.stderr(`omne asset watch: ended (${end.reason ?? end.outcome ?? end.kind})\n`)
    if (end.kind === 'refused') return end.outcome === 'basis-unavailable' ? 4 : 3
    return end.kind === 'ended' && end.reason === 'denied' ? 3 : 4
  }
}

async function runCreate(context: Context, capability: Capability): Promise<ExitCode> {
  const data = context.invocation.values.get(DATA_OPTION)
  const directory = context.invocation.values.get(DIR_OPTION)
  if (data !== undefined && directory === undefined) return runCreateData(context, capability, data)
  if (directory !== undefined && data === undefined)
    return runCreateDirectory(context, capability, directory)
  return usageError(
    context.output,
    `omne asset create: give exactly one of ${DATA_OPTION} or ${DIR_OPTION}\n`,
  )
}

async function runAction(context: Context): Promise<ExitCode> {
  const { invocation, output } = context
  switch (invocation.action) {
    case 'categories':
      return shown(context, await listAll(context, undefined), RENDER.categories)
    case 'list':
      return shown(context, await listAll(context, invocation.word), RENDER.list)
    case 'watch':
      return runWatch(context)
    default: {
      const capability = capabilityOf(invocation.word)
      if (capability === undefined) return usageError(output, unrecognized(invocation.name))
      if (invocation.action === 'show') {
        const read = await call(context, 'describe-asset', {
          tenant: context.tenant,
          ...capability,
        })
        return shown(context, read, RENDER.show)
      }
      if (invocation.action === 'create') return runCreate(context, capability)
      return runHoldingChange(context, capability)
    }
  }
}

async function runAsset(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const [action, ...rest] = args
  if (!isAction(action)) return usageError(output, unrecognized('asset'))
  const invocation = readInvocation(action, rest)
  if (typeof invocation === 'string') return usageError(output, invocation)
  const loaded = loadLogin(invocation.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const { link, tenant } = loaded
  return runAction({ invocation, link, tenant, output, environment, sent: { messageId: '' } })
}

export const assetCommand: CommandSpec = {
  name: 'asset',
  usage: 'categories|list|show|create|enable|disable|remove|watch',
  summary:
    'Manage the assets of the acting tenant: list the categories, list one category, show one (<category>:<name>), create one from --data <JSON|@file> or --dir <directory>, enable, disable or remove one (remove needs --yes), and watch for changes; --resume <operation> recalls an uncertain outcome.',
  run: runAsset,
}
