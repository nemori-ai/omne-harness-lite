// The publication count of the Agent records of each session, as this process knows it (RT-06).
// The count has one kind of writer: a publication of the Agent records, which is conditional on
// the count. Every publication of this process and every root read reports here, so the count is
// known without a read of the storage. A publication of another process is seen at most
// `PUBLISHED_COUNT_MAX_AGE_MS` later, or when a publication of this process is refused.
import { databaseOf, type SqlStorage } from '@omne-harness/sql-contract'

/** How long a known count answers before the storage confirms it again. */
export const PUBLISHED_COUNT_MAX_AGE_MS = 1_000

/** The sessions whose count one database keeps; the least recently confirmed one leaves first. */
const KEPT_SESSIONS = 4_096

type Known = Readonly<{ published: number; confirmedAt: number }>

/** What a caller that needs the count of a session does. */
export type PublishedCountPlan =
  /** The count is known: no read. */
  | Readonly<{ kind: 'known'; published: number }>
  /** The storage is asked: nothing is known, a write is undecided, or the last answer is too old. */
  | Readonly<{ kind: 'read' }>

/**
 * `undecided`: a publication of the caller has an unknown outcome, so the count may have moved
 * without an answer. `at` is a monotonic clock in milliseconds.
 */
export function planPublishedCount(
  known: Known | undefined,
  undecided: boolean,
  at: number,
): PublishedCountPlan {
  if (known === undefined || undecided || at - known.confirmedAt > PUBLISHED_COUNT_MAX_AGE_MS)
    return { kind: 'read' }
  return { kind: 'known', published: known.published }
}

/** The counts of the sessions of one database. */
export class PublishedCounts {
  readonly #known = new Map<string, Known>()

  get(session: string): Known | undefined {
    return this.#known.get(session)
  }

  /**
   * The storage answered `published` for the session: a root read, or a publication that
   * committed. The count only grows, so an answer below the known count is a read that a
   * publication crossed, and it changes nothing.
   */
  confirm(session: string, published: number, at: number): void {
    const known = this.#known.get(session)
    if (known !== undefined && known.published > published) return
    this.#known.delete(session)
    this.#known.set(session, { published, confirmedAt: at })
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

/** The one keeper of a database (`databaseOf`): every provider that reaches it shares it. */
export function publishedCountsOf(storage: SqlStorage): PublishedCounts {
  const store = databaseOf(storage)
  let found = counts.get(store)
  if (found === undefined) {
    found = new PublishedCounts()
    counts.set(store, found)
  }
  return found
}
