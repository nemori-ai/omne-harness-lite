// AD-02, the event channel interpretation: the plugin reads the Agent events that the session-log
// Journal published into the same log and commits what each means for Session, one event per
// `commitLog`. It is woken by `session-adapters/agent-published`, the event of the Journal plugin,
// and it never writes an Agent record.
//
// One call reads, as `coordinator`, the Run that owns the execution and the execution's saved event
// progress (`readThrough`). It then reads the execution from the durable Agent records of the
// session, in one read of one publication: the head revision, the head receipt that the boundary
// row names, and each event after the progress with the consequences that the Journal normalized
// when it wrote the event, the same ones whose kinds the fact row holds. Every event becomes one
// observation in order, except an event that is only observed, which has no Session row and is
// covered by the next committed event; the operation identity is derived from the observation, so
// the same read of the same event is the same operation. A lost reply is sent again under the same operation and
// recalls the original receipt (C-STORAGE answers `conflict` to `queryOperation` for this form, so
// it is not asked). A `changed` answer reads again once; a call of the event queue that still ends
// in `changed` is made again once (R2-D157). Any refusal is logged and not retried. A control
// event is a deferred fact: it is sent with the Agent evidence the Journal kept and no
// consequences, and Session decides them in the commit. An event whose consequences were not
// decided otherwise (an original the Journal did not keep) stops the call there: it is not
// committed as anything else.
//
// The plugin keeps nothing but the current generation of its dependencies and one queue per
// session, so the events of one session are interpreted one after the other. A call made while the
// plugin is pending or stopped answers `unavailable` and commits nothing. It does not scan the
// storage when it starts: an event it missed is interpreted by the next event of the same execution.
import { createHash } from 'node:crypto'
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
/** The reads of one call: the first, and one more after a `changed`. */
const ROUNDS = 2
/** The sends of one observation whose outcome stays unknown, all under the same operation. */
const SENDS = 3
/**
 * The calls of one execution that the event queue makes again after a call ended in `changed`
 * with its rounds used up (R2-D157). This is a patch of this line: the real gap is the wake
 * contract, because the receivers write through their own Journal copy, which sends no
 * `agent-published`, so no later event may come. That gap is recorded for wave 3 and L-RUN owns it.
 */
const REQUEUES = 1

/** One call: the execution of one Session whose events are interpreted. */
export type JournalInterpretationTarget = Readonly<{
  tenant: TenantId
  session: SessionId
  execution: AgentExecutionId
}>

/**
 * The answer of one call. `readThrough` is the saved event progress of the execution after the
 * call (an observed-only tail stays after it); `committed` counts the events this call committed
 * or recalled; `waiting` counts the events from the first one whose consequences are not decided.
 */
export type JournalInterpreted = Readonly<{
  readThrough: string
  committed: number
  waiting: number
}>

/**
 * What the assembly hands to AD-02: the principal it issues to the coordinator of one session, as
 * for AD-05 and AD-14.
 */
export type SessionJournalInterpretationInput<P> = Readonly<{
  coordinator(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
}>

/** The dependencies of one generation of the plugin. */
type Ports<P> = Readonly<{
  readWork(access: SessionAccess<P>): Reply<WorkSnapshot>
  read(
    target: Readonly<{ tenant: TenantId; session: SessionId; execution: string; after: string }>,
  ): Promise<InterpretationRead>
  commitLog: NonNullable<SessionTransactionPort<P>['commitLog']>
  /** True once the generation stopped; checked before every send. */
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

/** The Run that owns `execution` in the snapshot and the saved event progress of the execution. */
function progressOf(
  work: WorkSnapshot,
  execution: string,
): Readonly<{ run: RunId; readThrough: string }> | null {
  if (work.run.kind === 'active' && work.run.execution.execution === execution)
    return { run: work.run.run, readThrough: work.run.execution.readThrough }
  const held = work.executions?.find(item => item.execution.execution === execution)
  return held === undefined ? null : { run: held.run, readThrough: held.execution.readThrough }
}

/** The operation identity of one observation: the same read of the same event is the same operation. */
function operationOf(
  tenantText: string,
  observation: Omit<SessionLogCommitObservation, 'operation' | 'tenant'>,
): SessionOperationId {
  const digest = createHash('sha256')
    .update(canonical(['ad02/1', tenantText, observation]))
    .digest('hex')
  return `ad02_${digest}` as SessionOperationId
}

/** The interpretation of one generation. It keeps nothing between calls. */
function createJournalInterpretation<P>(
  given: SessionJournalInterpretationInput<P>,
  ports: Ports<P>,
): (target: JournalInterpretationTarget) => Reply<JournalInterpreted> {
  /** One observation; an unknown outcome is sent again under the same operation. */
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
        // The write may have happened: the outcome is unknown, never a plain failure.
        answer = fail({ kind: 'commit-unknown', operation: observation.operation })
      }
      if ('ok' in answer || answer.failure.kind !== 'commit-unknown') return answer
    }
    return answer
  }

  /** One read of the execution and one commit per event after the saved progress. */
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
      // A deferred control fact carries no consequences: Session decides them in the commit.
      if (event.consequences === null && event.control === null)
        return succeed({ readThrough, committed, waiting })
      // An event that is only observed has no Session row: it is not committed, and the next
      // committed event names it in its gap (session-contract FR-03; the observed tail is the
      // prefix that a later startRun reads, R2-D28).
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

/**
 * The AD-02 plugin and the call that reaches it. The plugin provides no key: it needs `session`
 * with the `coordinator` caller class, `sessionTransactions` (with `commitLog`), `storage` and the
 * trusted `tenantDomainLookup`, and stays pending while any of them is absent. It subscribes to
 * `session-adapters/agent-published` and interprets the named execution after each event, one
 * session at a time. `interpret` reaches the current generation; while there is none it answers
 * `unavailable`.
 */
export function createSessionJournalInterpretationPlugin<P>(
  input: SessionJournalInterpretationInput<P>,
) {
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
        // The interpretations of one session run one after the other.
        subscribePublished(
          ctx,
          () => stopped,
          async target => {
            let answer = await guarded(target)
            // R2-D157: a call that ended in `changed` runs again in the same queue slot, so later
            // events of the session still wait behind it, at most REQUEUES times. A later event of
            // the same execution reads from the saved progress, so it commits nothing twice.
            for (
              let left = REQUEUES;
              left > 0 && !stopped && 'failure' in answer && answer.failure.kind === 'changed';
              left -= 1
            )
              answer = await guarded(target)
            if ('failure' in answer)
              logger.warn(
                `the interpretation of ${target.execution} answered ${answer.failure.kind}`,
              )
            else if (answer.ok.waiting > 0)
              logger.warn(
                `${answer.ok.waiting} events of ${target.execution} have no decided consequences`,
              )
          },
        )
        ctx.effect(() => {
          current = guarded
          return () => {
            stopped = true
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
