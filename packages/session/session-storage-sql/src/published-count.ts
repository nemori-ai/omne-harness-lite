// The publication count of the Agent records of each session, as this process knows it (RT-06).
// The count has one kind of writer: a publication of the Agent records, which is conditional on
// the count. Every publication of this process and every root read reports here, so the count is
// known without a read of the storage. One process writes a database (sqlite-provider §13.5), so
// no publication goes past this keeper; a count that is stale all the same is found when a
// publication of this process is refused.
import type { SqlStorage } from '@omne-harness/sql-contract'

/** The sessions whose count one database keeps; the least recently confirmed one leaves first. */
const KEPT_SESSIONS = 4_096

/** What a caller that needs the count of a session does. */
export type PublishedCountPlan =
  /** The count is known: no read. */
  | Readonly<{ kind: 'known'; published: number }>
  /** The storage is asked: nothing is known, or a write is undecided. */
  | Readonly<{ kind: 'read' }>

/**
 * `undecided`: a publication of the caller has an unknown outcome, so the count may have moved
 * without an answer.
 */
export function planPublishedCount(
  known: number | undefined,
  undecided: boolean,
): PublishedCountPlan {
  return known === undefined || undecided ? { kind: 'read' } : { kind: 'known', published: known }
}

/** The counts of the sessions of one database. */
export class PublishedCounts {
  readonly #known = new Map<string, number>()

  get(session: string): number | undefined {
    return this.#known.get(session)
  }

  /**
   * The storage answered `published` for the session: a root read, or a publication that
   * committed. The count only grows, so an answer below the known count is a read that a
   * publication crossed, and it changes nothing.
   */
  confirm(session: string, published: number): void {
    const known = this.#known.get(session)
    if (known !== undefined && known > published) return
    this.#known.delete(session)
    this.#known.set(session, published)
    if (this.#known.size <= KEPT_SESSIONS) return
    const oldest = this.#known.keys().next().value
    if (oldest !== undefined) this.#known.delete(oldest)
  }

  /** A publication of the session did not commit plainly: the next caller asks the storage. */
  doubt(session: string): void {
    this.#known.delete(session)
  }
}

const counts = new WeakMap<object, PublishedCounts>()

/** The one keeper of a database (`SqlStorage.database`): every provider that reaches it shares it. */
export function publishedCountsOf(storage: SqlStorage): PublishedCounts {
  const store = storage.database
  let found = counts.get(store)
  if (found === undefined) {
    found = new PublishedCounts()
    counts.set(store, found)
  }
  return found
}
