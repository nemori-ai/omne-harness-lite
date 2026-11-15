import type { SqlStorage } from '@omne-harness/sql-contract'

const KEPT_SESSIONS = 4_096

export type PublishedCountPlan =
  | Readonly<{ kind: 'known'; published: number }>
  | Readonly<{ kind: 'read' }>

export function planPublishedCount(
  known: number | undefined,
  undecided: boolean,
): PublishedCountPlan {
  return known === undefined || undecided ? { kind: 'read' } : { kind: 'known', published: known }
}

export class PublishedCounts {
  readonly #known = new Map<string, number>()

  get(session: string): number | undefined {
    return this.#known.get(session)
  }

  confirm(session: string, published: number): void {
    const known = this.#known.get(session)
    if (known !== undefined && known > published) return
    this.#known.delete(session)
    this.#known.set(session, published)
    if (this.#known.size <= KEPT_SESSIONS) return
    const oldest = this.#known.keys().next().value
    if (oldest !== undefined) this.#known.delete(oldest)
  }

  doubt(session: string): void {
    this.#known.delete(session)
  }
}

const counts = new WeakMap<object, PublishedCounts>()

export function publishedCountsOf(storage: SqlStorage): PublishedCounts {
  const store = storage.database
  let found = counts.get(store)
  if (found === undefined) {
    found = new PublishedCounts()
    counts.set(store, found)
  }
  return found
}
