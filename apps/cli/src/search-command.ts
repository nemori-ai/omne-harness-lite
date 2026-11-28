import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import type { BodyOf } from '@omne-harness/sdk/core'
import type { CliOutput, CommandEnvironment, ExitCode } from './cli-types.ts'
import {
  instantOption,
  loadLogin,
  missingOption,
  serverOption,
  tenantOption,
  unrecognized,
  usageError,
  type Option,
} from './command-support.ts'
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { exitCodeOf } from './report.ts'

const name = 'search'
const maxPages = 1000

type Body = BodyOf<SessionProtocol['operations']['search-history']>
type Query = Omit<Body, 'tenant' | 'cursor'>
type Kind = NonNullable<Body['kinds']>[number]

const KINDS: Readonly<Record<string, Kind>> = {
  user: 'message.user',
  assistant: 'message.assistant',
  tool: 'message.tool',
  reminder: 'message.system_reminder',
  internal: 'message.tool_internal',
  compaction: 'message.compaction',
}
const ARCHIVED = { all: 'all', only: 'archived', none: 'unarchived' } as const

const listOf = (given: string | undefined): readonly string[] | undefined =>
  given === undefined ? undefined : given.split(',').map(item => item.trim())

// Exactly one of the three says what to look for: one literal as given, several words that must
// all be there, or one pattern.
function contentOf(values: Option): Body['content'] | undefined {
  const caseSensitive = values.has('--case-sensitive')
  const text = values.get('--text')
  const words = values.get('--words')
  const pattern = values.get('--regex')
  if ([text, words, pattern].filter(given => given !== undefined).length !== 1) return undefined
  if (pattern !== undefined) return { kind: 'regex', pattern, caseSensitive }
  const all = text !== undefined ? [text] : (words ?? '').split(/\s+/u).filter(word => word !== '')
  return all.length === 0 ? undefined : { kind: 'literals', all, caseSensitive }
}

type Lists = Readonly<{
  kinds: readonly string[] | undefined
  sessions: readonly string[] | undefined
}>

function refused({ kinds, sessions }: Lists, archived: string, limit: string | undefined): boolean {
  return (
    kinds?.some(kind => !Object.hasOwn(KINDS, kind)) === true ||
    sessions?.some(session => session === '') === true ||
    !Object.hasOwn(ARCHIVED, archived) ||
    (limit !== undefined && !/^[1-9][0-9]*$/.test(limit))
  )
}

function queryOf(values: Option): Query | undefined {
  const content = contentOf(values)
  const from = instantOption(values, '--since')
  const to = instantOption(values, '--before')
  const kinds = listOf(values.get('--kinds'))
  const sessions = listOf(values.get('--sessions'))
  const archived = values.get('--archived') ?? 'all'
  const limit = values.get('--limit')
  if (content === undefined || from === undefined || to === undefined) return undefined
  if (refused({ kinds, sessions }, archived, limit)) return undefined
  return {
    content,
    from,
    to,
    archived: ARCHIVED[archived as keyof typeof ARCHIVED],
    modelReadable: values.has('--any-visibility') ? 'any' : 'only',
    ...(kinds === undefined ? {} : { kinds: kinds.map(kind => KINDS[kind]!) }),
    ...(sessions === undefined ? {} : { sessions }),
    ...(limit === undefined ? {} : { limit: Number(limit) }),
  }
}

type Hit = Readonly<{
  session: string
  position: string
  kind: string
  at: string | null
  snippet: Readonly<{ before: string; match: string; after: string }>
}>
type Incomplete = Readonly<{
  reason: string
  behind: number
  progress: Readonly<{ indexed: number; total: number }> | null
}>
type Page = Readonly<{
  hits: readonly Hit[]
  next: string | null
  complete: boolean
  incomplete: Incomplete | null
}>

const oneLine = (text: string): string => text.replace(/\s+/gu, ' ')

/** One hit on one line: when, where, who, and the words around the match. */
export function renderHit(hit: Hit): string {
  const { before, match, after } = hit.snippet
  const kind = hit.kind.replace(/^message\./u, '')
  const where = `${hit.session}#${hit.position}`
  return `${hit.at ?? '-'}  ${where}  ${kind}  ${oneLine(before)}[${oneLine(match)}]${oneLine(after)}\n`
}

const REASONS: Readonly<Record<string, string>> = {
  budget: 'the search reached its budget',
  'tail-budget': 'the newest part of the logs was not read through',
  rebuilding: 'the index is being built',
}

/** What a page did not look at, in words: never left for the reader to infer from an empty page. */
export function renderIncomplete(incomplete: Incomplete): string {
  const parts = [REASONS[incomplete.reason] ?? incomplete.reason]
  if (incomplete.behind > 0) parts.push(`${String(incomplete.behind)} sessions not read through`)
  if (incomplete.progress !== null)
    parts.push(
      `index ${String(incomplete.progress.indexed)} of ${String(incomplete.progress.total)}`,
    )
  return parts.join('; ')
}

type Reading = Readonly<{
  hits: readonly Hit[]
  last: Page | null
  stopped: CallResult | null
  pages: number
}>

async function read(
  link: Link,
  asked: Readonly<{ tenant: TenantId; query: Query; cursor: string | null; all: boolean }>,
  ids: Readonly<{ first: string; newId: () => string }>,
): Promise<Reading | undefined> {
  const hits: Hit[] = []
  let cursor = asked.cursor
  let last: Page | null = null
  for (let page = 1; page <= maxPages; page += 1) {
    const body = { ...asked.query, tenant: asked.tenant, cursor }
    const messageId = page === 1 ? ids.first : ids.newId()
    const result = await link.call(sessionProtocol, 'search-history', body, messageId)
    if (result.kind === 'rejected') return undefined
    if (result.kind !== 'response' || result.outcome !== 'succeeded')
      return { hits, last, stopped: result, pages: page }
    last = result.body as unknown as Page
    hits.push(...last.hits)
    if (!asked.all || last.next === null || last.next === cursor)
      return { hits, last, stopped: null, pages: page }
    cursor = last.next
  }
  return { hits, last, stopped: null, pages: maxPages }
}

function statusOf(reading: Reading, output: CliOutput): ExitCode {
  const { last, stopped } = reading
  if (stopped !== null) {
    const body = stopped.kind === 'response' ? stopped.body : undefined
    const detail =
      stopped.kind === 'response'
        ? `answered ${stopped.outcome}${body === undefined ? '' : ` ${JSON.stringify(body)}`}`
        : stopped.kind
    output.stderr(`omne ${name}: page ${String(reading.pages)} was ${detail}\n`)
    return exitCodeOf(stopped)
  }
  if (last?.incomplete != null)
    output.stderr(`omne ${name}: not through: ${renderIncomplete(last.incomplete)}\n`)
  if (last?.next != null) output.stderr(`omne ${name}: more with --cursor ${last.next}\n`)
  return 0
}

const OPTIONS = {
  accepted: [
    '--text',
    '--words',
    '--regex',
    '--sessions',
    '--archived',
    '--kinds',
    '--since',
    '--before',
    '--limit',
    '--cursor',
    '--tenant',
    serverOption,
  ],
  required: [],
  switches: ['--case-sensitive', '--any-visibility', '--all', '--json'],
}

const answeredOf = (stopped: Reading['stopped']): string | null => {
  if (stopped === null) return 'succeeded'
  return stopped.kind === 'response' ? stopped.outcome : null
}

// What goes to standard output: the hits as lines, or the whole answer as one JSON line.
function shownOf(reading: Reading, json: boolean, request: unknown): string {
  const { hits, last, stopped } = reading
  if (!json) return hits.map(renderHit).join('')
  const through = stopped === null && last?.complete === true
  const body = {
    hits,
    next: last?.next ?? null,
    complete: through,
    incomplete: last?.incomplete ?? null,
  }
  const answered = answeredOf(stopped)
  const said =
    answered === null
      ? { result: stopped?.kind, body, request }
      : { result: 'response', outcome: answered, body, request }
  return `${JSON.stringify(said)}\n`
}

export async function runSearch(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const options = readOptions(args, OPTIONS)
  if (options.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (options.kind === 'missing') return usageError(output, missingOption(name, options.option))
  const { values } = options
  const given = tenantOption(values)
  const query = queryOf(values)
  if (given === null || query === undefined) return usageError(output, unrecognized(name))

  const loaded = loadLogin(values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const tenant = given ?? loaded.tenant
  const { newId } = environment.services
  const first = newId()
  const asked = { tenant, query, cursor: values.get('--cursor') ?? null, all: values.has('--all') }
  const reading = await read(loaded.link, asked, { first, newId })
  if (reading === undefined) return usageError(output, unrecognized(name))

  const request = { messageId: first, tenant: encodeTenantText(tenant) }
  try {
    output.stdout(shownOf(reading, values.has('--json'), request))
  } catch {
    output.stderr(`omne ${name}: cannot write standard output\n`)
    return 1
  }
  const code = statusOf(reading, output)
  if (code === 5) output.stderr(`omne ${name}: result uncertain\n`)
  return code
}
