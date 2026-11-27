import type {
  CommitResultV2,
  QueryResultV2,
  ReadResult,
  StorageCommitCount,
  StorageReadCount,
  StorageReadings,
} from '@omne-harness/sql-contract'

type ReadTally = { read: number; unavailable: number; cancelled: number }
type CommitTally = { -readonly [K in Exclude<keyof StorageCommitCount, 'domain'>]: number }
type QueryTally = { answered: number; unknown: number }

const SEPARATOR = '\u0000'

const commitSlot = (result: CommitResultV2): keyof Omit<CommitTally, 'bytes'> => {
  switch (result.kind) {
    case 'committed':
      return result.recalled ? 'recalled' : 'committed'
    case 'rolled_back':
      return result.recalled ? 'recalled' : 'rolledBack'
    case 'unknown':
      return 'unknown'
    case 'identity_conflict':
      return 'conflicted'
    case 'rejected_before_accept':
      return 'rejected'
  }
}

function slotOf<T>(slots: Map<string, T>, key: string, empty: () => T): T {
  const found = slots.get(key)
  if (found !== undefined) return found
  const made = empty()
  slots.set(key, made)
  return made
}

const byKey = ([a]: readonly [string, unknown], [b]: readonly [string, unknown]): number =>
  a < b ? -1 : a > b ? 1 : 0

/** What the provider counted at its own port since it was created: only ever growing, read by taking a copy. */
export class Readings {
  readonly #reads = new Map<string, ReadTally>()
  readonly #commits = new Map<string, CommitTally>()
  readonly #participants = new Map<string, number>()
  readonly #queries = new Map<string, QueryTally>()

  read(domain: string, handler: string, kind: ReadResult['kind']): void {
    const tally = slotOf(this.#reads, `${domain}${SEPARATOR}${handler}`, () => ({
      read: 0,
      unavailable: 0,
      cancelled: 0,
    }))
    tally[kind] += 1
  }

  commit(
    domain: string,
    participants: readonly string[],
    bytes: number,
    result: CommitResultV2,
  ): void {
    const tally = slotOf(this.#commits, domain, () => ({
      committed: 0,
      recalled: 0,
      rolledBack: 0,
      unknown: 0,
      conflicted: 0,
      rejected: 0,
      bytes: 0,
    }))
    const slot = commitSlot(result)
    tally[slot] += 1
    if (slot !== 'committed') return
    tally.bytes += bytes
    for (const participant of participants) {
      const key = `${domain}${SEPARATOR}${participant}`
      this.#participants.set(key, (this.#participants.get(key) ?? 0) + 1)
    }
  }

  query(domain: string, kind: QueryResultV2['kind']): void {
    const tally = slotOf(this.#queries, domain, () => ({ answered: 0, unknown: 0 }))
    tally[kind === 'unknown' ? 'unknown' : 'answered'] += 1
  }

  snapshot(): StorageReadings {
    const pair = (key: string): readonly [string, string] => {
      const at = key.indexOf(SEPARATOR)
      return [key.slice(0, at), key.slice(at + 1)]
    }
    return {
      reads: [...this.#reads].sort(byKey).map(([key, tally]): StorageReadCount => {
        const [domain, handler] = pair(key)
        return { domain, handler, ...tally }
      }),
      commits: [...this.#commits].sort(byKey).map(([domain, tally]) => ({ domain, ...tally })),
      participants: [...this.#participants].sort(byKey).map(([key, committed]) => {
        const [domain, participant] = pair(key)
        return { domain, participant, committed }
      }),
      queries: [...this.#queries].sort(byKey).map(([domain, tally]) => ({ domain, ...tally })),
    }
  }
}
