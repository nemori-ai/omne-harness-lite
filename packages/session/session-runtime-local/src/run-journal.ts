import { StorageUnavailable, type StorageUnit } from '@omne-harness-lite/storage'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { copyJsonValue, isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import {
  checkAppendInput,
  checkKey,
  compareInteger,
  type AppendResult,
  type AppendRequest,
  type SessionLogParticipant,
  type LogParticipationFailure,
  type SessionLog,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import type { RuntimeOptions } from './runtime-types.ts'
import type { runtimeAuthority } from './runtime-authority.ts'
import type { BorrowedRunJournal, OriginalRunJournal } from './run-journal-types.ts'
import { stateScope, InvalidStateInput } from './state-values.ts'
import { CoordinationRejection, boundedText } from './coordination-values.ts'

interface Host {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly log: SessionLogParticipant
}
class AppendRefusal extends Error {
  constructor(readonly outcome: AppendResult) {
    super('original Run append refused')
  }
}
/** Owns only trusted log borrows. Physical storage and journal remain borrowed. */
export function createOriginalRunJournal(host: Host) {
  const borrows = new Set<BoundRunJournal>()
  let reservations = 0,
    open = true
  const borrow: OriginalRunJournal['borrow'] = async (authority, requested, run) => {
    if (!open || reservations + borrows.size >= host.options.policy.maxInFlight)
      return { failure: 'unavailable' }
    if (authority !== host.authority.coordination) return { failure: 'denied' }
    reservations++
    try {
      const scope = stateScope(requested)
      if (!tenantIdEquals(scope.tenant, host.options.tenant)) return { failure: 'denied' }
      if (!checkKey(run)) return { failure: 'invalidInput' }
      await host.options.storage.atomic(unit =>
        unit.run(() => host.authority.withinRun(unit, scope, run, async () => undefined)),
      )
      const owner = new BoundRunJournal(host, scope, run, () => borrows.delete(owner))
      borrows.add(owner)
      return { journal: owner.port }
    } catch (error) {
      return borrowFailure(error)
    } finally {
      reservations--
    }
  }
  return Object.freeze({
    operations: Object.freeze({ borrow }),
    async close() {
      open = false
      const outcomes = await Promise.allSettled([...borrows].map(b => b.returned))
      const errors = outcomes.filter(r => r.status === 'rejected').map(r => r.reason)
      if (errors.length) throw new AggregateError(errors, 'original Run journals retained')
    },
  })
}
class BoundRunJournal {
  readonly pending = new Set<Promise<unknown>>()
  readonly returned: Promise<void>
  private returnedResolve!: () => void
  private returnedReject!: (error: unknown) => void
  private closed: Promise<void> | undefined
  private open = true
  readonly generation = Object.freeze({})
  readonly port: BorrowedRunJournal
  constructor(
    readonly host: Host,
    readonly scope: BorrowedRunJournal['scope'],
    readonly run: string,
    readonly release: () => void,
  ) {
    this.returned = new Promise((resolve, reject) => {
      this.returnedResolve = resolve
      this.returnedReject = reject
    })
    // The borrower receives close errors too; the owner may start draining later.
    void this.returned.catch(() => undefined)
    this.port = Object.freeze<BorrowedRunJournal>({
      scope,
      run,
      generation: this.generation,
      currentGeneration: () => (this.open ? this.generation : null),
      log: Object.freeze(this.log),
      withReadUnit: read =>
        this.operation(() => this.inUnit(async unit => ({ read: await read(unit) })), {
          unavailable: true as const,
        }),
      readPrefix: () => this.operation(() => this.prefix(), { failure: 'unavailable' as const }),
      close: this.close,
    })
  }
  readonly log: SessionLog = {
    append: (session, entries, fence, condition) => {
      const checked = checkAppendInput(session, entries, fence, condition)
      if ('failure' in checked || !this.matches(checked.ok))
        return Promise.resolve({ failure: 'invalidInput' })
      try {
        boundedText(checked.ok, this.host.options.policy.maxRecordBytes)
      } catch (error) {
        if (error instanceof InvalidStateInput) return Promise.resolve({ failure: 'invalidInput' })
        throw error
      }
      return this.operation(() => this.append(checked.ok), { failure: 'unavailable' as const })
    },
    readByKey: (session, key) => {
      if (session !== this.scope.session || !checkKey(key))
        return Promise.resolve({ failure: 'invalidInput' })
      return this.operation(() => this.read(entry => entry.readKeys.includes(key)), {
        failure: 'unavailable' as const,
      })
    },
    readSince: (session, after) => {
      const copied = copyJsonValue(after)
      if (
        session !== this.scope.session ||
        'failed' in copied ||
        !isNonNegativeJsonInteger(copied.ok)
      )
        return Promise.resolve({ failure: 'invalidInput' })
      const fixed = copied.ok
      return this.operation(() => this.read(entry => compareInteger(entry.position, fixed) > 0), {
        failure: 'unavailable' as const,
      })
    },
  }
  matches(request: AppendRequest) {
    return (
      request.session === this.scope.session &&
      request.entries.every(
        e =>
          tenantIdEquals(e.tenant, this.scope.tenant) &&
          (e.run === undefined || e.run === this.run),
      ) &&
      (request.fence.kind !== 'fenced' || request.fence.run === this.run)
    )
  }
  inUnit<T>(action: (unit: StorageUnit) => Promise<T>) {
    return this.host.options.storage.atomic(unit =>
      unit.run(() => this.host.authority.withinRun(unit, this.scope, this.run, () => action(unit))),
    )
  }
  async prefix() {
    return this.inUnit(async unit => {
      const coordinate = await this.host.log.sourceIn(
        unit,
        this.host.authority.logAccess,
        this.scope,
      )
      if ('failure' in coordinate) return { failure: 'unavailable' as const }
      const prefix = await this.host.log.readPrefixIn(
        unit,
        this.host.authority.logAccess,
        coordinate.source,
      )
      if ('failure' in prefix) return { failure: 'unavailable' as const }
      return { entries: prefix.entries, tail: prefix.source.tail, source: prefix.source }
    })
  }
  async read(filter: (entry: LogEntry) => boolean) {
    const prefix = await this.prefix()
    if ('failure' in prefix) return prefix
    return { entries: prefix.entries.filter(filter), tail: prefix.tail }
  }
  async append(request: AppendRequest): Promise<AppendResult> {
    try {
      return await this.inUnit(async unit => {
        const staged = await this.host.log.appendIn(unit, this.host.authority.logAccess, request)
        if ('failure' in staged) throw new AppendRefusal(appendFailure(staged))
        return { positions: staged.entries.map(e => e.position), tail: staged.nextTail }
      })
    } catch (error) {
      if (error instanceof AppendRefusal) return error.outcome
      throw error
    }
  }
  async operation<T, F>(work: () => Promise<T>, unavailable: F): Promise<T | F> {
    if (!this.open || this.pending.size >= this.host.options.policy.maxInFlight) return unavailable
    const promise = work()
    this.pending.add(promise)
    try {
      return await promise
    } catch (error) {
      if (error instanceof StorageUnavailable) return unavailable
      throw error
    } finally {
      this.pending.delete(promise)
    }
  }
  close = () => {
    this.open = false
    this.closed ??= this.drain()
    return this.closed
  }
  async drain() {
    const results = await Promise.allSettled([...this.pending])
    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason)
    if (errors.length) {
      const error = new AggregateError(errors, 'original Run journal drain failed')
      this.returnedReject(error)
      throw error
    }
    this.release()
    this.returnedResolve()
  }
}
function appendFailure(result: LogParticipationFailure): AppendResult {
  if (result.failure === 'staleAttempt') return { failure: 'attemptSuperseded' }
  if (result.failure === 'conditionFailed') return { failure: 'tailChanged', tail: result.tail }
  if (result.failure === 'dedupeConflict') return { failure: 'alreadyRecorded', keys: result.keys }
  return { failure: result.failure === 'invalidInput' ? 'invalidInput' : 'unavailable' }
}

function borrowFailure(
  error: unknown,
): Extract<Awaited<ReturnType<OriginalRunJournal['borrow']>>, { failure: string }> {
  if (error instanceof CoordinationRejection && error.failure === 'denied')
    return { failure: 'denied' }
  if (error instanceof InvalidStateInput) return { failure: 'invalidInput' }
  if (error instanceof StorageUnavailable) return { failure: 'unavailable' }
  throw error
}
