import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Reply,
  RunId,
  SessionAccess,
  SessionFailure,
  SessionId,
  SessionLogCommitObservation,
  SessionLogReceipt,
  SessionOperationId,
  SessionTransactionPort,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionKey, sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { canonical } from '../testing/canonical.ts'
import type { SessionCoordinatorPrincipalFailure } from './agent-drive.ts'
import { readExecutionInterpretation, type InterpretationRead } from './agent-journal.ts'
import { subscribePublished } from './published-queue.ts'

const OWNER = 'session-adapters/journal-interpretation'
const ROUNDS = 2
const SENDS = 3

export type JournalInterpretationRetry = Readonly<{
  initialMs: number
  multiplier: number
  maxMs: number
}>

export const DEFAULT_JOURNAL_INTERPRETATION_RETRY: JournalInterpretationRetry = Object.freeze({
  initialMs: 50,
  multiplier: 2,
  maxMs: 5000,
})

function transient(failure: SessionFailure): boolean {
  return (
    failure.kind === 'unavailable' ||
    failure.kind === 'changed' ||
    failure.kind === 'commit-unknown'
  )
}

export type JournalInterpretationTarget = Readonly<{
  tenant: TenantId
  session: SessionId
  execution: AgentExecutionId
}>

export type JournalInterpreted = Readonly<{
  readThrough: string
  committed: number
  waiting: number
}>

export type SessionJournalInterpretationInput<P> = Readonly<{
  coordinator(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
  retry?: JournalInterpretationRetry
}>

type Ports<P> = Readonly<{
  readWork(access: SessionAccess<P>): Reply<WorkSnapshot>
  read(
    target: Readonly<{ tenant: TenantId; session: SessionId; execution: string; after: string }>,
  ): Promise<InterpretationRead>
  commitLog: NonNullable<SessionTransactionPort<P>['commitLog']>
  stopped(): boolean
}>

type Answer<T> = Outcome<T, SessionFailure>

const unavailable = (diagnostic: string, owner = OWNER): Answer<never> =>
  fail({ kind: 'unavailable', owner, diagnostic })

function describe(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  } catch {
    return 'a thrown value that has no text'
  }
}

function progressOf(
  work: WorkSnapshot,
  execution: string,
): Readonly<{ run: RunId; readThrough: string }> | null {
  if (work.run.kind === 'active' && work.run.execution.execution === execution)
    return { run: work.run.run, readThrough: work.run.execution.readThrough }
  const held = work.executions?.find(item => item.execution.execution === execution)
  return held === undefined ? null : { run: held.run, readThrough: held.execution.readThrough }
}

function operationOf(
  tenantText: string,
  observation: Omit<SessionLogCommitObservation, 'operation' | 'tenant'>,
): SessionOperationId {
  const digest = createHash('sha256')
    .update(canonical(['ad02/1', tenantText, observation]))
    .digest('hex')
  return `ad02_${digest}` as SessionOperationId
}

function createJournalInterpretation<P>(
  given: SessionJournalInterpretationInput<P>,
  ports: Ports<P>,
): (target: JournalInterpretationTarget) => Reply<JournalInterpreted> {
  async function send(
    observation: SessionLogCommitObservation,
  ): Promise<Answer<SessionLogReceipt>> {
    let answer: Answer<SessionLogReceipt> = fail({
      kind: 'commit-unknown',
      operation: observation.operation,
    })
    for (let sent = 0; sent < SENDS; sent += 1) {
      if (ports.stopped()) return unavailable('the journal interpretation has stopped')
      try {
        answer = await ports.commitLog({ observation })
      } catch {
        answer = fail({ kind: 'commit-unknown', operation: observation.operation })
      }
      if ('ok' in answer || answer.failure.kind !== 'commit-unknown') return answer
    }
    return answer
  }

  async function round(
    access: SessionAccess<P>,
    tenantText: string,
    target: JournalInterpretationTarget,
  ): Promise<Answer<JournalInterpreted>> {
    const work = await ports.readWork(access)
    if ('failure' in work) return work
    const progress = progressOf(work.ok, target.execution)
    if (progress === null)
      return unavailable('Session recorded no Run of this execution', 'session-history')
    const read = await ports.read({ ...target, after: progress.readThrough })
    if (read.kind === 'unavailable') return unavailable(read.diagnostic, 'session-log-journal')
    const view = read.execution
    if (view === null) return unavailable('the session holds no Agent records of this execution')
    let readThrough = progress.readThrough
    let committed = 0
    for (const [at, event] of view.events.entries()) {
      const waiting = view.events.length - at
      if (event.consequences === null && event.control === null)
        return succeed({ readThrough, committed, waiting })
      if (event.consequences?.every(item => item.kind === 'observed') === true) continue
      if (view.head === null)
        return unavailable('the head of the execution was written by another execution')
      const value = {
        session: target.session,
        run: progress.run,
        execution: target.execution,
        sequence: event.sequence,
        revision: view.revision,
        executionEvidence: view.head,
        source: event.source,
        consequences: event.consequences ?? [],
        ...(event.control === null ? {} : { control: event.control }),
      } satisfies Omit<SessionLogCommitObservation, 'operation' | 'tenant'>
      const answer = await send({
        ...value,
        tenant: target.tenant,
        operation: operationOf(tenantText, value),
      })
      if ('failure' in answer) return answer
      readThrough = answer.ok.readThrough
      committed += 1
    }
    return succeed({ readThrough, committed, waiting: 0 })
  }

  return async target => {
    const tenantText = tenantCodec.encode(target.tenant)
    if (!tenantText.ok) return fail({ kind: 'denied', action: 'interpret-journal' })
    const principal = await given.coordinator({ tenant: target.tenant, session: target.session })
    if ('failure' in principal) return principal
    const access = { principal: principal.ok, tenant: target.tenant, session: target.session }
    for (let left = ROUNDS; ; left -= 1) {
      const answer = await round(access, tenantText.value, target)
      if ('ok' in answer || answer.failure.kind !== 'changed' || left <= 1) return answer
    }
  }
}

type Retry = Readonly<{ wait: number; calls: number }>

function reportEnd(
  logger: ReturnType<Context['logger']>,
  execution: string,
  answer: Answer<JournalInterpreted>,
): void {
  if ('failure' in answer)
    logger.warn(`the interpretation of ${execution} answered ${answer.failure.kind}`)
  else if (answer.ok.waiting > 0)
    logger.warn(`${answer.ok.waiting} events of ${execution} have no decided consequences`)
}

export function createSessionJournalInterpretationPlugin<P>(
  input: SessionJournalInterpretationInput<P>,
) {
  const policy = input.retry ?? DEFAULT_JOURNAL_INTERPRETATION_RETRY
  if (
    !(policy.initialMs > 0) ||
    !(policy.multiplier >= 1) ||
    !(policy.maxMs >= policy.initialMs) ||
    !Number.isFinite(policy.maxMs)
  )
    throw new RangeError(
      'the journal interpretation retry needs 0 < initialMs <= maxMs and multiplier >= 1',
    )
  let current: ((target: JournalInterpretationTarget) => Reply<JournalInterpreted>) | null = null
  return {
    plugin: {
      name: 'session-ad02',
      inject: {
        [sessionTransactionsKey]: null,
        [storageKey]: null,
        [tenantDomainLookupKey]: null,
        [sessionKey]: { caller: 'coordinator' as const },
      },
      apply(ctx: Context) {
        let stopped = false
        const stopping = new AbortController()
        const session = ctx[sessionKey]
        const transactions = ctx[sessionTransactionsKey]
        const storage = ctx[storageKey]
        const tenantDomainLookup = ctx[tenantDomainLookupKey]
        const logger = ctx.logger(OWNER)
        const interpret = createJournalInterpretation<P>(input, {
          readWork: access => session.work.readWork(access),
          read: target => readExecutionInterpretation({ storage, tenantDomainLookup }, target),
          commitLog: value =>
            transactions.commitLog === undefined
              ? Promise.resolve(unavailable('the Session transactions offer no commitLog'))
              : transactions.commitLog(value),
          stopped: () => stopped,
        })
        const guarded = async (target: JournalInterpretationTarget): Reply<JournalInterpreted> => {
          try {
            return await interpret(target)
          } catch (cause) {
            logger.error(`interpret: a dependency threw: ${describe(cause)}`)
            return unavailable(`a dependency threw: ${describe(cause)}`)
          }
        }
        // Requeue the first retry at once: a moved head is readable right after its write; a wait lets another execution's write replace it with a placeholder head.
        const retrying = new Set<string>()
        const attempt = async (target: JournalInterpretationTarget, retry: Retry | null) => {
          const key = JSON.stringify([target.session, target.execution])
          const answer = await guarded(target)
          if ('ok' in answer || stopped || !transient(answer.failure)) {
            if (retry !== null) retrying.delete(key)
            reportEnd(logger, target.execution, answer)
            return
          }
          if (retry === null && retrying.has(key)) return
          retrying.add(key)
          retryLater(target, retry ?? { wait: 0, calls: 0 }, answer.failure.kind)
        }
        const retryLater = (target: JournalInterpretationTarget, retry: Retry, kind: string) => {
          const calls = retry.calls + 1
          logger.warn(
            `call ${calls} of the interpretation of ${target.execution} answered ${kind}; again in ${retry.wait} ms`,
          )
          const next = {
            wait:
              retry.wait === 0
                ? policy.initialMs
                : Math.min(retry.wait * policy.multiplier, policy.maxMs),
            calls,
          }
          if (retry.wait === 0) return enqueue(target, () => attempt(target, next))
          void delay(retry.wait, undefined, { signal: stopping.signal }).then(
            () => enqueue(target, () => attempt(target, next)),
            () => undefined,
          )
        }
        const enqueue = subscribePublished(
          ctx,
          () => stopped,
          target => attempt(target, null),
        )
        ctx.effect(() => {
          current = guarded
          return () => {
            stopped = true
            stopping.abort()
            if (current === guarded) current = null
          }
        })
      },
    },
    interpret(target: JournalInterpretationTarget): Reply<JournalInterpreted> {
      const generation = current
      return generation === null
        ? Promise.resolve(unavailable('the journal interpretation is pending or stopped'))
        : generation(target)
    },
  }
}
