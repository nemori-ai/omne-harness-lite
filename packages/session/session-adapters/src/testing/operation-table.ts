import type { AgentExecutionId } from '@omne-harness/agent-contract'
import { SharedMap } from '../journal/shared-map.ts'
import type { OperationRecord } from './journal.ts'

type Indexed = Extract<OperationRecord, { kind: 'pending' | 'excluded' }>
type Keys = SharedMap<string, true>

const indexedKind = (record: OperationRecord | undefined): record is Indexed =>
  record?.kind === 'pending' || record?.kind === 'excluded'

// The operation records of a session. Each execution's pending and excluded records are kept at hand, so asking for
// them costs what they are, not what the session ever recorded. Forks share everything, as SharedMap does.
export class OperationTable implements Map<string, OperationRecord> {
  #records: SharedMap<string, OperationRecord>
  #index: Readonly<{ pending: SharedMap<string, Keys>; excluded: SharedMap<string, Keys> }>

  constructor(entries?: Iterable<readonly [string, OperationRecord]> | null) {
    this.#records = new SharedMap()
    this.#index = { pending: new SharedMap(), excluded: new SharedMap() }
    for (const [key, record] of entries ?? []) this.set(key, record)
  }

  fork(): OperationTable {
    const fork = new OperationTable()
    fork.#records = this.#records.fork()
    fork.#index = { pending: this.#index.pending.fork(), excluded: this.#index.excluded.fork() }
    return fork
  }

  *pendingOf(
    execution: AgentExecutionId,
  ): Generator<readonly [string, Extract<OperationRecord, { kind: 'pending' }>]> {
    for (const key of this.#index.pending.get(execution)?.keys() ?? []) {
      const record = this.#records.get(key)
      if (record?.kind === 'pending') yield [key, record]
    }
  }

  *excludedOf(
    execution: AgentExecutionId,
  ): Generator<readonly [string, Extract<OperationRecord, { kind: 'excluded' }>]> {
    for (const key of this.#index.excluded.get(execution)?.keys() ?? []) {
      const record = this.#records.get(key)
      if (record?.kind === 'excluded') yield [key, record]
    }
  }

  #move(key: string, record: OperationRecord | undefined, present: boolean): void {
    if (!indexedKind(record)) return
    const table = this.#index[record.kind]
    const keys = table.get(record.execution)?.fork() ?? new SharedMap<string, true>()
    if (present) keys.set(key, true)
    else keys.delete(key)
    if (keys.size === 0) table.delete(record.execution)
    else table.set(record.execution, keys)
  }

  get size(): number {
    return this.#records.size
  }

  get(key: string): OperationRecord | undefined {
    return this.#records.get(key)
  }

  has(key: string): boolean {
    return this.#records.has(key)
  }

  set(key: string, record: OperationRecord): this {
    this.#move(key, this.#records.get(key), false)
    this.#records.set(key, record)
    this.#move(key, record, true)
    return this
  }

  delete(key: string): boolean {
    const record = this.#records.get(key)
    if (record === undefined) return false
    this.#move(key, record, false)
    return this.#records.delete(key)
  }

  clear(): void {
    this.#records = new SharedMap()
    this.#index = { pending: new SharedMap(), excluded: new SharedMap() }
  }

  forEach(
    callback: (value: OperationRecord, key: string, map: Map<string, OperationRecord>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.#records) callback.call(thisArg, value, key, this)
  }

  entries(): MapIterator<[string, OperationRecord]> {
    return this.#records.entries()
  }

  keys(): MapIterator<string> {
    return this.#records.keys()
  }

  values(): MapIterator<OperationRecord> {
    return this.#records.values()
  }

  [Symbol.iterator](): MapIterator<[string, OperationRecord]> {
    return this.entries()
  }

  get [Symbol.toStringTag](): string {
    return 'OperationTable'
  }
}
