// The session diagnostics projection (SPEC「会话诊断投影」): reads the Session history page by
// page, collects the Runs of this page, fans out to the other sources through the ports, and
// returns the view with its gaps and the position a next page continues from. Session's refusal is
// the result of the operation; every other source's refusal is a gap. The sealed cursor and the
// public answer belong to the session location.
import type { Access } from '@omne-harness/legal-identity'
import type { SessionDiagnosticGap, SessionRunDiagnostic } from '@omne-harness/public-contract'
import type {
  EntryId,
  HistoryPage,
  SessionAccess,
  SessionFailure,
  SessionHistory,
} from '@omne-harness/session-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  collectRuns,
  projectRun,
  undisclosedGaps,
  type ModelAnswers,
  type RunAnswers,
  type RunCollector,
  type RunSkeleton,
  type ToolAnswers,
} from './project.ts'
import { sourcesOf, type DiagnosticPorts, type DiagnosticSources } from './sources.ts'

export { createDiagnosticsCursors } from './cursor.ts'
export type { DiagnosticsCursors, DiagnosticsCursorState } from './cursor.ts'
export { PROJECTED_KINDS } from './project.ts'
export type {
  AgentFinishReader,
  DiagnosticPorts,
  ModelAttemptReader,
  ModelCallInspector,
  ToolCallReader,
} from './sources.ts'

export type DiagnosticsLimits = Readonly<{ maxRuns: number; maxCallsPerRun: number }>

export type ProjectionInput<P> = Readonly<{
  access: SessionAccess<P>
  history: Pick<SessionHistory<P>, 'begin' | 'next'>
  ports: DiagnosticPorts<P>
  /** The entry kinds the deployment discloses to this projection. */
  kinds: readonly string[]
  limits: DiagnosticsLimits
  run: string | null
  pageBytes: number
  /** The entry a continued page starts before; null for the first page. */
  from: EntryId | null
}>

export type ProjectedPage = Readonly<{
  runs: readonly SessionRunDiagnostic[]
  gaps: readonly SessionDiagnosticGap[]
  exhausted: boolean
  scannedThrough: string
  upper: string
  /** The entry a next page starts before; null when the scan is exhausted. */
  continueFrom: EntryId | null
}>

export type ProjectionResult =
  | Readonly<{ kind: 'page'; page: ProjectedPage }>
  | Readonly<{ kind: 'failure'; failure: SessionFailure }>

type Scan = Readonly<{
  runs: readonly RunSkeleton[]
  exhausted: boolean
  scannedThrough: string
  upper: string
  continueFrom: EntryId | null
}>

/** The first page through `begin` from `input.from`; every later page through `next`. */
function readPage<P>(
  input: ProjectionInput<P>,
  previous: HistoryPage | undefined,
): Promise<Outcome<HistoryPage, SessionFailure>> {
  const { access, history } = input
  if (previous === undefined)
    return history.begin({
      ...access,
      kinds: input.kinds,
      from: input.from,
      direction: 'backward',
      pageBytes: input.pageBytes,
    })
  return history.next({ ...access, cursor: previous.next as string })
}

/** Feeds one page to the collector. Returns the index it stopped at, or -1 when it took the whole page. */
function feedPage(collector: RunCollector, page: HistoryPage): number {
  for (const [index, entry] of page.entries.entries()) if (collector.feed(entry)) return index
  return -1
}

/**
 * The end of a scan. With a Run filter the scan of that Run is complete. Without one, entries left
 * over in the last page or pages not yet read mean another page can continue before the Run the
 * collection stopped at.
 */
function scanOf(
  filter: string | null,
  collector: RunCollector,
  page: HistoryPage,
  stoppedIn: number,
): Scan {
  const stoppedAt = collector.stoppedAt()
  const leftover = stoppedIn !== -1 && stoppedIn < page.entries.length - 1
  const continues =
    filter === null && stoppedAt !== null && (leftover || !page.exhausted || page.next !== null)
  return {
    runs: collector.runs(),
    exhausted: !continues,
    scannedThrough: stoppedAt ?? page.scannedThrough,
    upper: page.upper,
    continueFrom: continues ? (stoppedAt as EntryId) : null,
  }
}

/** Reads Session pages until the collector stops or the history is exhausted. A Session throw propagates. */
async function scan<P>(input: ProjectionInput<P>): Promise<Scan | SessionFailure> {
  const collector = collectRuns({ run: input.run, maxRuns: input.limits.maxRuns })
  let page: HistoryPage | undefined
  let stoppedIn = -1
  do {
    const read = await readPage(input, page)
    if ('failure' in read) return read.failure
    page = read.ok
    stoppedIn = feedPage(collector, page)
  } while (stoppedIn === -1 && !page.exhausted && page.next !== null)
  return scanOf(input.run, collector, page, stoppedIn)
}

/**
 * The Model branch of one call: `inspect` resolves the reference; a found call lists its attempts;
 * the dispatch records, which carry the accounts, are read only when there is an attempt to account.
 */
async function modelAnswersOf(
  sources: DiagnosticSources,
  reference: string,
): Promise<ModelAnswers> {
  const lookup = await sources.inspectModelCall(reference)
  const call =
    lookup.kind === 'value' && lookup.value.kind === 'found' ? lookup.value.state.call : null
  if (call === null) return { lookup, attempts: null, dispatches: null }
  const attempts = await sources.listModelAttempts(call)
  const listed = attempts.kind === 'value' && attempts.value.entries.length > 0
  return { lookup, attempts, dispatches: listed ? await sources.listModelDispatches(call) : null }
}

async function toolAnswersOf(sources: DiagnosticSources, reference: string): Promise<ToolAnswers> {
  const [lookup, account, diagnostics] = await Promise.all([
    sources.lookupToolCall(reference),
    sources.readToolAccount(reference),
    sources.readToolDiagnostics(reference),
  ])
  return { lookup, account, diagnostics }
}

/** Reads what the other sources know of one Run: its finish when it did not complete, and its first `projected` calls. */
async function answersOf(
  sources: DiagnosticSources,
  skeleton: RunSkeleton,
  projected: number,
): Promise<RunAnswers> {
  const ended = skeleton.terminal !== null && skeleton.terminal.outcome !== 'completed'
  const finish = ended ? await sources.readFinish(skeleton.execution) : null
  const models = new Map<string, ModelAnswers>()
  const tools = new Map<string, ToolAnswers>()
  for (const call of skeleton.calls.slice(0, projected)) {
    if (call.reference === null) continue
    if (call.kind === 'model')
      models.set(call.position, await modelAnswersOf(sources, call.reference))
    else tools.set(call.position, await toolAnswersOf(sources, call.reference))
  }
  return { finish, models, tools }
}

export async function projectSessionDiagnostics<P>(
  input: ProjectionInput<P>,
): Promise<ProjectionResult> {
  const scanned = await scan(input)
  if ('kind' in scanned) return { kind: 'failure', failure: scanned }
  const access: Access<P> = { principal: input.access.principal, tenant: input.access.tenant }
  const sources = sourcesOf(access, input.ports)
  const runs: SessionRunDiagnostic[] = []
  const gaps: SessionDiagnosticGap[] = undisclosedGaps(input.kinds)
  for (const skeleton of scanned.runs) {
    const projected = Math.min(skeleton.calls.length, input.limits.maxCallsPerRun)
    const one = projectRun(skeleton, projected, await answersOf(sources, skeleton, projected))
    runs.push(one.value)
    gaps.push(...one.gaps)
  }
  return {
    kind: 'page',
    page: {
      runs,
      gaps: distinct(gaps),
      exhausted: scanned.exhausted,
      scannedThrough: scanned.scannedThrough,
      upper: scanned.upper,
      continueFrom: scanned.continueFrom,
    },
  }
}

function distinct(gaps: readonly SessionDiagnosticGap[]): SessionDiagnosticGap[] {
  const seen = new Set<string>()
  return gaps.filter(gap => {
    const key = `${gap.source}\u0000${gap.subject}\u0000${gap.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
