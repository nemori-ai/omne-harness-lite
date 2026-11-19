import type { SessionRevision } from '@omne-harness/session-contract'
import type { FrozenCover, TailPoint } from './cursor.ts'
import { snippetOf, type SearchHit } from './hit.ts'
import { matchEntry } from './query.ts'
import { inWindow, spentOut, type Run } from './search-run.ts'

// The part of the logs the index had not reached when the search began is read here, entry by
// entry. It starts at the covers the first page froze, so nothing between cover and head is missed.

export type TailEnd =
  | Readonly<{ kind: 'done' }>
  | Readonly<{ kind: 'stopped'; why: 'full' | 'budget'; resume: TailPoint; left: number }>
  | Readonly<{ kind: 'stale' }>
  | Readonly<{ kind: 'unavailable' }>

type Found = Readonly<{ hit: SearchHit; when: number }>
type Scan = { through: SessionRevision; at: number; carried: number; position: bigint }

function startOf(frozen: readonly FrozenCover[], from: 'start' | TailPoint): [number, Scan] | null {
  if (from === 'start') {
    const [, through, at] = frozen[0]!
    return [0, { through, at, carried: at, position: 0n }]
  }
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
  const room = input.pageSize - run.hits.length
  let [index, scan] = start
  const end = (why: 'full' | 'budget'): TailEnd => ({
    kind: 'stopped',
    why,
    resume: {
      session: frozen[index]![0],
      through: scan.through,
      at: scan.at,
      position: String(scan.position) as TailPoint['position'],
    },
    left: frozen.length - index,
  })
  const give = () => {
    // Newest first within the page; the scan itself goes session by session in log order.
    found.sort((left, right) => right.when - left.when)
    for (const { hit } of found) run.hits.push(hit)
  }
  while (index < frozen.length) {
    const session = frozen[index]![0]
    let exhausted = false
    while (!exhausted) {
      if (spentOut(run)) return (give(), end('budget'))
      const page = await deps.log.entries({
        tenant: input.tenant,
        session,
        after: scan.through,
        maxBytes: input.limits.tailPageBytes,
      })
      if ('failure' in page) return { kind: 'unavailable' }
      run.spent.bytes += page.ok.bytes
      let revision = scan.through
      for (const { entry, at } of page.ok.entries) {
        if (entry.revision !== revision) {
          // A new commit begins: what came before it is wholly read.
          scan.through = String(BigInt(entry.revision) - 1n) as SessionRevision
          scan.at = scan.carried
          revision = entry.revision
        }
        if (at !== null) scan.carried = at
        if (BigInt(entry.id) <= scan.position) continue
        scan.position = BigInt(entry.id)
        // An entry with no recorded time counts at the last recorded time before it.
        if (!inWindow(input.query.window, scan.carried)) continue
        const match = matchEntry(input.query, entry)
        if (match === null) continue
        const hit = { session, position: entry.id, kind: match.kind, at, snippet: snippetOf(match) }
        found.push({ hit, when: scan.carried })
        if (found.length >= room) return (give(), end('full'))
      }
      scan.through = page.ok.through
      scan.at = scan.carried
      exhausted = page.ok.exhausted
    }
    index += 1
    if (index < frozen.length) {
      const [, through, at] = frozen[index]!
      scan = { through, at, carried: at, position: 0n }
    }
  }
  return (give(), { kind: 'done' })
}
