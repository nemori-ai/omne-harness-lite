import {
  createSessionClient,
  tenantText,
  type CallerResult,
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
} from './command-support.ts'
import { renderEntry, type RawEntry } from './history-render.ts'
import { readOptions } from './options.ts'
import { exitCodeOf } from './report.ts'

const name = 'read-history'
const defaultPageBytes = '65536'
const maxPages = 10_000

type Page = {
  readonly entries: readonly RawEntry[]
  readonly next: string | null
  readonly exhausted: boolean
}

function pageOf(body: unknown): Page | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const { entries, next, exhausted } = body as Record<string, unknown>
  if (!Array.isArray(entries) || typeof exhausted !== 'boolean') return undefined
  if (next !== null && typeof next !== 'string') return undefined
  return { entries: entries as RawEntry[], next, exhausted }
}

type Reading =
  | { readonly kind: 'complete'; readonly entries: readonly RawEntry[] }
  | {
      readonly kind: 'stopped'
      readonly entries: readonly RawEntry[]
      readonly result: CallerResult
      readonly page: number
    }
  | { readonly kind: 'broken'; readonly entries: readonly RawEntry[]; readonly reason: string }
  | { readonly kind: 'refused' }

interface HistoryRequest {
  readonly proof: ReturnType<typeof proofOf>
  readonly tenant: TenantId
  readonly session: string
  readonly pageBytes: string
  readonly newId: () => string
}

async function readAll(
  client: ReturnType<typeof createSessionClient>,
  request: HistoryRequest,
  firstMessageId: string,
): Promise<Reading> {
  const { tenant, session, proof } = request
  const entries: RawEntry[] = []
  let cursor: string | null = null
  for (let page = 1; ; page += 1) {
    if (page > maxPages) return { kind: 'broken', entries, reason: `more than ${maxPages} pages` }
    const messageId = page === 1 ? firstMessageId : request.newId()
    const result = await attempt(() =>
      client.submit(
        cursor === null
          ? {
              protocolVersion: 'session-public/1',
              messageId,
              operation: 'read-history',
              proof,
              body: { tenant, session, cursor, direction: 'forward', pageBytes: request.pageBytes },
            }
          : {
              protocolVersion: 'session-public/1',
              messageId,
              operation: 'read-history',
              proof,
              body: { tenant, session, cursor },
            },
      ),
    )
    if (result === undefined) return { kind: 'refused' }
    if (result.kind === 'uncertain' || result.message.outcome !== 'succeeded')
      return { kind: 'stopped', entries, result, page }
    const read = pageOf(result.message.body)
    if (read === undefined)
      return { kind: 'broken', entries, reason: `page ${page} is not a history page` }
    entries.push(...read.entries)
    if (read.exhausted) return { kind: 'complete', entries }
    if (read.next === null)
      return { kind: 'broken', entries, reason: `page ${page} has no cursor but is not the last` }
    if (read.next === cursor)
      return { kind: 'broken', entries, reason: `page ${page} did not advance the cursor` }
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

function resultObject(
  reading: Exclude<Reading, { kind: 'refused' }>,
  request: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const body = { entries: reading.entries, complete: reading.kind === 'complete' }
  if (reading.kind === 'stopped' && reading.result.kind === 'uncertain')
    return { result: 'uncertain', body, request }
  const outcome =
    reading.kind === 'stopped' && reading.result.kind === 'response'
      ? reading.result.message.outcome
      : 'succeeded'
  return { result: 'response', outcome, body, request }
}

export async function runReadHistory(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const read = readOptions(args, {
    accepted: ['--session', '--tenant', '--page-bytes', serverOption],
    required: ['--session'],
    switches: ['--json'],
  })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const given = tenantOption(read.values)
  const pageBytes = read.values.get('--page-bytes') ?? defaultPageBytes
  if (given === null || !/^[1-9][0-9]*$/.test(pageBytes))
    return usageError(output, unrecognized(name))
  const session = read.values.get('--session') ?? ''

  const loaded = loadLogin(read.values, output, environment, 'session')
  if (loaded.kind === 'exit') return loaded.code
  const resolved = resolveOwner(name, session, given, loaded.directory, output)
  if (resolved.kind === 'exit') return resolved.code
  const { owner } = resolved

  const { newId } = environment.services
  const messageId = newId()
  const reading = await readAll(
    createSessionClient({ transport: loaded.opened.transport }),
    { proof: proofOf(loaded.state), tenant: owner, session, pageBytes, newId },
    messageId,
  )
  if (reading.kind === 'refused') return usageError(output, unrecognized(name))

  const { entries } = reading
  try {
    output.stdout(
      read.values.has('--json')
        ? `${JSON.stringify(resultObject(reading, { messageId, tenant: tenantText(owner) }))}\n`
        : entries.map(renderEntry).join(''),
    )
  } catch {
    output.stderr(`omne ${name}: cannot write standard output\n`)
    return 1
  }
  if (reading.kind === 'complete') return 0
  output.stderr(
    `omne ${name}: history incomplete after ${entries.length} entries: ${incompleteReason(reading)}\n`,
  )
  if (reading.kind === 'broken') return 1
  const code = exitCodeOf(reading.result)
  if (code === 5) output.stderr(`omne ${name}: result uncertain\n`)
  return code
}
