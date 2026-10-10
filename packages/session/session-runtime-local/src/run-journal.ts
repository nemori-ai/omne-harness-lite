import { createModelHistoryOwner } from './model-history-owner.ts'
import { StorageUnavailable, type StorageUnit } from '@omne-harness-lite/storage'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { copyJsonValue, isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import {
  checkAppendInput,
  checkKey,
  compareInteger,
  checkSourceToken,
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

function reusableProjectionSource(
  before: import('@omne-harness-lite/session-log').SourceToken | undefined,
  source: import('@omne-harness-lite/session-log').SourceToken,
): before is import('@omne-harness-lite/session-log').SourceToken {
  return (
    before !== undefined &&
    before.session === source.session &&
    tenantIdEquals(before.tenant, source.tenant) &&
    before.journalGeneration === source.journalGeneration &&
    compareInteger(before.tail, source.tail) <= 0
  )
}

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
  const ports = new WeakMap<BorrowedRunJournal, BoundRunJournal>()
  const history = createModelHistoryOwner(host.options.policy)
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
      const readIn = await host.options.storage.atomic(unit =>
        unit.run(() => host.authority.bindRun(unit, scope, run)),
      )
      const owner = new BoundRunJournal(host, scope, run, readIn, () => {
        history.release(owner.port)
        borrows.delete(owner)
      })
      borrows.add(owner)
      ports.set(owner.port, owner)
      return { journal: owner.port }
    } catch (error) {
      return borrowFailure(error)
    } finally {
      reservations--
    }
  }
  return Object.freeze({
    operations: Object.freeze({ borrow }),
    readModelHistory(journal: BorrowedRunJournal) {
      const owner = ports.get(journal)
      if (owner === undefined) return Promise.resolve({ failure: 'unavailable' as const })
      return owner.operation(
        () =>
          history.read(
            journal,
            previous => owner.projection(previous),
            () => owner.prefix(),
          ),
        { failure: 'unavailable' as const },
      )
    },
    async close() {
      open = false
      const outcomes = await Promise.allSettled([...borrows].map(b => b.returned))
      const errors = outcomes.filter(r => r.status === 'rejected').map(r => r.reason)
      if (errors.length) throw new AggregateError(errors, 'original Run journals retained')
      history.clear()
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
    readonly readIn: Awaited<ReturnType<Host['authority']['bindRun']>>,
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
        this.operation(() => this.inReadUnit(async unit => ({ read: await read(unit) })), {
          unavailable: true as const,
        }),
      readPrefix: () => this.operation(() => this.prefix(), { failure: 'unavailable' as const }),
      readProjection: previous =>
        this.operation(() => this.projection(previous), { failure: 'unavailable' as const }),
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
      return this.operation(() => this.since(fixed), {
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
  inReadUnit<T>(action: (unit: StorageUnit) => Promise<T>) {
    return this.host.options.storage.atomic(unit =>
      unit.run(() => this.readIn(unit, () => action(unit))),
    )
  }
  async prefix() {
    return this.inReadUnit(async unit => {
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
  async since(after: import('@omne-harness-lite/session-log').SourceToken['tail']) {
    return this.inReadUnit(async unit => {
      const current = await this.host.log.sourceIn(unit, this.host.authority.logAccess, this.scope)
      if ('failure' in current) return { failure: 'unavailable' as const }
      const cursor = compareInteger(after, current.source.tail) > 0 ? current.source.tail : after
      const result = await this.host.log.readSinceIn(
        unit,
        this.host.authority.logAccess,
        current.source,
        cursor,
      )
      return 'failure' in result
        ? { failure: 'unavailable' as const }
        : { entries: result.entries, tail: result.source.tail }
    })
  }
  async projection(previous: import('@omne-harness-lite/session-log').SourceToken | null) {
    const checked = previous === null ? null : checkSourceToken(previous)
    if (checked && 'failure' in checked) throw new TypeError('invalid previous projection source')
    return this.inReadUnit(async unit => {
      const coordinate = await this.host.log.sourceIn(
        unit,
        this.host.authority.logAccess,
        this.scope,
      )
      if ('failure' in coordinate) return { failure: 'unavailable' as const }
      const source = coordinate.source
      const before = checked?.ok
      if (reusableProjectionSource(before, source)) {
        const result = await this.host.log.readSinceIn(
          unit,
          this.host.authority.logAccess,
          source,
          before.tail,
        )
        return 'failure' in result ? { failure: 'unavailable' as const } : result
      }
      const result = await this.host.log.readPrefixIn(unit, this.host.authority.logAccess, source)
      return 'failure' in result ? { failure: 'unavailable' as const } : result
    })
  }
  async append(request: AppendRequest): Promise<AppendResult> {
    try {
      return await this.host.options.storage.atomic(unit =>
        unit.run(() =>
          this.host.authority.withinRun(unit, this.scope, this.run, async () => {
            const staged = await this.host.log.appendIn(
              unit,
              this.host.authority.logAccess,
              request,
            )
            if ('failure' in staged) throw new AppendRefusal(appendFailure(staged))
            return { positions: staged.entries.map(e => e.position), tail: staged.nextTail }
          }),
        ),
      )
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
