import {
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerRead,
  type LedgerRecord,
  type LedgerRecordRead,
  type LedgerWrite,
  type ToolLedgerStore,
} from '@omne-harness/tool'

const KEPT_DOMAINS = 512

type Complete = Extract<LedgerRead, { kind: 'complete' }>
type Revision = Complete['revision']

export type Snapshot = Readonly<{
  revision: Revision
  records: ReadonlyMap<string, LedgerRecord>
  whole: boolean
}>

function frozen<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const member of Object.values(value)) frozen(member)
  return Object.freeze(value)
}

const stored = (record: LedgerRecord): LedgerRecord =>
  frozen(JSON.parse(JSON.stringify(record)) as LedgerRecord)

const handed = (record: LedgerRecord): LedgerRecord => structuredClone(record)

const inKeyOrder = (records: Iterable<readonly [string, LedgerRecord]>) =>
  new Map([...records].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))

export function snapshotOf(read: Complete): Snapshot {
  return {
    revision: read.revision,
    records: inKeyOrder(read.records.map(record => [recordKey(record), stored(record)])),
    whole: true,
  }
}

export type ReadPlan = Readonly<{ kind: 'answer'; read: Complete }> | Readonly<{ kind: 'whole' }>

export function planRead(held: Snapshot | undefined): ReadPlan {
  if (held === undefined || !held.whole || held.records.size === 0) return { kind: 'whole' }
  return {
    kind: 'answer',
    read: {
      kind: 'complete',
      revision: held.revision,
      records: [...held.records.values()].map(handed),
    },
  }
}

export type RecordPlan =
  | Readonly<{ kind: 'answer'; read: Extract<LedgerRecordRead, { kind: 'complete' }> }>
  | Readonly<{ kind: 'ask' }>

export function planRecord(held: Snapshot | undefined, key: string): RecordPlan {
  const record = held?.records.get(key)
  if (held === undefined || record === undefined) return { kind: 'ask' }
  return {
    kind: 'answer',
    read: { kind: 'complete', revision: held.revision, record: handed(record) },
  }
}

export function judged(
  held: Snapshot | undefined,
  answer: Extract<LedgerRecordRead, { kind: 'complete' }>,
  key: string,
): Snapshot {
  const same = held?.revision === answer.revision
  const records = new Map(same ? held.records : [])
  if (answer.record !== null) records.set(key, stored(answer.record))
  return {
    revision: answer.revision,
    records: inKeyOrder(records),
    whole: same && held.whole,
  }
}

function applied(
  records: ReadonlyMap<string, LedgerRecord>,
  writes: readonly LedgerWrite[],
): ReadonlyMap<string, LedgerRecord> | null {
  const next = new Map(records)
  let added = false
  for (const write of writes) {
    if (write.kind === 'drop') return null
    if (write.kind === 'put') {
      const key = recordKey(write.record)
      added ||= !next.has(key)
      next.set(key, stored(write.record))
    } else if (write.kind === 'delete') next.delete(write.key)
  }
  return added ? inKeyOrder(next) : next
}

export function afterCommit(
  held: Snapshot | undefined,
  input: LedgerCommitInput,
  answer: LedgerCommit,
): Snapshot | null {
  switch (answer.kind) {
    case 'committed': {
      if (held?.revision !== input.expected) return null
      const records = applied(held.records, input.writes)
      return records === null ? null : { revision: input.revision, records, whole: held.whole }
    }
    case 'conflict':
      return held === undefined || held.revision === input.expected ? null : held
    case 'unknown':
      return null
    case 'unavailable':
    case 'rejected':
      return held ?? null
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

export function refuted(held: Snapshot | undefined, revision: Revision): boolean {
  return held?.revision === revision
}

class Crossings {
  readonly #busy = new Map<string, number>()
  /** The order number of the last start or end of a commit, by domain. */
  readonly #moved = new Map<string, number>()
  #order = 0
  /** No domain that left `#moved` moved after this order number. */
  #floor = 0

  mark(): number {
    return this.#order
  }

  crossed(domain: string, mark: number): boolean {
    return this.#busy.has(domain) || (this.#moved.get(domain) ?? this.#floor) > mark
  }

  async during<T>(domain: string, commit: () => Promise<T>): Promise<T> {
    this.#move(domain)
    this.#busy.set(domain, (this.#busy.get(domain) ?? 0) + 1)
    try {
      return await commit()
    } finally {
      const left = (this.#busy.get(domain) ?? 1) - 1
      if (left === 0) this.#busy.delete(domain)
      else this.#busy.set(domain, left)
      this.#move(domain)
    }
  }

  #move(domain: string): void {
    this.#order += 1
    this.#moved.delete(domain)
    this.#moved.set(domain, this.#order)
    if (this.#moved.size <= KEPT_DOMAINS) return
    const [oldest, order] = this.#moved.entries().next().value as [string, number]
    this.#moved.delete(oldest)
    this.#floor = Math.max(this.#floor, order)
  }
}

export class LedgerKeeper {
  readonly crossings = new Crossings()
  readonly #kept = new Map<string, Snapshot>()

  get(domain: string): Snapshot | undefined {
    return this.#kept.get(domain)
  }

  set(domain: string, snapshot: Snapshot | null): void {
    this.#kept.delete(domain)
    if (snapshot === null) return
    this.#kept.set(domain, snapshot)
    if (this.#kept.size <= KEPT_DOMAINS) return
    const oldest = this.#kept.keys().next().value
    if (oldest !== undefined) this.#kept.delete(oldest)
  }
}

type Raw = Pick<ToolLedgerStore, 'read' | 'readRecord' | 'commit'>

export function keeping(keeper: LedgerKeeper, raw: Raw): Raw {
  const keyOf = (domain: LedgerDomain): string => JSON.stringify(domain)

  const whole = async (domain: LedgerDomain, key: string): Promise<LedgerRead> => {
    const mark = keeper.crossings.mark()
    const answer = await raw.read(domain)
    if (answer.kind === 'complete' && !keeper.crossings.crossed(key, mark))
      keeper.set(key, snapshotOf(answer))
    return answer
  }

  const ask = async (
    domain: LedgerDomain,
    key: string,
    record: string,
  ): Promise<LedgerRecordRead> => {
    const mark = keeper.crossings.mark()
    const answer = await raw.readRecord(domain, record)
    if (answer.kind === 'complete' && !keeper.crossings.crossed(key, mark))
      keeper.set(key, judged(keeper.get(key), answer, record))
    return answer
  }

  const read = async (domain: LedgerDomain): Promise<LedgerRead> => {
    const key = keyOf(domain)
    const plan = planRead(keeper.get(key))
    return plan.kind === 'answer' ? plan.read : whole(domain, key)
  }

  const readRecord = async (domain: LedgerDomain, record: string): Promise<LedgerRecordRead> => {
    const key = keyOf(domain)
    const plan = planRecord(keeper.get(key), record)
    return plan.kind === 'answer' ? plan.read : ask(domain, key, record)
  }

  const commit = async (input: LedgerCommitInput): Promise<LedgerCommit> => {
    const key = keyOf(input.domain)
    let answer: LedgerCommit
    try {
      answer = await keeper.crossings.during(key, () => raw.commit(input))
    } catch (error) {
      keeper.set(key, null)
      throw error
    }
    keeper.set(key, afterCommit(keeper.get(key), input, answer))
    if (answer.kind === 'conflict')
      for (const assertion of input.asserts ?? []) {
        const asserted = keyOf(assertion.domain)
        if (refuted(keeper.get(asserted), assertion.revision)) keeper.set(asserted, null)
      }
    return answer
  }

  return { read, readRecord, commit }
}
