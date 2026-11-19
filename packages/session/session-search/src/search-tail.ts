import type { SessionId, SessionRevision } from '@omne-harness/session-contract'
import type { FrozenCover, TailPoint } from './cursor.ts'
import type { SearchHit } from './hit.ts'
import type { Judged } from './log-port.ts'
import { inWindow, spentOut, type Run } from './search-run.ts'

// The part of the logs the index had not reached when the search began is read here, entry by
// entry. It starts at the covers the first page froze, so nothing between cover and head is missed.

export type TailEnd =
  | Readonly<{ kind: 'done' }>
  | Readonly<{ kind: 'stopped'; spent: boolean; resume: TailPoint; left: number }>
  | Readonly<{ kind: 'stale' }>
  | Readonly<{ kind: 'unavailable' }>

type Found = Readonly<{ hit: SearchHit; when: number }>
type Scan = { through: SessionRevision; at: number; carried: number; position: bigint }

const scanFrom = ([, through, at]: FrozenCover): Scan => ({
  through,
  at,
  carried: at,
  position: 0n,
})

function startOf(frozen: readonly FrozenCover[], from: 'start' | TailPoint): [number, Scan] | null {
  if (from === 'start') return [0, scanFrom(frozen[0]!)]
  const index = frozen.findIndex(([session]) => session === from.session)
  if (index < 0) return null
  const { through, at } = from
  return [index, { through, at, carried: at, position: BigInt(from.position) }]
}

type Tails = {
  readonly run: Run
  readonly frozen: readonly FrozenCover[]
  readonly found: Found[]
  index: number
  scan: Scan
  reads: number
}

function endOf(tails: Tails, spent: boolean): TailEnd {
  const { frozen, found, run, scan, index } = tails
  // Newest first within the page: the scan went in log order, so it is turned round first.
  found.reverse().sort((left, right) => right.when - left.when)
  for (const { hit } of found) run.hits.push(hit)
  if (index === frozen.length) return { kind: 'done' }
  const position = String(scan.position) as TailPoint['position']
  const resume = { session: frozen[index]![0], through: scan.through, at: scan.at, position }
  return { kind: 'stopped', spent, resume, left: frozen.length - index }
}

function takeEntries(tails: Tails, session: SessionId, entries: readonly Judged[]): boolean {
  const { scan, found } = tails
  const { query, pageSize } = tails.run.input
  let revision = scan.through
  for (const judged of entries) {
    if (judged.revision !== revision) {
      // A new commit begins: what came before it is wholly read.
      scan.through = String(BigInt(judged.revision) - 1n) as SessionRevision
      scan.at = scan.carried
      revision = judged.revision
    }
    // An entry with no recorded time counts at the last recorded time before it.
    if (judged.at !== null) scan.carried = judged.at
    if (BigInt(judged.position) <= scan.position) continue
    scan.position = BigInt(judged.position)
    const match = inWindow(query.window, scan.carried) ? judged.match : null
    if (match === null) continue
    const when = scan.carried === 0 ? null : scan.carried
    const { kind, snippet } = match
    const hit = { session, position: judged.position, kind, at: when, snippet }
    found.push({ hit, when: scan.carried })
    if (found.length >= pageSize) return true
  }
  return false
}

async function scanSession(tails: Tails, session: SessionId): Promise<TailEnd | null> {
  const { run, scan } = tails
  const { tenant, query, limits } = run.input
  for (let exhausted = false; !exhausted;) {
    // Asked after a read, never before the first: a page always gets somewhere.
    if (tails.reads > 0 && spentOut(run)) return endOf(tails, true)
    tails.reads += 1
    const range = { tenant, session, after: scan.through, maxBytes: limits.tailPageBytes }
    const page = await run.deps.log.judge({ ...range, spec: query.spec })
    if ('failure' in page) return { kind: 'unavailable' }
    run.spent.bytes += page.ok.bytes
    if (takeEntries(tails, session, page.ok.entries)) return endOf(tails, false)
    scan.through = page.ok.through
    scan.at = scan.carried
    exhausted = page.ok.exhausted
  }
  return null
}

export async function scanTails(
  run: Run,
  frozen: readonly FrozenCover[],
  from: 'start' | TailPoint,
): Promise<TailEnd> {
  const start = startOf(frozen, from)
  if (start === null) return { kind: 'stale' }
  const tails: Tails = { run, frozen, found: [], index: start[0], scan: start[1], reads: 0 }
  while (tails.index < frozen.length) {
    const end = await scanSession(tails, frozen[tails.index]![0])
    if (end !== null) return end
    tails.index += 1
    const next = frozen[tails.index]
    if (next !== undefined) tails.scan = scanFrom(next)
  }
  return endOf(tails, false)
}
