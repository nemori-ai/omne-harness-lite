import { encodeTenantText, type TenantId, rejectionText } from '@omne-harness/public-contract'
import { sessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'
import type { CliOutput, CommandEnvironment, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  missingOption,
  resolveOwner,
  serverOption,
  tenantOption,
  unrecognized,
  usageError,
  type Option,
} from './command-support.ts'
import {
  renderDiagnostics,
  type SessionDiagnosticGap,
  type SessionRunDiagnostic,
} from './diagnostics-render.ts'
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { exitCodeOf } from './report.ts'

const name = 'read-session-diagnostics'
const defaultPageBytes = '65536'
const maxPages = 10_000

interface Collected {
  readonly runs: readonly SessionRunDiagnostic[]
  readonly gaps: readonly SessionDiagnosticGap[]
}

type Page = Collected & { readonly next: string | null; readonly exhausted: boolean }

function pageOf(body: unknown): Page | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const { runs, gaps, next, exhausted } = body as Record<string, unknown>
  if (!Array.isArray(runs) || !Array.isArray(gaps) || typeof exhausted !== 'boolean')
    return undefined
  if (next !== null && typeof next !== 'string') return undefined
  return {
    runs: runs as SessionRunDiagnostic[],
    gaps: gaps as SessionDiagnosticGap[],
    next,
    exhausted,
  }
}

type Reading =
  | ({ readonly kind: 'complete' } & Collected)
  | ({ readonly kind: 'stopped'; readonly result: CallResult; readonly page: number } & Collected)
  | ({ readonly kind: 'broken'; readonly reason: string } & Collected)
  | { readonly kind: 'refused' }

interface DiagnosticsRequest {
  readonly tenant: TenantId
  readonly session: string
  readonly run: string | null
  readonly pageBytes: string
  readonly newId: () => string
}

async function readAll(
  link: Link,
  request: DiagnosticsRequest,
  firstMessageId: string,
): Promise<Reading> {
  const runs: SessionRunDiagnostic[] = []
  const gaps: SessionDiagnosticGap[] = []
  let cursor: string | null = null
  for (let page = 1; ; page += 1) {
    if (page > maxPages)
      return { kind: 'broken', runs, gaps, reason: `more than ${maxPages} pages` }
    const messageId = page === 1 ? firstMessageId : request.newId()
    const { tenant, session } = request
    const result = await link.call(
      sessionDiagnosticsProtocol,
      name,
      cursor === null
        ? { tenant, session, cursor, run: request.run, pageBytes: request.pageBytes }
        : { tenant, session, cursor },
      messageId,
    )
    if (result.kind === 'rejected') return { kind: 'refused' }
    if (result.kind !== 'response' || result.outcome !== 'succeeded')
      return { kind: 'stopped', runs, gaps, result, page }
    const read = pageOf(result.body)
    if (read === undefined)
      return { kind: 'broken', runs, gaps, reason: `page ${page} is not a diagnostics page` }
    runs.push(...read.runs)
    gaps.push(...read.gaps)
    if (read.exhausted) return { kind: 'complete', runs, gaps }
    if (read.next === null)
      return {
        kind: 'broken',
        runs,
        gaps,
        reason: `page ${page} has no cursor but is not the last`,
      }
    if (read.next === cursor)
      return { kind: 'broken', runs, gaps, reason: `page ${page} did not advance the cursor` }
    cursor = read.next
  }
}

function incompleteReason(reading: Exclude<Reading, { kind: 'complete' | 'refused' }>): string {
  if (reading.kind === 'broken') return reading.reason
  const { result, page } = reading
  if (result.kind === 'uncertain') return `page ${page} had no trusted answer`
  if (result.kind === 'unavailable') return `page ${page} was not sent: the service is unavailable`
  if (result.kind === 'rejected')
    return `page ${page} was not sent: ${rejectionText(result.rejection)}`
  return `page ${page} was answered ${result.outcome}`
}

function resultObject(
  reading: Exclude<Reading, { kind: 'refused' }>,
  request: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const body = { runs: reading.runs, gaps: reading.gaps, complete: reading.kind === 'complete' }
  if (reading.kind === 'stopped' && reading.result.kind !== 'response')
    return { result: reading.result.kind, body, request }
  const outcome =
    reading.kind === 'stopped' && reading.result.kind === 'response'
      ? reading.result.outcome
      : 'succeeded'
  return { result: 'response', outcome, body, request }
}

type Arguments =
  | {
      readonly kind: 'arguments'
      readonly values: Option
      readonly tenant: TenantId | undefined
      readonly session: string
      readonly run: string | null
      readonly pageBytes: string
    }
  | { readonly kind: 'usage'; readonly message: string }

function readArguments(args: readonly string[]): Arguments {
  const read = readOptions(args, {
    accepted: ['--session', '--run', '--tenant', '--page-bytes', serverOption],
    required: ['--session'],
    switches: ['--json'],
  })
  if (read.kind === 'unrecognized') return { kind: 'usage', message: unrecognized(name) }
  if (read.kind === 'missing') return { kind: 'usage', message: missingOption(name, read.option) }
  const tenant = tenantOption(read.values)
  const pageBytes = read.values.get('--page-bytes') ?? defaultPageBytes
  if (tenant === null || !/^[1-9][0-9]*$/.test(pageBytes))
    return { kind: 'usage', message: unrecognized(name) }
  return {
    kind: 'arguments',
    values: read.values,
    tenant,
    session: read.values.get('--session') ?? '',
    run: read.values.get('--run') ?? null,
    pageBytes,
  }
}

export async function runReadSessionDiagnostics(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const read = readArguments(args)
  if (read.kind === 'usage') return usageError(output, read.message)
  const { session, run, pageBytes } = read

  const loaded = loadLogin(read.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const resolved = resolveOwner(name, session, read.tenant, loaded.directory, output)
  if (resolved.kind === 'exit') return resolved.code
  const { owner } = resolved

  const { newId } = environment.services
  const messageId = newId()
  const reading = await readAll(
    loaded.link,
    { tenant: owner, session, run, pageBytes, newId },
    messageId,
  )
  if (reading.kind === 'refused') return usageError(output, unrecognized(name))

  const { runs, gaps } = reading
  try {
    output.stdout(
      read.values.has('--json')
        ? `${JSON.stringify(resultObject(reading, { messageId, tenant: encodeTenantText(owner) }))}\n`
        : renderDiagnostics(runs, gaps),
    )
  } catch {
    output.stderr(`omne ${name}: cannot write standard output\n`)
    return 1
  }
  if (reading.kind === 'complete') return 0
  output.stderr(
    `omne ${name}: incomplete after ${runs.length} runs: ${incompleteReason(reading)}\n`,
  )
  if (reading.kind === 'broken') return 1
  const code = exitCodeOf(reading.result)
  if (code === 5) output.stderr(`omne ${name}: result uncertain\n`)
  return code
}
