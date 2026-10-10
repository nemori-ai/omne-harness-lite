import { narrow, StorageDefect, type StorageUnit } from '@omne-harness-lite/storage'
import {
  compareInteger,
  type SourceToken,
  type SessionLogParticipant,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import {
  readSessionFact,
  type SessionHead,
  type StepReceipt,
} from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { RuntimeOptions, LocalSessionIngress } from './runtime-types.ts'
import type { LocalSessionState } from './state-types.ts'
import type { runtimeAuthority } from './runtime-authority.ts'
import { stateRow, stateHead } from './state-store.ts'
import { CoordinationRejection } from './coordination-values.ts'
import { verifyCallPreparation } from './call-preparation.ts'
import { readFirstAttemptStep } from './coordination-store.ts'

type Recovered = Extract<
  Awaited<ReturnType<LocalSessionIngress['resumePreparedCall']>>,
  { kind: 'prepared' }
>
interface Host {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly state: LocalSessionState
  readonly log: SessionLogParticipant
}
function exactSource(current: SourceToken, expected: SourceToken) {
  if (
    current.journalGeneration !== expected.journalGeneration ||
    compareInteger(current.tail, expected.tail) !== 0
  )
    throw new CoordinationRejection('retryFromFacts')
}
function firstAttempt(entry: LogEntry, run: NonNullable<SessionHead['run']>) {
  const parsed = readSessionFact(entry)
  if (!('fact' in parsed) || parsed.fact.kind !== 'attempt_started')
    throw new CoordinationRejection('retryFromFacts')
  const fact = parsed.fact
  if (
    fact.reason !== 'first' ||
    fact.run !== run.id ||
    compareInteger(fact.attempt, 1) !== 0 ||
    run.attempt === null ||
    compareInteger(fact.attempt, run.attempt) !== 0
  )
    throw new CoordinationRejection('retryFromFacts')
}
function preparedFact(entry: LogEntry, run: NonNullable<SessionHead['run']>) {
  const parsed = readSessionFact(entry)
  if (!('fact' in parsed) || parsed.fact.kind !== 'call_prepared')
    throw new CoordinationRejection('retryFromFacts')
  const fact = parsed.fact
  if (
    fact.run !== run.id ||
    run.attempt === null ||
    compareInteger(fact.attempt, run.attempt) !== 0
  )
    throw new CoordinationRejection('retryFromFacts')
  return {
    kind: 'prepareCall' as const,
    stepKey: fact.stepKey,
    run: fact.run,
    attempt: fact.attempt,
    call: fact.call,
    originalPosition: fact.originalPosition,
  }
}
function originalPreparation(entries: readonly LogEntry[], run: NonNullable<SessionHead['run']>) {
  const last = entries.at(-1)
  const previous = entries.at(-2)
  if (!last || !previous) throw new CoordinationRejection('retryFromFacts')
  firstAttempt(previous, run)
  return { last, previous, data: preparedFact(last, run) }
}
function receiptPosition(receipt: StepReceipt, entry: LogEntry, source: SourceToken) {
  if (
    compareInteger(receipt.position, entry.position) !== 0 ||
    compareInteger(receipt.source.tail, entry.position) !== 0 ||
    receipt.source.journalGeneration !== source.journalGeneration
  )
    throw new StorageDefect('original call predecessor or preparation receipt mismatch')
}
async function verifyUnissued(unit: StorageUnit, scope: SessionScope, call: string) {
  const issued = await unit.query(tx =>
    narrow<{ sr_model_issue: { session: string; call: string } }>(tx)
      .selectFrom('sr_model_issue')
      .select('call')
      .where('session', '=', scope.session)
      .where('call', '=', call)
      .executeTakeFirst(),
  )
  if (issued) throw new CoordinationRejection('retryFromFacts')
}
export async function recoverPreparedCallIn(
  unit: StorageUnit,
  host: Host,
  scope: SessionScope,
  expected: SourceToken,
): Promise<Recovered> {
  const row = await stateRow(unit, scope)
  const head = row && stateHead(row, scope)
  if (
    !head ||
    head.lifecycle !== 'active' ||
    head.run?.state !== 'runnable' ||
    head.run.attempt === null
  )
    throw new CoordinationRejection('retryFromFacts')
  const run = head.run
  return host.authority.withinRun(unit, scope, run.id, async () => {
    const current = await host.log.sourceIn(unit, host.authority.logAccess, scope)
    if ('failure' in current) throw new CoordinationRejection(current.failure)
    exactSource(current.source, expected)
    const prefix = await host.log.readPrefixIn(unit, host.authority.logAccess, current.source)
    if ('failure' in prefix) throw new CoordinationRejection(prefix.failure)
    const original = originalPreparation(prefix.entries, run)
    if (compareInteger(original.last.position, current.source.tail) !== 0)
      throw new CoordinationRejection('retryFromFacts')
    const attempt = await readFirstAttemptStep(unit, scope, run.id, host.options)
    receiptPosition(attempt, original.previous, current.source)
    const prepared = await verifyCallPreparation(
      unit,
      scope,
      original.data,
      current.source,
      host.options,
    )
    receiptPosition(prepared, original.last, current.source)
    await verifyUnissued(unit, scope, original.data.call)
    const permit = await host.state.restorePermitIn(
      unit,
      host.authority.coordination,
      scope,
      run.id,
      original.data.attempt,
    )
    if (!permit) throw new CoordinationRejection('staleAttempt')
    return Object.freeze({
      kind: 'prepared',
      preparation: Object.freeze({ ...original.data, permit }),
      source: current.source,
      predecessor: attempt.position,
    })
  })
}
