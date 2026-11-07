import {
  createSessionClient,
  tenantText,
  type CallerResult,
  type SessionDiagnosticGap,
  type SessionRequest,
  type SessionRunDiagnostic,
  type TenantId,
} from '@omne-harness/sdk'
import type { CliOutput, CommandEnvironment, ExitCode } from './cli-types.ts'
import {
  attempt,
  loadLogin,
  missingOption,
  proofOf,
  resolveOwner,
  serverOption,
  tenantOption,
  unrecognized,
  usageError,
  type Option,
} from './command-support.ts'
import { renderDiagnostics } from './diagnostics-render.ts'
import { readOptions } from './options.ts'
import { exitCodeOf } from './report.ts'

const name = 'read-session-diagnostics'
const defaultPageBytes = '65536'
/** No honest session has this many pages. A server that keeps answering past it is not advancing. */
const maxPages = 10_000

/** What the read collects across the pages: the Runs in page order and every gap a page reported. */
interface Collected {
  readonly runs: readonly SessionRunDiagnostic[]
  readonly gaps: readonly SessionDiagnosticGap[]
}

type Page = Collected & { readonly next: string | null; readonly exhausted: boolean }

/**
 * The SDK hands a body over only after the public contract read it as a diagnostics page, so the
 * Runs and gaps already have the contract's shape. This read takes the page controls the loop
 * needs and refuses a body that is not a page at all.
 */
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
  /** A page was answered with something other than `succeeded`, or not answered at all. */
  | ({ readonly kind: 'stopped'; readonly result: CallerResult; readonly page: number } & Collected)
  /** A page succeeded but the read cannot go on from it. */
  | ({ readonly kind: 'broken'; readonly reason: string } & Collected)
  /** The contract refused to encode a request. Nothing was sent for that page. */
  | { readonly kind: 'refused' }

interface DiagnosticsRequest {
  readonly proof: ReturnType<typeof proofOf>
  readonly tenant: TenantId
  readonly session: string
  readonly run: string | null
  readonly pageBytes: string
  readonly newId: () => string
}

/**
 * Only the first request names the Run filter and the page size. A later request carries the
 * `next` of the page before it and nothing else: the public contract refuses `run` and
 * `pageBytes` beside a cursor.
 */
function requestFor(
  request: DiagnosticsRequest,
  messageId: string,
  cursor: string | null,
): SessionRequest<'read-session-diagnostics'> {
  const { tenant, session, proof } = request
  const head = { protocolVersion: 'session-public/1', messageId, operation: name, proof } as const
  return cursor === null
    ? { ...head, body: { tenant, session, cursor, run: request.run, pageBytes: request.pageBytes } }
    : { ...head, body: { tenant, session, cursor } }
}

/** Reads the pages one after another until a page says the read is exhausted. */
async function readAll(
  client: ReturnType<typeof createSessionClient>,
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
    const sent = requestFor(request, messageId, cursor)
    const result = await attempt(() => client.submit(sent))
    if (result === undefined) return { kind: 'refused' }
    if (result.kind === 'uncertain' || result.message.outcome !== 'succeeded')
      return { kind: 'stopped', runs, gaps, result, page }
    const read = pageOf(result.message.body)
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
  return result.kind === 'uncertain'
    ? `page ${page} had no trusted answer`
    : `page ${page} was answered ${result.message.outcome}`
}

/**
 * The `--json` result object, in the keys of the other commands. `body` has the Runs and gaps as
 * the wire carries them and `complete`. `outcome` is the one of the page that stopped the read.
 */
function resultObject(
  reading: Exclude<Reading, { kind: 'refused' }>,
  request: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const body = { runs: reading.runs, gaps: reading.gaps, complete: reading.kind === 'complete' }
  if (reading.kind === 'stopped' && reading.result.kind === 'uncertain')
    return { result: 'uncertain', body, request }
  const outcome =
    reading.kind === 'stopped' && reading.result.kind === 'response'
      ? reading.result.message.outcome
      : 'succeeded'
  return { result: 'response', outcome, body, request }
}

/**
 * `read-session-diagnostics`: reads the diagnostics projection of a session, page by page. The
 * tenant of the request is the owner of the session, as for `read-history`. Standard output is one
 * block for each Run as text for a person, or with `--json` one result object. A gap in the page is
 * part of the result, not a failure. A read that did not reach the end exits non-zero and says why
 * on standard error. The Runs read so far are still written.
 */
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

/** The values of the command line that need no state. A usage error names its message. */
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

  const loaded = loadLogin(read.values, output, environment, 'session')
  if (loaded.kind === 'exit') return loaded.code
  const resolved = resolveOwner(name, session, read.tenant, loaded.directory, output)
  if (resolved.kind === 'exit') return resolved.code
  const { owner } = resolved

  const { newId } = environment.services
  const messageId = newId()
  const reading = await readAll(
    createSessionClient({ transport: loaded.opened.transport }),
    { proof: proofOf(loaded.state), tenant: owner, session, run, pageBytes, newId },
    messageId,
  )
  if (reading.kind === 'refused') return usageError(output, unrecognized(name))

  const { runs, gaps } = reading
  try {
    output.stdout(
      read.values.has('--json')
        ? `${JSON.stringify(resultObject(reading, { messageId, tenant: tenantText(owner) }))}\n`
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
