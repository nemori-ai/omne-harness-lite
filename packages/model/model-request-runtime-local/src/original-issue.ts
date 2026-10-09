import { randomUUID } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { copyJsonValue, readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  inspectModelLogEntry,
  modelLogJsonEqual,
  type OriginalIssueInput,
  type OriginalIssueTicket,
  type OriginalIssueClaim,
  type OriginalIssueIdentity,
  type OriginalIssueAuthority,
  type OriginalIssueParticipant,
  type OriginalIssueStage,
  type OriginalIssueFailure,
  type OriginalIssueOwner,
} from '@omne-harness-lite/model-request-runtime'
import {
  checkAppendRequest,
  checkKey,
  checkSourceToken,
  type AppendRequest,
  type LogAuthority,
  type LogEntry,
  type SessionLogParticipant,
} from '@omne-harness-lite/session-log'
import {
  narrow,
  StorageDefect,
  StorageUnavailable,
  type AtomicStorage,
  type StorageUnit,
} from '@omne-harness-lite/storage'
interface Row {
  session: string
  call: string
  dispatch: string
  tenant: string
  owner_generation: string
  original_position: string
  value: string
}
interface Database {
  mr_original_issue: Row
}
interface Prepared {
  readonly source: OriginalIssueInput['source']
  readonly identity: OriginalIssueIdentity
  readonly request: AppendRequest
  readonly value: string
}
interface HeldClaim {
  readonly entries: readonly LogEntry[]
  readonly prepared: Prepared
  readonly completion: Promise<'committed' | 'rolledBack' | 'unknown'>
  consumed: boolean
}
const owners = new WeakSet<object>()
const invalid: OriginalIssueFailure = { kind: 'invalidInput' },
  unavailable: OriginalIssueFailure = { kind: 'unavailable' },
  conflict: OriginalIssueFailure = { kind: 'conflict' }
export interface OriginalIssueOwnerOptions {
  readonly storage: AtomicStorage
  readonly log: SessionLogParticipant
  readonly access: LogAuthority
  readonly authority: OriginalIssueAuthority
  readonly limit: number
}
export type { OriginalIssueOwner } from '@omne-harness-lite/model-request-runtime'
function prepared(input: OriginalIssueInput, generation: string): Prepared | undefined {
  const value = captureInput(input)
  if (value === undefined) return undefined
  const source = checkSourceToken(value.source)
  if ('failure' in source) return undefined
  const inspected = inspectModelLogEntry({
    session: source.ok.session,
    tenant: source.ok.tenant,
    entry: { ...value.entry, session: source.ok.session, position: 1 },
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if ('invalidValue' in inspected || inspected.ok.captured.record?.kind !== 'model_call_dispatched')
    return undefined
  const record = inspected.ok.captured.record
  const request = checkAppendRequest({
    session: source.ok.session,
    entries: [value.entry],
    fence:
      value.entry.run === undefined
        ? { kind: 'unfenced' }
        : { kind: 'fenced', run: value.entry.run, attempt: value.entry.attempt },
    condition: { kind: 'tailEquals', tail: source.ok.tail },
  })
  if ('failure' in request) return undefined
  const identity: OriginalIssueIdentity = Object.freeze({
    tenant: source.ok.tenant,
    session: source.ok.session,
    call: record.call,
    dispatch: record.dispatch,
    executionGeneration: generation,
    originalPosition: value.originalPosition,
    ...(value.entry.run === undefined
      ? {}
      : { run: value.entry.run, attempt: value.entry.attempt }),
  })
  const entryJson = copyJsonValue(request.ok.entries[0]!)
  if ('failed' in entryJson) throw new StorageDefect('owned original entry is not JSON')
  return {
    source: source.ok,
    identity,
    request: request.ok,
    value: writeJsonLossless(entryJson.ok),
  }
}
function captureInput(input: OriginalIssueInput): OriginalIssueInput | undefined {
  const copy = copyJsonValue(input)
  if ('failed' in copy || !copy.ok || typeof copy.ok !== 'object' || Array.isArray(copy.ok))
    return undefined
  const value = copy.ok as unknown as OriginalIssueInput
  if (
    Object.keys(value).length !== 3 ||
    !['source', 'originalPosition', 'entry'].every(name => Object.hasOwn(value, name)) ||
    !checkKey(value.originalPosition)
  )
    return undefined
  return value
}
function dispatchText(identity: OriginalIssueIdentity): string {
  return ExactDecimal.from(identity.dispatch).toCanonicalString()
}
function sameOriginal(row: Row, input: Prepared): boolean {
  const copy = readJsonStrict(row.value)
  return (
    'ok' in copy &&
    row.tenant === writeJsonLossless(input.identity.tenant) &&
    row.original_position === input.identity.originalPosition &&
    modelLogJsonEqual(copy.ok, input.request.entries[0])
  )
}
/** One model execution owner per storage. Storage and log are borrowed until every claim is resolved. */
export function createOriginalIssueOwner(options: OriginalIssueOwnerOptions): OriginalIssueOwner {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1)
    throw new TypeError('positive original issue limit required')
  if (owners.has(options.storage)) throw new TypeError('duplicate original model execution owner')
  owners.add(options.storage)
  const generation = randomUUID(),
    tickets = new WeakMap<OriginalIssueTicket, Prepared>(),
    claims = new WeakMap<OriginalIssueClaim, HeldClaim>()
  const pending = new Set<HeldClaim>(),
    active = new Set<Promise<unknown>>()
  let admitting = true,
    closed = false,
    reserved = 0
  function watch<T>(operation: () => Promise<T>): Promise<T> {
    const task = Promise.resolve().then(operation)
    active.add(task)
    void task.then(
      () => active.delete(task),
      () => active.delete(task),
    )
    return task
  }
  async function stage(
    unit: StorageUnit,
    ticket: OriginalIssueTicket,
  ): Promise<OriginalIssueStage> {
    const input = tickets.get(ticket)
    if (input === undefined) return invalid
    if (!admitting || pending.size + reserved >= options.limit) return unavailable
    if (!sameUnit(unit)) return invalid
    reserved += 1
    try {
      return await watch(() => unit.run(() => stageOwned(unit, input)))
    } finally {
      reserved -= 1
    }
  }
  function sameUnit(unit: StorageUnit): boolean {
    try {
      unit.assertStorage(options.storage)
      return true
    } catch (error) {
      if (error instanceof StorageDefect) return false
      throw error
    }
  }
  async function stageOwned(unit: StorageUnit, input: Prepared): Promise<OriginalIssueStage> {
    const identity = input.identity
    await unit.mutate(tx => tx.lockSentinel(`model-original:${identity.session}:${identity.call}`))
    const permission = await options.authority.authorizeIn(unit, identity)
    if (permission.kind !== 'authorized') return permission
    const existing = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('mr_original_issue')
        .selectAll()
        .where('session', '=', identity.session)
        .where('call', '=', identity.call)
        .where('dispatch', '=', dispatchText(identity))
        .executeTakeFirst(),
    )
    if (existing !== undefined)
      return sameOriginal(existing, input)
        ? {
            kind: 'alreadyIssued',
            identity: Object.freeze({
              ...identity,
              executionGeneration: existing.owner_generation,
            }),
          }
        : conflict
    const logged = await options.log.appendIn(unit, options.access, input.request, input.source)
    if ('failure' in logged) return logFailure(logged.failure)
    await unit.mutate(tx =>
      narrow<Database>(tx)
        .insertInto('mr_original_issue')
        .values({
          session: identity.session,
          call: identity.call,
          dispatch: dispatchText(identity),
          tenant: writeJsonLossless(identity.tenant),
          owner_generation: generation,
          original_position: identity.originalPosition,
          value: input.value,
        })
        .execute(),
    )
    const claim = Object.freeze({}) as OriginalIssueClaim
    const held: HeldClaim = {
      entries: logged.entries,
      prepared: input,
      completion: unit.observeCompletion(),
      consumed: false,
    }
    claims.set(claim, held)
    pending.add(held)
    // Only an observed rollback proves this claim cannot authorize execution.
    void watch(async () => {
      if ((await held.completion) === 'rolledBack') pending.delete(held)
    })
    return {
      kind: 'staged',
      claim,
      identity,
      positions: Object.freeze(logged.entries.map(entry => entry.position)),
    }
  }
  function logFailure(
    failure: import('@omne-harness-lite/session-log').LogParticipationFailure['failure'],
  ): OriginalIssueFailure {
    switch (failure) {
      case 'denied':
      case 'staleAttempt':
        return { kind: failure }
      case 'unavailable':
        return unavailable
      default:
        return conflict
    }
  }
  async function recognizes(held: HeldClaim): Promise<boolean> {
    const identity = held.prepared.identity
    let row: Row | undefined
    try {
      row = await options.storage.read(tx =>
        narrow<Database>(tx)
          .selectFrom('mr_original_issue')
          .selectAll()
          .where('session', '=', identity.session)
          .where('call', '=', identity.call)
          .where('dispatch', '=', dispatchText(identity))
          .executeTakeFirst(),
      )
    } catch (error) {
      if (error instanceof StorageUnavailable) return false
      throw error
    }
    if (
      row === undefined ||
      row.owner_generation !== generation ||
      !sameOriginal(row, held.prepared)
    )
      return false
    return recognizesLog(held)
  }
  async function recognizesLog(held: HeldClaim): Promise<boolean> {
    const last = held.entries.at(-1)
    if (last === undefined) throw new StorageDefect('original claim has no staged entry')
    const prefix = await options.log.readPrefix(options.access, {
      ...held.prepared.source,
      tail: last.position,
    })
    if ('failure' in prefix) return false
    for (const expected of held.entries) {
      const actual = prefix.entries.find(
        entry =>
          ExactDecimal.from(entry.position).compare(ExactDecimal.from(expected.position)) === 0,
      )
      if (actual === undefined || !modelLogJsonEqual(actual, expected)) return false
    }
    return true
  }
  const participant = Object.freeze<OriginalIssueParticipant>({ stageOriginalIn: stage })
  return Object.freeze<OriginalIssueOwner>({
    participant,
    prepareOriginal(input) {
      if (!admitting) return unavailable
      const captured = prepared(input, generation)
      if (captured === undefined) return invalid
      const ticket = Object.freeze({}) as OriginalIssueTicket
      tickets.set(ticket, captured)
      return { ticket }
    },
    admitOriginal(input) {
      if (!admitting || active.size >= options.limit) return Promise.resolve(unavailable)
      return watch(async () => {
        const captured = prepared(input, generation)
        if (captured === undefined) return invalid
        const ticket = Object.freeze({}) as OriginalIssueTicket
        tickets.set(ticket, captured)
        try {
          const result = await options.storage.atomic(unit => stage(unit, ticket))
          return result.kind === 'staged'
            ? { confirmed: true as const, positions: result.positions, claim: result.claim }
            : result.kind === 'alreadyIssued'
              ? conflict
              : result
        } catch (error) {
          if (error instanceof StorageUnavailable) return unavailable
          throw error
        }
      })
    },
    consumeOriginal(claim) {
      const held = claims.get(claim)
      if (held === undefined) return Promise.resolve(invalid)
      if (!admitting || held.consumed) return Promise.resolve(unavailable)
      held.consumed = true
      return watch(async () => {
        if ((await held.completion) !== 'committed') return unavailable
        try {
          const authorized = await options.storage.atomic(unit =>
            unit.run(() => options.authority.authorizeIn(unit, held.prepared.identity)),
          )
          if (authorized.kind !== 'authorized') return authorized
          if (!admitting) return unavailable
          return { kind: 'launch' as const }
        } catch (error) {
          if (error instanceof StorageUnavailable) return unavailable
          throw error
        } finally {
          pending.delete(held)
        }
      })
    },
    async close() {
      if (closed) return { kind: 'released' as const }
      admitting = false
      // Staging can register a completion observer while close waits for that stage.
      while (active.size !== 0) await Promise.all([...active])
      for (const held of pending) {
        if (!(await recognizes(held))) return { kind: 'pending' as const }
        pending.delete(held)
      }
      if (pending.size !== 0) return { kind: 'pending' as const }
      closed = true
      owners.delete(options.storage)
      return { kind: 'released' as const }
    },
  })
}
