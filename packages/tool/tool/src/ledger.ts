// The ledger factory (G1): `createToolLedger(store, guards, clock, configuration)` gives the
// ToolCommands and ToolReads of this implementation, and the admission entry that the runtime
// uses. Each entry checks its boundary input, asks the guards, reads the domain, lets a pure
// decider answer, and commits by revision. A negative answer of a query is given only after an
// exclusion fence commits; a command of the excluded operation that was in flight then stops
// instead of landing after the negative. The commands of the way to a start sequence the call
// domain and the queue domain as docs/architecture.md describes: the call domain leads with a
// task, the queue domain follows, the call domain closes. Operations of later increments answer a
// named `unsupported` failure after the same checks; nothing throws for an expected failure,
// and nothing pretends to succeed.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolDeliveryId,
  decodeToolInstanceId,
  decodeToolOperationId,
  decodeToolResultVersion,
  describedAdoption,
  judgeConsumerRef,
  judgeFixedToolRequest,
  judgeHandoff,
  judgeToolArguments,
  type Adoption,
  type ClockSegment,
  type ConsumerRef,
  type DurableEvidence,
  type FixedToolRequest,
  type Handoff,
  type OperationResolution,
  type PreparationRecord,
  type Reply,
  type StartProgress,
  type ToolCallId,
  type ToolClock,
  type ToolCommands,
  type ToolDeliveryId,
  type ToolExecutionRef,
  type ToolFailure,
  type ToolLookup,
  type ToolOperationId,
  type ToolReads,
  type ToolResultVersion,
  type ToolStartRecord,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  denied,
  invalid,
  isTenantShape,
  judgeAdoptionField,
  judgeCallInput,
  judgeEvidenceField,
  judgeMutationInput,
  judgeWriteInput,
  type CallInput,
  type MutationInput,
  type WriteInput,
} from './boundary.ts'
import { checkLedgerConfiguration } from './configuration.ts'
import type {
  ToolLedgerAdmissions,
  ToolLedgerConfiguration,
  ToolLedgerQueues,
} from './construction.ts'
import { digestOf, nextRevision } from './evidence.ts'
import {
  decideAdmit,
  decideRelease,
  snapshotOf,
  stateRevision,
  terminalText,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import { excluded, excludedSince, withExclusionRemoved } from './ledger-exclusion.ts'
import type { ToolLedgerAction, ToolLedgerGuards } from './ledger-guards.ts'
import { createQueueReconciler } from './ledger-queue.ts'
import {
  lookupCall,
  readAccount,
  readRecovery,
  readResultPage,
  resolveOperation,
} from './ledger-reads.ts'
import {
  decideCloseQueueTask,
  decideEnqueue,
  decidePlanPreparation,
  decidePrepareStart,
  decidePrepared,
  decideQueueHold,
  decideQueueOrder,
  decideQueueReady,
  decideQueueRelease,
  decideRecordStart,
  decideRejectPending,
  queueKeyOf,
  queueSnapshotOf,
  refuseEnqueue,
  refusePlan,
  refuseStart,
  releaseBasisOf,
  type OrderOutcome,
  type QueueSnapshot,
  type WriteCommand,
} from './ledger-start.ts'
import {
  type CallRecord,
  type LedgerDomain,
  type LedgerWrite,
  type QueueEntryRecord,
  type ToolLedgerStore,
} from './ledger-store.ts'

export type ToolLedger<P, B extends ContentBlock> = Readonly<{
  commands: ToolCommands<P, B>
  reads: ToolReads<P, B>
  /** The admission with the recall flag; `commands.admit` answers its state only. */
  admissions: ToolLedgerAdmissions<P>
  /** The queue maintenance a waiting call asks for (SPEC 22). */
  queues: ToolLedgerQueues<P>
}>

/** The identity of this ledger implementation, named in its `unsupported` answers. */
export const toolLedgerAdoption: Adoption = describedAdoption({
  owner: '@omne-harness/tool',
  name: 'tool-ledger',
  revision: '1',
})

/**
 * The diagnostic of a port that threw. A thrown message can carry a connection string or other
 * secret text (P05: diagnostics carry no secret), so the reply names the dependency only.
 */
function thrown(dependency: string): string {
  return `${dependency} threw an exception; its message is not reported`
}

function unsupported(name: string, increment: string): Outcome<never, ToolFailure> {
  return fail({
    kind: 'unsupported',
    adoption: toolLedgerAdoption,
    reason: `${name} is not implemented in this increment (${increment})`,
  })
}

function unavailable(dependency: string, diagnostic: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'unavailable', dependency, diagnostic })
}

type Decide<T, B extends ContentBlock> = (snapshot: Snapshot<B>, mint: Mint) => Decision<T, B>
type DecideQueue<T, B extends ContentBlock> = (snapshot: QueueSnapshot) => Decision<T, B>

/**
 * What a query answers when its exclusion fence has an unknown outcome. A negative answer is
 * never given then (P01), because an in-flight commit of the operation may still land.
 */
type Fence<T> = Readonly<{
  negative(answer: T): boolean
  unknown: Outcome<T, ToolFailure>
}>

const lookupFence: Fence<ToolLookup> = {
  negative: answer => answer.kind === 'not-accepted',
  unknown: unavailable('ledger-store', 'the exclusion fence of the lookup has an unknown outcome'),
}

const operationFence: Fence<OperationResolution> = {
  negative: answer => answer.kind === 'not-committed',
  unknown: succeed({ kind: 'unknown' }),
}

/** The write context fields plus the principal the caller passes alongside (SPEC 19). */
type WriteEntry<P> = WriteInput & Readonly<{ principal: P }>

/**
 * Creates the ledger. The store keeps the records, the guards answer qualification and policy,
 * the configuration gives the result page size, the commit attempts and the queue capacity, and
 * the clock begins the timing segment of a foreground start. A bad configuration throws
 * `TypeError`.
 */
export function createToolLedger<P, B extends ContentBlock>(
  store: ToolLedgerStore<B>,
  guards: ToolLedgerGuards<P, B>,
  clock: ToolClock,
  configuration: ToolLedgerConfiguration,
): ToolLedger<P, B> {
  checkLedgerConfiguration(configuration)
  const { resultPageBytes, ledgerCommitAttempts: attempts, queueCapacity } = configuration

  const access = async (
    input: CallInput<P>,
    action: ToolLedgerAction,
  ): Promise<Outcome<void, ToolFailure>> => {
    let verdict: Awaited<ReturnType<typeof guards.access.qualify>>
    try {
      verdict = await guards.access.qualify({ ...input, action })
    } catch {
      return unavailable('access-guard', thrown('access-guard'))
    }
    if (verdict.kind === 'allowed') return succeed(undefined)
    if (verdict.kind === 'denied') return denied(action)
    return unavailable('access-guard', verdict.diagnostic)
  }

  const readDomain = async (
    domain: LedgerDomain,
  ): Promise<
    Outcome<Extract<Awaited<ReturnType<typeof store.read>>, { kind: 'complete' }>, ToolFailure>
  > => {
    let result: Awaited<ReturnType<typeof store.read>>
    try {
      result = await store.read(domain)
    } catch {
      return unavailable('ledger-store', thrown('ledger-store'))
    }
    if (result.kind === 'unavailable') return unavailable('ledger-store', result.diagnostic)
    return succeed(result)
  }

  const read = async (domain: LedgerDomain): Promise<Outcome<Snapshot<B>, ToolFailure>> => {
    const result = await readDomain(domain)
    return 'failure' in result ? result : succeed(snapshotOf(domain, result.ok))
  }

  const readQueue = async (
    domain: Extract<LedgerDomain, { kind: 'queue' }>,
  ): Promise<Outcome<QueueSnapshot, ToolFailure>> => {
    const result = await readDomain(domain)
    return 'failure' in result ? result : succeed(queueSnapshotOf(domain, result.ok))
  }

  const commit = async (
    domain: LedgerDomain,
    expected: Snapshot<B>['revision'],
    revision: Snapshot<B>['revision'],
    writes: readonly LedgerWrite<B>[],
  ): Promise<Awaited<ReturnType<typeof store.commit>>> => {
    try {
      return await store.commit({ domain, expected, revision, writes })
    } catch {
      // The store may have applied the writes before it threw, so the outcome is unknown.
      return { kind: 'unknown', diagnostic: thrown('ledger-store') }
    }
  }

  /**
   * Reads, decides and commits by domain revision. A conflict re-reads and re-decides, at most
   * `attempts` times; an unknown commit answers `unknown` and is not retried. A command keyed by
   * `operation` stops with `excluded` when a re-read shows a negative answer about the operation
   * given after its first read (P01: the negative excluded this very commit), and its commit
   * removes the exclusion fence of the operation. A read passes `null`: another reader's fence
   * does not exclude it, and it re-fences instead. A command that read the domain before its
   * first transaction (a pre-read that gates a queue step or a port call) passes that revision
   * as `since`: the pre-read is its first read, so a negative answer given after it stops the
   * command whatever the steps between the pre-read and the transaction did.
   */
  const transact = async <T>(
    domain: LedgerDomain,
    operation: ToolOperationId | null,
    decide: Decide<T, B>,
    unknown: Outcome<T, ToolFailure>,
    since: Snapshot<B>['revision'] | null = null,
  ): Reply<T> => {
    let firstRead = since
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const snapshot = await read(domain)
      if ('failure' in snapshot) return snapshot
      firstRead ??= snapshot.ok.revision
      if (operation !== null && excludedSince(snapshot.ok, operation, firstRead))
        return excluded(operation)
      const revision = nextRevision(snapshot.ok.revision)
      const decision = decide(snapshot.ok, { revision })
      if (decision.kind === 'reply') return decision.outcome
      const writes = withExclusionRemoved(decision.writes, operation)
      const committed = await commit(domain, snapshot.ok.revision, revision, writes)
      if (committed.kind === 'committed') return succeed(decision.value)
      if (committed.kind === 'unknown') return unknown
      if (committed.kind === 'unavailable') return unavailable('ledger-store', committed.diagnostic)
    }
    return unavailable('ledger-store', `${attempts} revision conflicts in a row`)
  }

  /**
   * The queue-domain step of a cross-domain transition. A conflict re-reads and re-decides; the
   * decision is idempotent by call, so a repeated step after a crash recalls its own transition.
   */
  const transactQueue = async <T>(
    domain: Extract<LedgerDomain, { kind: 'queue' }>,
    decide: DecideQueue<T, B>,
    unknown: Outcome<T, ToolFailure>,
  ): Reply<T> => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const snapshot = await readQueue(domain)
      if ('failure' in snapshot) return snapshot
      const decision = decide(snapshot.ok)
      if (decision.kind === 'reply') return decision.outcome
      const revision = nextRevision(snapshot.ok.revision)
      const committed = await commit(domain, snapshot.ok.revision, revision, decision.writes)
      if (committed.kind === 'committed') return succeed(decision.value)
      if (committed.kind === 'unknown') return unknown
      if (committed.kind === 'unavailable') return unavailable('ledger-store', committed.diagnostic)
    }
    return unavailable('ledger-store', `${attempts} revision conflicts in a row`)
  }

  const commitUnknown = (operation: ToolOperationId): Outcome<never, ToolFailure> =>
    fail({ kind: 'commit-unknown', operation })

  const callDomain = (input: CallInput<P> | WriteInput): LedgerDomain => ({
    kind: 'call',
    tenant: input.tenant,
    call: input.call,
  })

  const queueDomain = (
    tenant: CallInput<P>['tenant'],
    request: FixedToolRequest,
  ): Extract<LedgerDomain, { kind: 'queue' }> => ({
    kind: 'queue',
    tenant,
    key: queueKeyOf(request),
  })

  /** The boundary and the qualification of a read entry. */
  const entry = async (
    input: unknown,
    action: ToolLedgerAction,
  ): Promise<Outcome<CallInput<P>, ToolFailure>> => {
    const checked = judgeCallInput<P>(input, action)
    if ('failure' in checked) return checked
    const allowed = await access(checked.ok, action)
    return 'failure' in allowed ? allowed : checked
  }

  /** A read entry: boundary, access, snapshot, projection. */
  const query = async <T>(
    input: unknown,
    action: ToolLedgerAction,
    project: (snapshot: Snapshot<B>, checked: CallInput<P>) => Outcome<T, ToolFailure>,
  ): Reply<T> => {
    const checked = await entry(input, action)
    if ('failure' in checked) return checked
    const snapshot = await read(callDomain(checked.ok))
    if ('failure' in snapshot) return snapshot
    return project(snapshot.ok, checked.ok)
  }

  /**
   * A read entry whose negative answer excludes the in-flight commits of the operation (P01). A
   * complete read without the operation is followed by an exclusion fence: a commit that writes
   * the exclusion record of the operation at the new domain revision, replacing an older one.
   * Every commit prepared against the read revision then fails its revision check, and the
   * command behind it reads the fence on its retry. The negative answer is given only after the
   * fence committed; a conflict re-reads, and an unknown or unavailable fence never answers the
   * negative.
   */
  const fenced = async <T>(
    input: unknown,
    action: ToolLedgerAction,
    field: 'admission' | 'operation',
    project: (snapshot: Snapshot<B>, operation: ToolOperationId) => T,
    fence: Fence<T>,
  ): Reply<T> => {
    const checked = await entry(input, action)
    if ('failure' in checked) return checked
    const operation = decodeToolOperationIdField(Reflect.get(input as object, field), field)
    if ('failure' in operation) return operation
    return transact(
      callDomain(checked.ok),
      null,
      (snapshot, mint) => {
        const answer = project(snapshot, operation.ok)
        if (!fence.negative(answer)) return { kind: 'reply', outcome: succeed(answer) }
        const exclusion = { operation: operation.ok, revision: mint.revision }
        return {
          kind: 'commit',
          writes: [{ kind: 'put', record: { kind: 'exclusion', exclusion } }],
          value: answer,
        }
      },
      fence.unknown,
    )
  }

  /** A mutation entry: boundary, access, then the transaction with the given decider. */
  const mutate = async <T>(
    input: unknown,
    action: ToolLedgerAction,
    decide: (checked: MutationInput<P>) => Promise<Outcome<Decide<T, B>, ToolFailure>>,
  ): Reply<T> => {
    const checked = judgeMutationInput<P>(input, action)
    if ('failure' in checked) return checked
    const allowed = await access(checked.ok, action)
    if ('failure' in allowed) return allowed
    const decider = await decide(checked.ok)
    if ('failure' in decider) return decider
    const { operation } = checked.ok
    return transact(callDomain(checked.ok), operation, decider.ok, commitUnknown(operation))
  }

  /**
   * The boundary and the qualification of a write-context entry. The principal travels next to
   * the context (the contract's WriteContext has no principal field; SPEC 19).
   */
  const writeEntry = async (input: unknown): Promise<Outcome<WriteEntry<P>, ToolFailure>> => {
    const checked = judgeWriteInput(input)
    if ('failure' in checked) return checked
    // A write without a principal is denied like a foreign one; the guard judges the principal.
    if (!('principal' in (input as object))) return denied('write')
    const principal = Reflect.get(input as object, 'principal') as P
    const allowed = await access(
      { principal, tenant: checked.ok.tenant, call: checked.ok.call },
      'write',
    )
    if ('failure' in allowed) return allowed
    return succeed({ ...checked.ok, principal })
  }

  /** The write command fields of an entry, with the canonical digest of its own input fields. */
  const writeCommand = (context: WriteEntry<P>, fields: unknown): WriteCommand => ({
    tenant: context.tenant,
    call: context.call,
    operation: context.operation,
    expected: context.expected,
    inputDigest: digestOf(fields),
  })

  /** The call record as the domain holds it now, for the steps that precede the transaction. */
  const peek = async (context: WriteEntry<P>): Promise<Outcome<Snapshot<B>, ToolFailure>> =>
    read(callDomain(context))

  /** Whether the snapshot already holds the operation: the transaction will recall it. */
  const committedBefore = (snapshot: Snapshot<B>, operation: ToolOperationId): boolean =>
    snapshot.operations.has(operation)

  /** The call of a pre-read, or the failure the transaction would give for its absence. */
  const recordOf = (snapshot: Snapshot<B>): Outcome<CallRecord, ToolFailure> =>
    snapshot.call === null ? invalid('call', 'unknown-call') : succeed(snapshot.call)

  /** The gate a cross-domain command checks on its pre-read, before it touches the queue. */
  const preGate = (
    snapshot: Snapshot<B>,
    context: WriteEntry<P>,
  ): Outcome<CallRecord, ToolFailure> => {
    const record = recordOf(snapshot)
    if ('failure' in record) return record
    if (stateRevision(snapshot) !== context.expected)
      return fail({ kind: 'stale-revision', current: stateRevision(snapshot) })
    return record
  }

  /**
   * A write-context entry of a later increment: boundary, access, revision gate, then unsupported.
   * The gate compares with the revision of the current state, which a fence does not change.
   */
  const write = async (input: unknown, name: string, increment: string): Reply<never> => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    return transact(
      callDomain(context.ok),
      context.ok.operation,
      snapshot => ({
        kind: 'reply',
        outcome:
          stateRevision(snapshot) === context.ok.expected
            ? unsupported(name, increment)
            : fail({ kind: 'stale-revision', current: stateRevision(snapshot) }),
      }),
      commitUnknown(context.ok.operation),
    )
  }

  /** A mutation entry of a later increment: boundary, access, then unsupported. */
  const later = (input: unknown, action: ToolLedgerAction, name: string, increment: string) =>
    mutate<never>(input, action, () =>
      Promise.resolve(
        succeed(() => ({
          kind: 'reply',
          outcome: unsupported(name, increment),
        })),
      ),
    )

  const verifySource = async (
    checked: MutationInput<P>,
    request: FixedToolRequest,
  ): Promise<Outcome<void, ToolFailure>> => {
    let verdict: Awaited<ReturnType<typeof guards.sources.verify>>
    try {
      verdict = await guards.sources.verify({ ...checked, request })
    } catch {
      return unavailable('source-guard', thrown('source-guard'))
    }
    if (verdict.kind === 'trusted') return succeed(undefined)
    if (verdict.kind === 'forged') return denied('admit')
    return unavailable('source-guard', verdict.diagnostic)
  }

  const verifyGrant = async (
    checked: MutationInput<P>,
    request: FixedToolRequest,
  ): Promise<Outcome<void, ToolFailure>> => {
    const verifier = guards.grants.get(request.scope.owner)
    if (verifier === undefined) return denied('admit')
    let verdict: Awaited<ReturnType<typeof verifier.verifyGrant>>
    try {
      verdict = await verifier.verifyGrant({
        principal: checked.principal,
        tenant: checked.tenant,
        call: checked.call,
        scope: request.scope,
      })
    } catch {
      return unavailable('grant-guard', thrown('grant-guard'))
    }
    if (verdict.kind === 'granted') return succeed(undefined)
    if (verdict.kind === 'refused') return denied('admit')
    return unavailable('grant-guard', verdict.diagnostic)
  }

  const admitTools = {
    arguments: (input: Parameters<typeof judgeToolArguments>[0]) =>
      judgeToolArguments(input, guards.budgets.arguments),
    text: (reason: string) => {
      const made = guards.results.text(reason)
      return 'failure' in made ? made : guards.policy.judgeResult(made.ok)
    },
  }

  const text = (terminal: Parameters<typeof terminalText<B>>[0]) =>
    terminalText(terminal, admitTools.text)

  /** How many unreleased calls the request's queue holds, read before an admission (P02). */
  const queueLoad = async (
    checked: MutationInput<P>,
    request: FixedToolRequest,
  ): Promise<Outcome<Readonly<{ load: number; capacity: number }> | null, ToolFailure>> => {
    if (request.availability.kind !== 'available') return succeed(null)
    const snapshot = await readQueue(queueDomain(checked.tenant, request))
    if ('failure' in snapshot) return snapshot
    return succeed({ load: snapshot.ok.entries.size, capacity: queueCapacity })
  }

  /**
   * Gives a pending call its place in the FIFO: the one queue step that creates an entry, shared
   * by the admission and planPreparation. The call domain was read before this step, so the call
   * may have settled since and its release may have run before the entry existed. The queue
   * domain answers that itself: a released call has a tombstone there, and the creation step
   * answers `released` instead of making an entry (SPEC 22). No second read of the call domain
   * and no ordering of the two domains' commits is needed for that.
   */
  const order = async (
    tenant: CallInput<P>['tenant'],
    command: Readonly<{ call: ToolCallId; operation: ToolOperationId }>,
    request: FixedToolRequest,
  ): Promise<Outcome<OrderOutcome, ToolFailure>> =>
    transactQueue(
      queueDomain(tenant, request),
      snapshot => decideQueueOrder(snapshot, { ...command, limit: request.limits.concurrency }),
      commitUnknown(command.operation),
    )

  const admissions: ToolLedgerAdmissions<P> = {
    admit: async input => {
      const fixed: {
        value: Readonly<{ checked: MutationInput<P>; request: FixedToolRequest }> | null
      } = { value: null }
      const admitted = await mutate(input, 'admit', async checked => {
        const judged = judgeFixedToolRequest(Reflect.get(input, 'request'))
        if ('failure' in judged)
          return invalid(`request.${judged.failure.field}`, judged.failure.reason)
        const request = judged.ok
        const trusted = await verifySource(checked, request)
        if ('failure' in trusted) return trusted
        const granted = await verifyGrant(checked, request)
        if ('failure' in granted) return granted
        const queue = await queueLoad(checked, request)
        if ('failure' in queue) return queue
        fixed.value = { checked, request }
        const command = { ...checked, request, inputDigest: digestOf(request), queue: queue.ok }
        return succeed((snapshot, mint) => decideAdmit(snapshot, command, admitTools, mint))
      })
      // A recalled admission answers the state of its first receipt, which is `accepted` even
      // after the call settled and its entry was released. Only the first admission orders; a
      // released call answers `released` and gets no entry, and a failed step leaves the
      // ordinal to planPreparation.
      if (
        'ok' in admitted &&
        !admitted.ok.recovered &&
        admitted.ok.state.phase === 'accepted' &&
        fixed.value !== null
      ) {
        const { checked, request } = fixed.value
        await order(checked.tenant, checked, request)
      }
      return admitted
    },
  }

  /**
   * Releases the call's queue place after a settlement of a real tool, then closes the `queue`
   * task of `operation`. The place is released only on a basis the call domain holds, read after
   * the settlement committed: a call that merely settled keeps its place and its task (P02). The
   * release is attempted whatever position the state holds, because an entry may exist that the
   * state never recorded (a crash after planPreparation's queue step), and it writes the
   * tombstone even when no entry exists yet. A failure leaves the task, so the release is redone
   * by a resend of the same command.
   */
  const releaseQueue = async (
    context: WriteEntry<P>,
    record: CallRecord,
    state: ToolState,
  ): Reply<ToolState> => {
    if (state.phase !== 'settled' || record.request.availability.kind !== 'available')
      return succeed(state)
    const current = await peek(context)
    if ('failure' in current) return current
    const basis = current.ok.call === null ? null : releaseBasisOf(current.ok.call)
    if (basis === null) return succeed(state)
    const released = await transactQueue(
      queueDomain(context.tenant, record.request),
      snapshot => decideQueueRelease(snapshot, [{ call: context.call, basis }]),
      commitUnknown(context.operation),
    )
    if ('failure' in released) return released
    const closed = await transact(
      callDomain(context),
      null,
      snapshot => decideCloseQueueTask(snapshot, context.operation),
      commitUnknown(context.operation),
    )
    return 'failure' in closed ? closed : succeed(state)
  }

  /**
   * The answer of a plan whose call the queue released after the plan read it: the call settled in
   * between, so the plan is stale. The call domain says so as the transaction would, and no entry
   * was made for it.
   */
  const releasedPlan = async (context: WriteEntry<P>): Reply<never> => {
    const current = await peek(context)
    if ('failure' in current) return current
    const gated = preGate(current.ok, context)
    return 'failure' in gated ? gated : invalid('call', 'queue-released')
  }

  /**
   * The place a plan takes before its transaction: the gates on the pre-read first, so that a
   * refused plan leaves no entry behind, then the queue step. A released call has no place to
   * take, so the plan is stale.
   */
  const placeForPlan = async (
    context: WriteEntry<P>,
    command: WriteCommand,
    before: Snapshot<B>,
    planned: Readonly<{ request: FixedToolRequest; purpose: 'initial' | 'resume' }>,
  ): Promise<Outcome<QueueEntryRecord, ToolFailure>> => {
    const gated = preGate(before, context)
    if ('failure' in gated) return gated
    const refused = refusePlan(gated.ok, planned, digestOf)
    if ('failure' in refused) return refused
    const ordered = await order(context.tenant, command, gated.ok.request)
    if ('failure' in ordered) return ordered
    return ordered.ok.kind === 'released' ? releasedPlan(context) : succeed(ordered.ok.entry)
  }

  const planPreparation: ToolCommands<P, B>['planPreparation'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const judged = judgeFixedToolRequest(Reflect.get(input, 'request'))
    if ('failure' in judged)
      return invalid(`request.${judged.failure.field}`, judged.failure.reason)
    const purpose: unknown = Reflect.get(input, 'purpose')
    if (purpose !== 'initial' && purpose !== 'resume') return invalid('purpose', 'value')
    const command = writeCommand(context.ok, { request: judged.ok, purpose })
    const before = await peek(context.ok)
    if ('failure' in before) return before
    let entry: QueueEntryRecord | null = null
    if (!committedBefore(before.ok, command.operation)) {
      const placed = await placeForPlan(context.ok, command, before.ok, {
        request: judged.ok,
        purpose,
      })
      if ('failure' in placed) return placed
      entry = placed.ok
    }
    const ordinal = entry
    return transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) =>
        decidePlanPreparation(
          snapshot,
          {
            ...command,
            request: judged.ok,
            purpose,
            entry: ordinal ?? missingEntry(context.ok.call, command.operation),
            key: queueKeyOf(judged.ok),
          },
          digestOf,
          mint,
        ),
      commitUnknown(command.operation),
      before.ok.revision,
    )
  }

  const prepared: ToolCommands<P, B>['prepared'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const preparation = judgePreparationField(Reflect.get(input, 'preparation'))
    if ('failure' in preparation) return preparation
    const resources = judgeEvidenceField(Reflect.get(input, 'resources'), 'resources')
    if ('failure' in resources) return resources
    const fields = { preparation: preparation.ok, resources: resources.ok }
    const command = { ...writeCommand(context.ok, fields), ...fields }
    return transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) => decidePrepared(snapshot, command, digestOf, mint),
      commitUnknown(command.operation),
    )
  }

  const enqueue: ToolCommands<P, B>['enqueue'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const command = writeCommand(context.ok, {})
    const before = await peek(context.ok)
    if ('failure' in before) return before
    let entry = null
    if (!committedBefore(before.ok, command.operation)) {
      const gated = preGate(before.ok, context.ok)
      if ('failure' in gated) return gated
      const refused = refuseEnqueue(gated.ok)
      if ('failure' in refused) return refused
      const ready = await transactQueue(
        queueDomain(context.ok.tenant, gated.ok.request),
        snapshot =>
          decideQueueReady(snapshot, { call: context.ok.call, operation: command.operation }),
        commitUnknown(command.operation),
      )
      if ('failure' in ready) return ready
      entry = ready.ok
    }
    const readied = entry
    return transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) =>
        decideEnqueue(
          snapshot,
          { ...command, entry: readied ?? missingEntry(context.ok.call, command.operation) },
          mint,
        ),
      commitUnknown(command.operation),
      before.ok.revision,
    )
  }

  /** The current start qualification of the request (SPEC 21: the start guard). */
  const qualifyStart = async (
    context: WriteEntry<P>,
    request: FixedToolRequest,
  ): Promise<Outcome<void, ToolFailure>> => {
    let verdict: Awaited<ReturnType<typeof guards.starts.qualifyStart>>
    try {
      verdict = await guards.starts.qualifyStart({
        principal: context.principal,
        tenant: context.tenant,
        call: context.call,
        request,
      })
    } catch {
      return unavailable('start-guard', thrown('start-guard'))
    }
    if (verdict.kind === 'allowed') return succeed(undefined)
    if (verdict.kind === 'refused')
      return fail({
        kind: 'unsupported',
        adoption: request.availability.definition.adoption,
        reason: `the start is not permitted now: ${verdict.reason}`,
      })
    return unavailable('start-guard', verdict.diagnostic)
  }

  const prepareStart: ToolCommands<P, B>['prepareStart'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const command = writeCommand(context.ok, {})
    const execution = executionOf(context.ok)
    const before = await peek(context.ok)
    if ('failure' in before) return before
    let hold = null
    if (!committedBefore(before.ok, command.operation)) {
      const gated = preGate(before.ok, context.ok)
      if ('failure' in gated) return gated
      const record = gated.ok
      const refused = refuseStart(record)
      if ('failure' in refused) return refused
      const permitted = await qualifyStart(context.ok, record.request)
      if ('failure' in permitted) return permitted
      const held = await transactQueue(
        queueDomain(context.ok.tenant, record.request),
        snapshot =>
          decideQueueHold(snapshot, { call: context.ok.call, operation: command.operation }),
        commitUnknown(command.operation),
      )
      if ('failure' in held) return held
      hold = held.ok
    }
    const outcome = hold
    return transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) =>
        decidePrepareStart(
          snapshot,
          {
            ...command,
            execution,
            hold: outcome ?? {
              kind: 'held',
              entry: missingEntry(context.ok.call, command.operation),
            },
          },
          mint,
        ),
      commitUnknown(command.operation),
      before.ok.revision,
    )
  }

  const rejectPending: ToolCommands<P, B>['rejectPending'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const reason: unknown = Reflect.get(input, 'reason')
    if (typeof reason !== 'string' || reason.length === 0) return invalid('reason', 'type')
    const exclusion = judgeEvidenceField(Reflect.get(input, 'exclusion'), 'exclusion')
    if ('failure' in exclusion) return exclusion
    const fields = { reason, exclusion: exclusion.ok }
    const command = { ...writeCommand(context.ok, fields), ...fields }
    const before = await peek(context.ok)
    if ('failure' in before) return before
    const record = recordOf(before.ok)
    if ('failure' in record) return record
    const settled = await transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) => decideRejectPending(snapshot, command, text, mint),
      commitUnknown(command.operation),
      before.ok.revision,
    )
    if ('failure' in settled) return settled
    return releaseQueue(context.ok, record.ok, settled.ok)
  }

  /**
   * The timing segment of a foreground start, begun by the clock before the record (P07). The
   * clock is a port with an effect, so the segment is not begun for an operation that a negative
   * answer excluded after the command's first read: the call domain is read once more first. An
   * answer given after that read is still caught by the transaction, which stops the command.
   */
  const beginSegment = async (
    context: WriteEntry<P>,
    since: Snapshot<B>['revision'],
    record: CallRecord,
    invocation: ToolStartRecord,
    outcome: StartProgress,
  ): Promise<Outcome<ClockSegment | null, ToolFailure>> => {
    if (outcome.kind !== 'started' || record.state.relation !== 'foreground') return succeed(null)
    const current = await peek(context)
    if ('failure' in current) return current
    if (excludedSince(current.ok, context.operation, since)) return excluded(context.operation)
    let segment: Awaited<ReturnType<typeof clock.begin>>
    try {
      segment = await clock.begin({
        operation: invocation.operation,
        execution: invocation.execution,
      })
    } catch {
      return unavailable('clock', thrown('clock'))
    }
    if ('failure' in segment) return segment
    return succeed(segment.ok)
  }

  const recordStart: ToolCommands<P, B>['recordStart'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const invocation = judgeStartRecordField(Reflect.get(input, 'invocation'))
    if ('failure' in invocation) return invocation
    const outcome = judgeStartProgressField(Reflect.get(input, 'outcome'))
    if ('failure' in outcome) return outcome
    const fields = { invocation: invocation.ok, outcome: outcome.ok }
    const command = { ...writeCommand(context.ok, fields), ...fields }
    const before = await peek(context.ok)
    if ('failure' in before) return before
    const record = recordOf(before.ok)
    if ('failure' in record) return record
    let segment = null
    if (!committedBefore(before.ok, command.operation)) {
      const begun = await beginSegment(
        context.ok,
        before.ok.revision,
        record.ok,
        invocation.ok,
        outcome.ok,
      )
      if ('failure' in begun) return begun
      segment = begun.ok
    }
    const timing = segment
    const recorded = await transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) =>
        decideRecordStart(
          snapshot,
          { ...command, segment: timing, execution: executionOf(context.ok) },
          text,
          digestOf,
          mint,
        ),
      commitUnknown(command.operation),
      before.ok.revision,
    )
    if ('failure' in recorded) return recorded
    return releaseQueue(context.ok, record.ok, recorded.ok)
  }

  const commands: ToolCommands<P, B> = {
    admit: async input => {
      const admitted = await admissions.admit(input)
      return 'failure' in admitted ? admitted : succeed(admitted.ok.state)
    },
    releaseDelivery: input =>
      mutate(input, 'release-delivery', checked => {
        const judged = judgeRelease(input)
        if ('failure' in judged) return Promise.resolve(judged)
        const command = { ...checked, ...judged.ok, inputDigest: digestOf(judged.ok) }
        return Promise.resolve(succeed((snapshot, mint) => decideRelease(snapshot, command, mint)))
      }),
    control: input => later(input, 'control', 'control', 'controls'),
    acceptDecision: input =>
      later(input, 'accept-decision', 'acceptDecision', 'waits, decisions and resources'),
    acceptResource: input =>
      later(input, 'accept-resource', 'acceptResource', 'waits, decisions and resources'),
    scanPending: () => Promise.resolve(unsupported('scanPending', 'recovery scan')),
    loadRecovery: input => query(input, 'recover', snapshot => readRecovery(snapshot)),
    claim: input => later(input, 'recover', 'claim', 'recovery scan'),
    planPreparation,
    prepared,
    enqueue,
    prepareStart,
    prepareResume: input => write(input, 'prepareResume', 'checkpointed executors'),
    rejectPending,
    recordStart,
    preserveProcess: input =>
      write(input, 'preserveProcess', 'process observation and diagnostics'),
    openWait: input => write(input, 'openWait', 'waits, decisions and resources'),
    attachRegistration: input =>
      write(input, 'attachRegistration', 'waits, decisions and resources'),
    attachResource: input => write(input, 'attachResource', 'waits, decisions and resources'),
    planSuspension: input => write(input, 'planSuspension', 'checkpointed executors'),
    suspend: input => write(input, 'suspend', 'checkpointed executors'),
    preserveResult: input => write(input, 'preserveResult', 'execution facts and release'),
    recordResponse: input => write(input, 'recordResponse', 'waits, decisions and resources'),
    closeWait: input => write(input, 'closeWait', 'waits, decisions and resources'),
    recordControl: input => later(input, 'control', 'recordControl', 'controls'),
    receiveFacts: input =>
      query(input, 'write', () => unsupported('receiveFacts', 'execution facts and release')),
    recordFactAcknowledgement: input =>
      later(input, 'write', 'recordFactAcknowledgement', 'execution facts and release'),
    recordScheduling: input => write(input, 'recordScheduling', 'program executors'),
    recordAccount: input => later(input, 'write', 'recordAccount', 'execution facts and release'),
    planRelease: input => later(input, 'write', 'planRelease', 'execution facts and release'),
    recordRelease: input => later(input, 'write', 'recordRelease', 'execution facts and release'),
    recordLateFact: input =>
      later(input, 'write', 'recordLateFact', 'process observation and diagnostics'),
    recordLateResult: input =>
      later(input, 'write', 'recordLateResult', 'process observation and diagnostics'),
    settleLost: input => later(input, 'write', 'settleLost', 'recovery scan'),
    recordTask: input => later(input, 'write', 'recordTask', 'execution facts and release'),
  }

  const reads: ToolReads<P, B> = {
    lookup: input => fenced(input, 'lookup', 'admission', lookupCall, lookupFence),
    operation: input =>
      fenced(input, 'query-operation', 'operation', resolveOperation, operationFence),
    result: input =>
      query(input, 'read-result', snapshot => {
        const version = decodeToolResultVersion(Reflect.get(input, 'result'))
        if ('failure' in version) return invalid('result', version.failure.reason)
        const after: unknown = Reflect.get(input, 'after')
        if (after !== null && typeof after !== 'string') return invalid('after', 'type')
        return readResultPage(snapshot, {
          result: version.ok,
          after,
          pageBytes: resultPageBytes,
          adoption: toolLedgerAdoption,
        })
      }),
    process: input =>
      query(input, 'read-process', () =>
        unsupported('process', 'process observation and diagnostics'),
      ),
    wait: input =>
      query(input, 'read-wait', () => unsupported('wait', 'waits, decisions and resources')),
    diagnostics: input =>
      query(input, 'read-diagnostics', () =>
        unsupported('diagnostics', 'process observation and diagnostics'),
      ),
    account: input => query(input, 'account', snapshot => readAccount(snapshot)),
    content: {
      read: input =>
        query(input, 'read-content', () =>
          unsupported('content.read', 'execution facts and release'),
        ),
      raw: input =>
        query(input, 'read-content', () =>
          unsupported('content.raw', 'execution facts and release'),
        ),
    },
  }

  const queues = createQueueReconciler<P, B>({
    authorize: input => entry(input, 'recover'),
    read,
    readQueue,
    transactQueue,
  })

  return Object.freeze({
    commands: Object.freeze(commands),
    reads: Object.freeze(reads),
    admissions: Object.freeze(admissions),
    queues: Object.freeze(queues),
  })
}

/**
 * The entry a cross-domain command passes to its decider when its pre-read showed the operation
 * already committed: the transaction recalls the receipt and never reads this value.
 */
function missingEntry(call: ToolCallId, operation: ToolOperationId) {
  return { call, ordinal: '0', stage: 'held', operation, limit: null } as const
}

function decodeToolOperationIdField(
  value: unknown,
  field: string,
): Outcome<ToolOperationId, ToolFailure> {
  const decoded = decodeToolOperationId(value)
  return 'ok' in decoded ? decoded : invalid(field, decoded.failure.reason)
}

/**
 * A preparation record given back by a caller (prepared): its identity fields decode and its
 * request is a fixed request. The decider then compares it with the planned record by digest.
 */
function judgePreparationField(value: unknown): Outcome<PreparationRecord, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid('preparation', 'type')
  const identity = judgePreparationIdentity(value)
  if ('failure' in identity) return identity
  const purpose: unknown = Reflect.get(value, 'purpose')
  if (purpose !== 'initial' && purpose !== 'resume') return invalid('preparation.purpose', 'value')
  const inputDigest: unknown = Reflect.get(value, 'inputDigest')
  if (typeof inputDigest !== 'string') return invalid('preparation.inputDigest', 'type')
  const request = judgeFixedToolRequest(Reflect.get(value, 'request'))
  if ('failure' in request)
    return invalid(`preparation.request.${request.failure.field}`, request.failure.reason)
  const adoption = judgeAdoptionField(Reflect.get(value, 'adoption'), 'preparation.adoption')
  if ('failure' in adoption) return adoption
  return succeed({
    ...identity.ok,
    adoption: adoption.ok,
    inputDigest,
    purpose,
    request: request.ok,
  })
}

/** The protocol identity of a preparation given back by a caller: tenant, call and operation. */
function judgePreparationIdentity(
  value: object,
): Outcome<Pick<PreparationRecord, 'tenant' | 'call' | 'operation'>, ToolFailure> {
  const tenant: unknown = Reflect.get(value, 'tenant')
  if (!isTenantShape(tenant)) return invalid('preparation.tenant', 'type')
  const call = decodeToolCallId(Reflect.get(value, 'call'))
  if ('failure' in call) return invalid('preparation.call', call.failure.reason)
  const operation = decodeToolOperationIdField(
    Reflect.get(value, 'operation'),
    'preparation.operation',
  )
  if ('failure' in operation) return operation
  return succeed({ tenant, call: call.ok, operation: operation.ok })
}

/** An execution reference given back by a caller: tenant shape, call, instance and generation. */
function judgeExecutionRefField(
  value: unknown,
  field: string,
): Outcome<ToolExecutionRef, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid(field, 'type')
  const tenant: unknown = Reflect.get(value, 'tenant')
  if (!isTenantShape(tenant)) return invalid(`${field}.tenant`, 'type')
  const call = decodeToolCallId(Reflect.get(value, 'call'))
  if ('failure' in call) return invalid(`${field}.call`, call.failure.reason)
  const instance = decodeToolInstanceId(Reflect.get(value, 'instance'))
  if ('failure' in instance) return invalid(`${field}.instance`, instance.failure.reason)
  const generation: unknown = Reflect.get(value, 'generation')
  if (typeof generation !== 'string' || generation.length === 0)
    return invalid(`${field}.generation`, 'type')
  return succeed({ tenant, call: call.ok, instance: instance.ok, generation })
}

/** The execution reference a write context names: its instance and generation on the call. */
function executionOf(context: WriteInput): ToolExecutionRef {
  const { tenant, call, instance, generation } = context
  return { tenant, call, instance, generation }
}

/** A start record given back by a caller (recordStart): a `start` kind with decodable identity. */
function judgeStartRecordField(value: unknown): Outcome<ToolStartRecord, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid('invocation', 'type')
  if (Reflect.get(value, 'kind') !== 'start') return invalid('invocation.kind', 'value')
  const operation = decodeToolOperationIdField(
    Reflect.get(value, 'operation'),
    'invocation.operation',
  )
  if ('failure' in operation) return operation
  const executor = judgeAdoptionField(Reflect.get(value, 'executor'), 'invocation.executor')
  if ('failure' in executor) return executor
  const execution = judgeExecutionRefField(Reflect.get(value, 'execution'), 'invocation.execution')
  if ('failure' in execution) return execution
  return succeed({
    kind: 'start',
    operation: operation.ok,
    executor: executor.ok,
    execution: execution.ok,
  })
}

/** The exclusion evidence of a `not-started` or `rejected` start progress. */
function exclusionOf(value: object): Outcome<DurableEvidence, ToolFailure> {
  return judgeEvidenceField(Reflect.get(value, 'exclusion'), 'outcome.exclusion')
}

/** The judgment of each kind of start progress, after the kind was read. */
const START_PROGRESS: Readonly<
  Record<StartProgress['kind'], (value: object) => Outcome<StartProgress, ToolFailure>>
> = {
  started: value => {
    const acceptance = judgeEvidenceField(Reflect.get(value, 'acceptance'), 'outcome.acceptance')
    return 'failure' in acceptance
      ? acceptance
      : succeed({ kind: 'started', acceptance: acceptance.ok })
  },
  unknown: value => {
    const diagnostic: unknown = Reflect.get(value, 'diagnostic')
    return typeof diagnostic === 'string'
      ? succeed({ kind: 'unknown', diagnostic })
      : invalid('outcome.diagnostic', 'type')
  },
  'not-started': value => {
    const exclusion = exclusionOf(value)
    return 'failure' in exclusion
      ? exclusion
      : succeed({ kind: 'not-started', exclusion: exclusion.ok })
  },
  rejected: value => {
    const reason: unknown = Reflect.get(value, 'reason')
    if (typeof reason !== 'string' || reason.length === 0) return invalid('outcome.reason', 'type')
    const exclusion = exclusionOf(value)
    return 'failure' in exclusion
      ? exclusion
      : succeed({ kind: 'rejected', reason, exclusion: exclusion.ok })
  },
}

/** A start progress given by the host (recordStart): one of the four outcomes, closed. */
function judgeStartProgressField(value: unknown): Outcome<StartProgress, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid('outcome', 'type')
  const kind: unknown = Reflect.get(value, 'kind')
  if (typeof kind !== 'string' || !Object.hasOwn(START_PROGRESS, kind))
    return invalid('outcome.kind', 'value')
  // The own key check above makes `kind` one of the four kinds.
  return START_PROGRESS[kind as StartProgress['kind']](value)
}

type ReleaseFields = Readonly<{
  result: ToolResultVersion
  delivery: ToolDeliveryId
  consumer: ConsumerRef
  evidence: Handoff
}>

/** A contract judgment of one input field, with its rejection placed under that field. */
function field<T>(
  judged: Outcome<T, Readonly<{ field: string; reason: string }>>,
  name: string,
  root: string,
): Outcome<T, ToolFailure> {
  if ('ok' in judged) return judged
  const { field: at, reason } = judged.failure
  return invalid(at === root ? name : `${name}.${at}`, reason)
}

/**
 * The release-specific fields of a releaseDelivery input, after the mutation identity. The
 * consumer and the handoff pass the contract's closed checks before anything compares or
 * digests them, so an extra field or a function field is `invalid`, never a digest error.
 */
function judgeRelease(input: object): Outcome<ReleaseFields, ToolFailure> {
  const result = decodeToolResultVersion(Reflect.get(input, 'result'))
  if ('failure' in result) return invalid('result', result.failure.reason)
  const delivery = decodeToolDeliveryId(Reflect.get(input, 'delivery'))
  if ('failure' in delivery) return invalid('delivery', delivery.failure.reason)
  const consumer = field(
    judgeConsumerRef(Reflect.get(input, 'consumer')),
    'consumer',
    'ConsumerRef',
  )
  if ('failure' in consumer) return consumer
  const evidence = field(judgeHandoff(Reflect.get(input, 'evidence')), 'evidence', 'Handoff')
  if ('failure' in evidence) return evidence
  return succeed({
    result: result.ok,
    delivery: delivery.ok,
    consumer: consumer.ok,
    evidence: evidence.ok,
  })
}
