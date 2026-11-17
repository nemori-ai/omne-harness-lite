import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { toolProtocol } from '@omne-harness/tool-protocol'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  missingOption,
  resolveOwner,
  serverOption,
  tenantOption,
  unrecognized,
  usageError,
  type Option,
  type OwnerResolution,
} from './command-support.ts'
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { exitCodeOf, report, type RequestEcho } from './report.ts'

const JSON_SWITCH = '--json'
const MAX_PAGES = 10_000

type Action = 'list' | 'show' | 'output' | 'stop' | 'background'

const RULES: Readonly<
  Record<Action, { accepted: readonly string[]; required: readonly string[] }>
> = {
  list: { accepted: ['--session', '--tenant', serverOption], required: ['--session'] },
  show: { accepted: ['--call', '--session', '--tenant', serverOption], required: ['--call'] },
  output: {
    accepted: ['--call', '--result', '--session', '--tenant', serverOption],
    required: ['--call'],
  },
  stop: {
    accepted: ['--session', '--call', '--tenant', '--control-id', serverOption],
    required: ['--session', '--call'],
  },
  background: {
    accepted: ['--session', '--call', '--tenant', '--control-id', serverOption],
    required: ['--session', '--call'],
  },
}

function isAction(value: string | undefined): value is Action {
  return value !== undefined && Object.hasOwn(RULES, value)
}

type Invocation = Readonly<{
  name: string
  values: Option
  link: Link
  owner: TenantId
  newId: () => string
}>

type Control = Readonly<{ operation: string; intent: string; progress: string }>
type CallView = Readonly<{
  phase: string
  relation: string
  result: string | null
  terminal: Readonly<{ kind: string; detail: string | null }> | null
  effect: string
  controls: readonly Control[]
}>

// Accepted is not stopped: a stop reads "stop accepted" until Tool proves "stopped" (I-10).
export function progressText(control: Pick<Control, 'intent' | 'progress'>): string {
  switch (control.progress) {
    case 'stopped':
    case 'unknown':
      return control.progress
    default:
      return `${control.intent} ${control.progress.replaceAll('-', ' ')}`
  }
}

export function callSummary(call: CallView): string {
  const lines = [`Call: ${call.phase}, ${call.relation}`]
  if (call.terminal !== null)
    lines.push(
      `End: ${call.terminal.kind}${call.terminal.detail === null ? '' : ` (${call.terminal.detail})`}`,
    )
  if (call.result !== null) lines.push(`Result: ${call.result}`)
  lines.push(`Effect: ${call.effect}`)
  for (const control of call.controls)
    lines.push(`Control ${control.operation}: ${progressText(control)}`)
  return `${lines.join('\n')}\n`
}

function written(
  name: string,
  text: string,
  code: ExitCode,
  output: CliOutput,
  reason: string | null = null,
): ExitCode {
  try {
    output.stdout(text)
  } catch {
    output.stderr(`omne ${name}: cannot write standard output\n`)
    return 1
  }
  if (reason !== null) output.stderr(`omne ${name}: output incomplete: ${reason}\n`)
  if (code === 5) output.stderr(`omne ${name}: result uncertain\n`)
  return code
}

function echoOf(invocation: Invocation, messageId: string, extra: RequestEcho = {}): RequestEcho {
  return { messageId, ...extra, tenant: encodeTenantText(invocation.owner) }
}

async function readCall(invocation: Invocation, messageId: string) {
  const reference = invocation.values.get('--call') ?? ''
  return invocation.link.call(
    toolProtocol,
    'read-call',
    { tenant: invocation.owner, reference },
    messageId,
  )
}

async function runShow(invocation: Invocation, output: CliOutput): Promise<ExitCode> {
  const { name } = invocation
  const messageId = invocation.newId()
  const result = await readCall(invocation, messageId)
  if (result === undefined) return usageError(output, unrecognized(name))
  if (invocation.values.has(JSON_SWITCH))
    return report(name, result, echoOf(invocation, messageId), output)
  const code = exitCodeOf(result)
  if (result.kind !== 'response') return written(name, `Result: ${result.kind}\n`, code, output)
  if (result.outcome !== 'succeeded')
    return written(name, `Result: ${result.outcome}\n`, code, output)
  return written(name, callSummary((result.body as { call: CallView }).call), code, output)
}

type Block = Readonly<{ kind?: unknown; text?: unknown }>

function blockText(block: Block): string {
  return block.kind === 'text' && typeof block.text === 'string'
    ? block.text
    : `[${String(block.kind)} block]\n`
}

type Stop = Readonly<{ reason: string; code: ExitCode }>

function stopOf(what: string, result: CallResult): Stop {
  const code = exitCodeOf(result)
  if (result.kind === 'uncertain') return { reason: `${what} had no trusted answer`, code }
  if (result.kind === 'unavailable')
    return { reason: `${what} was not sent: the service is unavailable`, code }
  return { reason: `${what} was answered ${result.outcome}`, code }
}

type Version = Readonly<{ version: string }> | Stop | 'usage'

async function resultVersion(invocation: Invocation): Promise<Version> {
  const given = invocation.values.get('--result')
  if (given !== undefined) return { version: given }
  const result = await readCall(invocation, invocation.newId())
  if (result === undefined) return 'usage'
  if (result.kind !== 'response' || result.outcome !== 'succeeded')
    return stopOf('the call read', result)
  const version = (result.body as { call: CallView }).call.result
  return version === null
    ? { reason: 'the call has not ended, so it has no result yet', code: 3 }
    : { version }
}

type Pages = Readonly<{ text: string; stop: Stop | null }> | 'usage'

async function readPages(invocation: Invocation, version: string): Promise<Pages> {
  const reference = invocation.values.get('--call') ?? ''
  let text = ''
  let cursor: string | null = null
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result: CallResult | undefined = await invocation.link.call(
      toolProtocol,
      'read-call-result',
      { tenant: invocation.owner, reference, result: version, cursor },
      invocation.newId(),
    )
    if (result === undefined) return 'usage'
    if (result.kind !== 'response' || result.outcome !== 'succeeded')
      return { text, stop: stopOf(`page ${page}`, result) }
    const body = result.body as { content: readonly Block[]; next: string | null }
    text += body.content.map(blockText).join('')
    if (body.next === null) return { text, stop: null }
    if (body.next === cursor)
      return { text, stop: { reason: `page ${page} did not advance the cursor`, code: 1 } }
    cursor = body.next
  }
  return { text, stop: { reason: `more than ${MAX_PAGES} pages`, code: 1 } }
}

// A paged read: what was read goes to standard output, and why it stopped goes to standard error.
async function runOutput(invocation: Invocation, output: CliOutput): Promise<ExitCode> {
  const { name } = invocation
  const version = await resultVersion(invocation)
  if (version === 'usage') return usageError(output, unrecognized(name))
  const read = 'version' in version ? await readPages(invocation, version.version) : null
  if (read === 'usage') return usageError(output, unrecognized(name))
  const stop = read === null ? (version as Stop) : read.stop
  return written(name, read?.text ?? '', stop?.code ?? 0, output, stop?.reason ?? null)
}

async function runSessionCall(
  action: 'list' | 'stop' | 'background',
  invocation: Invocation,
  output: CliOutput,
): Promise<ExitCode> {
  const { name, values, link, owner: tenant } = invocation
  const session = values.get('--session') ?? ''
  const messageId = invocation.newId()
  if (action === 'list') {
    const result = await link.call(
      sessionProtocol,
      'list-background-calls',
      { tenant, session },
      messageId,
    )
    if (result === undefined) return usageError(output, unrecognized(name))
    return report(name, result, echoOf(invocation, messageId), output)
  }
  const controlId = values.get('--control-id') ?? invocation.newId()
  const producer = { kind: 'tool' as const, call: values.get('--call') ?? '' }
  const body = { tenant, session, controlId, producer }
  const result =
    action === 'stop'
      ? await link.call(sessionProtocol, 'stop-call', body, messageId)
      : await link.call(sessionProtocol, 'background-call', body, messageId)
  if (result === undefined) return usageError(output, unrecognized(name))
  return report(name, result, echoOf(invocation, messageId, { controlId }), output)
}

// A session names its owner tenant; a call alone is read for the tenant given or the login's.
function ownerOf(
  name: string,
  values: Option,
  given: TenantId | undefined,
  login: Readonly<{ tenant: TenantId; directory: string }>,
  output: CliOutput,
): OwnerResolution {
  const session = values.get('--session')
  if (session === undefined) return { kind: 'owner', owner: given ?? login.tenant }
  return resolveOwner(name, session, given, login.directory, output)
}

async function runCalls(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const [action, ...rest] = args
  if (!isAction(action)) return usageError(output, unrecognized('calls'))
  const name = `calls ${action}`
  const read = readOptions(rest, {
    ...RULES[action],
    ...(action === 'show' ? { switches: [JSON_SWITCH] } : {}),
  })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const given = tenantOption(read.values)
  if (given === null) return usageError(output, unrecognized(name))
  const loaded = loadLogin(read.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const owner = ownerOf(name, read.values, given, loaded, output)
  if (owner.kind === 'exit') return owner.code
  const invocation = {
    name,
    values: read.values,
    link: loaded.link,
    owner: owner.owner,
    newId: environment.services.newId,
  }
  switch (action) {
    case 'show':
      return runShow(invocation, output)
    case 'output':
      return runOutput(invocation, output)
    default:
      return runSessionCall(action, invocation, output)
  }
}

export const callsCommand: CommandSpec = {
  name: 'calls',
  usage: 'list|show|output|stop|background',
  summary: 'List the background tool calls of a session, read one, or stop or background it.',
  run: runCalls,
}
