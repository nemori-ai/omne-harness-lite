import type { EntryId, SessionId } from '@omne-harness/session-contract'
import type { SearchableKind } from './extract.ts'
import type { Snippet } from './snippet.ts'

export type SearchHit = Readonly<{
  session: SessionId
  /** The entry of the message: a start for reading the history around it. */
  position: EntryId
  kind: SearchableKind
  /** The time it counts at: its commit's, or the last one recorded before it; null: none was. */
  at: number | null
  snippet: Snippet
}>
