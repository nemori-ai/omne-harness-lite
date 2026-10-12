import {
  captureModelLogHistory,
  type ModelLogHistory,
  type SettlementLogBinding,
} from '@omne-harness-lite/model-request-runtime'
import { compareInteger } from '@omne-harness-lite/session-log'
import type { RuntimePolicy } from './runtime-types.ts'
import type { BorrowedRunJournal } from './run-journal-types.ts'

type Amount = { entries: number; bytes: number; references: number }
interface Family {
  readonly amount: Amount
  pins: number
  cached: boolean
}
interface Head {
  readonly history: ModelLogHistory
  readonly family: Family
  readonly serial: number
}
type ReadResult = Awaited<ReturnType<NonNullable<SettlementLogBinding['readPrefix']>>>
type ProjectionRead = Exclude<
  Awaited<ReturnType<BorrowedRunJournal['readProjection']>>,
  { readonly failure: unknown }
>
interface CapturedRead {
  readonly history: ModelLogHistory
  readonly base: Head | undefined
}
function captureRead(
  previous: Head | undefined,
  read: ProjectionRead,
): CapturedRead | { readonly failure: 'invalidPrefix' } {
  const base =
    previous !== undefined &&
    previous.history.source.journalGeneration === read.source.journalGeneration &&
    compareInteger(previous.history.tail, read.source.tail) <= 0
      ? previous
      : undefined
  const result =
    base !== undefined && compareInteger(base.history.tail, read.source.tail) === 0
      ? { history: base.history }
      : captureModelLogHistory(base?.history ?? null, {
          entries: read.entries,
          source: read.source,
        })
  return 'failure' in result ? result : { history: result.history, base }
}
function retainedCharge({ history, base }: CapturedRead): Amount {
  if (history === base?.history) return zero()
  return {
    entries: history.length - (base?.history.length ?? 0),
    bytes: history.retainedBytes - (base?.history.retainedBytes ?? 0),
    references: history.indexReferences - (base?.history.indexReferences ?? 0) + 16,
  }
}
const zero = (): Amount => ({ entries: 0, bytes: 0, references: 0 })
function change(total: Amount, value: Amount, direction: number) {
  total.entries += direction * value.entries
  total.bytes += direction * value.bytes
  total.references += direction * value.references
}
/** A family counts shared content once and retains branch allocations until its borrows drain. */
export function createModelHistoryOwner(policy: RuntimePolicy) {
  const heads = new Map<string, Head>()
  const retained = zero()
  const borrowers = new Map<BorrowedRunJournal, Set<Family>>()
  let serial = 0
  function retire(family: Family) {
    family.cached = false
    if (family.pins === 0) change(retained, family.amount, -1)
  }
  function release(journal: BorrowedRunJournal) {
    for (const family of borrowers.get(journal) ?? []) {
      family.pins--
      if (family.pins === 0 && !family.cached) change(retained, family.amount, -1)
    }
    borrowers.delete(journal)
  }
  function fits(value: Amount) {
    const limit = policy.modelHistory
    return (
      limit !== undefined &&
      retained.entries + value.entries <= limit.maxEntries &&
      retained.bytes + value.bytes <= limit.maxContentBytes &&
      retained.references + value.references <= limit.maxIndexReferences
    )
  }
  function pin(journal: BorrowedRunJournal, family: Family) {
    let pins = borrowers.get(journal)
    if (pins === undefined) {
      pins = new Set()
      borrowers.set(journal, pins)
    }
    if (!pins.has(family)) {
      pins.add(family)
      family.pins++
    }
  }
  async function read(
    journal: BorrowedRunJournal,
    projection: BorrowedRunJournal['readProjection'],
    prefix: BorrowedRunJournal['readPrefix'],
  ): Promise<ReadResult> {
    if (policy.modelHistory === undefined) return prefix()
    const order = ++serial
    const key = JSON.stringify([journal.scope.tenant, journal.scope.session])
    const previous = heads.get(key)
    if (previous !== undefined) pin(journal, previous.family)
    const read = await projection(previous?.history.source ?? null)
    if ('failure' in read) return { failure: 'unavailable' }
    const captured = captureRead(previous, read)
    if ('failure' in captured) return prefix()
    if (journal.currentGeneration() !== journal.generation) return { failure: 'unavailable' }
    return retain(journal, key, order, captured) ? { history: captured.history } : prefix()
  }
  function canRetain(key: string, charge: Amount): boolean {
    return fits(charge) && (heads.has(key) || heads.size < policy.maxSessions)
  }
  function makeRoom(key: string, family: Family, charge: Amount): boolean {
    for (const [oldKey, old] of heads) {
      if (canRetain(key, charge)) break
      if (old.family === family || old.family.pins > 0) continue
      heads.delete(oldKey)
      retire(old.family)
    }
    return canRetain(key, charge)
  }
  function publish(key: string, order: number, history: ModelLogHistory, family: Family) {
    const current = heads.get(key)
    const later =
      current === undefined ||
      (current.history.source.journalGeneration === history.source.journalGeneration
        ? compareInteger(current.history.tail, history.tail) < 0
        : current.serial < order)
    if (!later) return
    if (current !== undefined && current.family !== family) retire(current.family)
    family.cached = true
    heads.set(key, { history, family, serial: order })
  }
  function retain(
    journal: BorrowedRunJournal,
    key: string,
    order: number,
    captured: CapturedRead,
  ): boolean {
    const family = captured.base?.family ?? { amount: zero(), pins: 0, cached: false }
    const charge = retainedCharge(captured)
    if (!makeRoom(key, family, charge)) {
      if (heads.get(key)?.family === family) {
        heads.delete(key)
        retire(family)
      }
      return false
    }
    change(family.amount, charge, 1)
    change(retained, charge, 1)
    pin(journal, family)
    publish(key, order, captured.history, family)
    return true
  }
  return {
    read,
    release,
    clear() {
      for (const head of heads.values()) retire(head.family)
      heads.clear()
    },
  }
}
