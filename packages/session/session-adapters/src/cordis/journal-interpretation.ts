import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AgentExecutionId,
  AgentJournal,
  AgentJournalEntries,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import { agentJournalEntriesKey, agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { committedBindings, withoutCommitted } from '@omne-harness/session-contract'
import type {
  ConsumptionId,
  ProducerRef,
  Reply,
  RunId,
  SessionAccess,
  SessionCallBinding,
  SessionFailure,
  SessionId,
  SessionLogCommitObservation,
  SessionLogConsequence,
  SessionLogReceipt,
  SessionOperationId,
  SessionTransactionPort,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionKey, sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { canonical } from '../testing/canonical.ts'
import type { SessionCoordinatorPrincipalFailure } from './agent-drive.ts'
import { entriesAfter, savedProgress } from './entries-window.ts'
import {
  readExecutionInterpretation,
  type InterpretableEvent,
  type InterpretationRead,
} from './journal-state.ts'
import { announce, subscribePublished } from './published-queue.ts'
import { acknowledgeReceived, type ReceivedAllPorts } from './received-all.ts'

const OWNER = 'session-adapters/journal-interpretation'
const ROUNDS = 2
const RECEIVED = { tool: 'tool-received', model: 'model-received' } as const
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

type Ports<P> = ReceivedAllPorts<P> &
  Readonly<{
    read(
      target: Readonly<{ tenant: TenantId; session: SessionId; execution: string; after: string }>,
    ): Promise<InterpretationRead>
    entries: AgentJournalEntries<P>['read']
    readCall(access: SessionAccess<P>, producer: ProducerRef): Reply<SessionCallBinding | null>
    commitLog: NonNullable<SessionTransactionPort<P>['commitLog']>
    interpreted(target: JournalInterpretationTarget): void
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

const WHOLE_EVENT = 'ad02/1'
const EVENT_BINDINGS = 'ad02/bindings/1'

function operationOf(
  part: typeof WHOLE_EVENT | typeof EVENT_BINDINGS,
  tenantText: string,
  observation: Omit<SessionLogCommitObservation, 'operation' | 'tenant'>,
): SessionOperationId {
  const digest = createHash('sha256')
    .update(canonical([part, tenantText, observation]))
    .digest('hex')
  return `ad02_${digest}` as SessionOperationId
}

const isBinding = (
  item: SessionLogConsequence,
): item is Extract<SessionLogConsequence, { kind: 'call-registration' | 'call-association' }> =>
  item.kind === 'call-registration' || item.kind === 'call-association'

function unbound(work: WorkSnapshot, item: SessionLogConsequence): boolean {
  if (!isBinding(item)) return false
  const held = work.callRegistrations?.find(record => record.consumption === item.consumption)
  return item.kind === 'call-registration'
    ? held === undefined
    : held?.registration.kind !== 'associated'
}

// A placeholder comes before every result of its call; a result is matched by its version.
const processes = (key: ReceivedEntry['delivery']['key'], version: string | undefined) =>
  version !== undefined &&
  (key.kind === 'placeholder' || (key.kind === 'result' && String(key.result) === version))

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

  // An event that processes a delivery waits until the entries consumption wrote that delivery,
  // not for a later delivery of the call (verification/binding-order).
  async function awaitsDelivery(
    access: SessionAccess<P>,
    work: WorkSnapshot,
    run: RunId,
    execution: AgentExecutionId,
    event: InterpretableEvent,
  ): Promise<Answer<boolean>> {
    const calls = new Map<keyof typeof RECEIVED, Map<string, string>>()
    for (const item of event.consequences ?? [])
      if (item.kind === 'producer' && item.result !== null) {
        const producer = item.binding.producer.kind
        calls.set(
          producer,
          (calls.get(producer) ?? new Map()).set(item.consumption, item.result.version),
        )
      }
    const reading = { principal: access.principal, tenant: access.tenant, execution }
    for (const [producer, processed] of calls) {
      const saved = savedProgress(work, run, execution, RECEIVED[producer])
      const unread = await entriesAfter(ports.entries, reading, saved?.position ?? null)
      if ('failure' in unread)
        return unavailable(`the entries answered ${unread.failure.kind}`, 'session-log-journal')
      const waits = unread.ok.some(
        ({ entry }) =>
          entry.kind === 'received' &&
          entry.delivery.producer === producer &&
          processes(entry.delivery.key, processed.get(entry.consumption)),
      )
      if (waits) return succeed(true)
    }
    return succeed(false)
  }

  async function boundIn(
    access: SessionAccess<P>,
    consequences: readonly SessionLogConsequence[],
  ): Promise<Answer<ConsumptionId[]>> {
    if (!consequences.some(isBinding)) return succeed([])
    const bound: ConsumptionId[] = []
    for (const item of consequences) {
      if (item.kind !== 'producer') continue
      const call = await ports.readCall(access, item.binding.producer)
      if ('failure' in call) return call
      if (call.ok?.consumption === item.consumption) bound.push(item.consumption)
    }
    return succeed(bound)
  }

  async function round(
    access: SessionAccess<P>,
    tenantText: string,
    target: JournalInterpretationTarget,
    sent: { count: number },
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
    for (const [at, event] of view.events.entries()) {
      const waiting = view.events.length - at
      if (event.consequences === null && event.control === null)
        return succeed({ readThrough, committed: sent.count, waiting })
      if (event.consequences?.every(item => item.kind === 'observed') === true) continue
      const awaits = await awaitsDelivery(access, work.ok, progress.run, target.execution, event)
      if ('failure' in awaits) return awaits
      const all = event.consequences ?? []
      const bound = awaits.ok ? succeed([]) : await boundIn(access, all)
      if ('failure' in bound) return bound
      const consequences = awaits.ok
        ? all.filter(item => unbound(work.ok, item))
        : withoutCommitted(all, committedBindings(bound.ok), item => item.kind)
      if (awaits.ok && consequences.length === 0)
        return succeed({ readThrough, committed: sent.count, waiting: 0 })
      const value = {
        session: target.session,
        run: progress.run,
        execution: target.execution,
        sequence: awaits.ok ? null : event.sequence,
        revision: view.revision,
        executionEvidence: view.head,
        source: event.source,
        consequences,
        ...(event.control === null ? {} : { control: event.control }),
      } satisfies Omit<SessionLogCommitObservation, 'operation' | 'tenant'>
      const answer = await send({
        ...value,
        tenant: target.tenant,
        operation: operationOf(awaits.ok ? EVENT_BINDINGS : WHOLE_EVENT, tenantText, value),
      })
      if ('failure' in answer) return answer
      sent.count += 1
      if (awaits.ok) return succeed({ readThrough, committed: sent.count, waiting: 0 })
      readThrough = answer.ok.readThrough
    }
    return succeed({ readThrough, committed: sent.count, waiting: 0 })
  }

  return async target => {
    const tenantText = tenantCodec.encode(target.tenant)
    if (!tenantText.ok) return fail({ kind: 'denied', action: 'interpret-journal' })
    const principal = await given.coordinator({ tenant: target.tenant, session: target.session })
    if ('failure' in principal) return principal
    const access = { principal: principal.ok, tenant: target.tenant, session: target.session }
    for (let left = ROUNDS; ; left -= 1) {
      const sent = { count: 0 }
      const answer = await round(access, tenantText.value, target, sent)
      if (sent.count > 0) ports.interpreted(target)
      if ('ok' in answer)
        await acknowledgeReceived(ports, access, {
          tenantText: tenantText.value,
          execution: target.execution,
        })
      if ('ok' in answer || answer.failure.kind !== 'changed' || left <= 1) return answer
    }
  }
}

type Retry = Readonly<{ wait: number; calls: number }>

// An unavailable answer names who could not answer and why: without it a stuck execution reads the same as a busy one.
const told = (failure: SessionFailure): string =>
  failure.kind === 'unavailable'
    ? `unavailable (${failure.owner}: ${failure.diagnostic})`
    : failure.kind

function reportEnd(
  logger: ReturnType<Context['logger']>,
  execution: string,
  answer: Answer<JournalInterpreted>,
): void {
  if ('failure' in answer)
    logger.warn(`the interpretation of ${execution} answered ${told(answer.failure)}`)
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
        [agentJournalKey]: null,
        [agentJournalEntriesKey]: null,
        [sessionKey]: { caller: 'coordinator' as const },
      },
      apply(ctx: Context) {
        let stopped = false
        const stopping = new AbortController()
        const session = ctx[sessionKey]
        const transactions = ctx[sessionTransactionsKey]
        const storage = ctx[storageKey]
        const tenantDomainLookup = ctx[tenantDomainLookupKey]
        const journal = ctx[agentJournalKey] as unknown as AgentJournal<P>
        const entries = ctx[agentJournalEntriesKey] as unknown as AgentJournalEntries<P>
        const logger = ctx.logger(OWNER)
        const warn = (line: string) => logger.warn(line)
        const interpret = createJournalInterpretation<P>(input, {
          readWork: access => session.work.readWork(access),
          readCall: (access, producer) => session.work.readCall({ ...access, producer }),
          read: target => readExecutionInterpretation({ storage, tenantDomainLookup }, target),
          entries: value => entries.read(value),
          commitLog: value =>
            transactions.commitLog === undefined
              ? Promise.resolve(unavailable('the Session transactions offer no commitLog'))
              : transactions.commitLog(value),
          interpreted: target => announce(ctx, warn, 'interpreted', target),
          load: value => journal.load(value),
          acknowledge: value => journal.acknowledge(value),
          warn,
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
        // Requeue the first retry at once: a moved head is readable right after its write.
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
          retryLater(target, retry ?? { wait: 0, calls: 0 }, told(answer.failure))
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
          ['consumed'],
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
