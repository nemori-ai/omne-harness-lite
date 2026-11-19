import type { SessionRevision } from '@omne-harness/session-contract'
import type { FrozenCover, TailPoint } from './cursor.ts'
import type { SearchHit } from './hit.ts'
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

export async function scanTails(
  run: Run,
  frozen: readonly FrozenCover[],
  from: 'start' | TailPoint,
): Promise<TailEnd> {
  const start = startOf(frozen, from)
  if (start === null) return { kind: 'stale' }
  const { deps, input } = run
  const found: Found[] = []
  let [index, scan] = start
  let reads = 0
  const end = (spent: boolean): TailEnd => {
    // Newest first within the page: the scan went in log order, so it is turned round first.
    found.reverse().sort((left, right) => right.when - left.when)
    for (const { hit } of found) run.hits.push(hit)
    if (index === frozen.length) return { kind: 'done' }
    const position = String(scan.position) as TailPoint['position']
    const resume = { session: frozen[index]![0], through: scan.through, at: scan.at, position }
    return { kind: 'stopped', spent, resume, left: frozen.length - index }
  }
  while (index < frozen.length) {
    const session = frozen[index]![0]
    for (let exhausted = false; !exhausted;) {
      // Asked after a read, never before the first: a page always gets somewhere.
      if (reads > 0 && spentOut(run)) return end(true)
      reads += 1
      const after = scan.through
      const maxBytes = input.limits.tailPageBytes
      const { tenant, query } = input
      const page = await deps.log.judge({ tenant, session, after, maxBytes, spec: query.spec })
      if ('failure' in page) return { kind: 'unavailable' }
      run.spent.bytes += page.ok.bytes
      let revision = scan.through
      for (const judged of page.ok.entries) {
        const { at } = judged
        if (judged.revision !== revision) {
          // A new commit begins: what came before it is wholly read.
          scan.through = String(BigInt(judged.revision) - 1n) as SessionRevision
          scan.at = scan.carried
          revision = judged.revision
        }
        // An entry with no recorded time counts at the last recorded time before it.
        if (at !== null) scan.carried = at
        if (BigInt(judged.position) <= scan.position) continue
        scan.position = BigInt(judged.position)
        const match = inWindow(query.window, scan.carried) ? judged.match : null
        if (match === null) continue
        const when = scan.carried === 0 ? null : scan.carried
        const { kind, snippet } = match
        const hit = { session, position: judged.position, kind, at: when, snippet }
        found.push({ hit, when: scan.carried })
        if (found.length >= input.pageSize) return end(false)
      }
      scan.through = page.ok.through
      scan.at = scan.carried
      exhausted = page.ok.exhausted
    }
    index += 1
    const next = frozen[index]
    if (next !== undefined) scan = scanFrom(next)
  }
  return end(false)
}
