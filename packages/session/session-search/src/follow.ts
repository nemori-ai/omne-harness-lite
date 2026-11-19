import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionId, SessionRevision } from '@omne-harness/session-contract'
import { documentsOf } from './extract.ts'
import type { Cover, HistoryIndex, IndexFailure, IndexedEntry } from './index-port.ts'
import type { HistoryLogReader } from './log-port.ts'

export type FollowInput = Readonly<{
  tenant: TenantId
  generation: number
  session: SessionId
  /** Where the index stands in this session; the log is read from behind it. */
  cover: Cover
  maxBytes: number
}>

export type FollowStep = Readonly<{
  through: SessionRevision
  at: number
  exhausted: boolean
  entries: number
}>

/** One page of a session's log into the index: its rows and the new cover in one append. */
export async function followSession(
  deps: Readonly<{ index: HistoryIndex; log: HistoryLogReader }>,
  input: FollowInput,
): Promise<Outcome<FollowStep, IndexFailure>> {
  const { tenant, generation, session, cover } = input
  const after = cover.through
  const page = await deps.log.entries({ tenant, session, after, maxBytes: input.maxBytes })
  if ('failure' in page) return fail('unavailable')
  const { entries, exhausted, through } = page.ok
  let at = cover.at
  const documents: IndexedEntry[] = []
  for (const logged of entries) {
    // An entry with no recorded time counts at the last recorded one before it.
    if (logged.at !== null) at = logged.at
    const { id: position, revision } = logged.entry
    for (const document of documentsOf(logged.entry))
      documents.push({ position, revision, at, document })
  }
  const appended = await deps.index.append({ tenant, generation, session, through, at, documents })
  if ('failure' in appended) return appended
  return succeed({ through, at, exhausted, entries: entries.length })
}
