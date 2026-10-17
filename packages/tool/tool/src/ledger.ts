// The ledger factory (G1): `createToolLedger(store, guards, clock, configuration)` gives the
// ToolCommands and ToolReads of this implementation, and the admission entry that the runtime
// uses. Each entry checks its boundary input, asks the guards, reads the domain, lets a pure
// decider answer, and commits by revision. A negative answer of a query is given only after an
// exclusion fence commits; a command of the excluded operation that was in flight then stops
// instead of landing after the negative. Operations of later tickets answer a named
// `unsupported` failure after the same checks; nothing throws for an expected failure, and
// nothing pretends to succeed.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import {
  decodeToolDeliveryId,
  decodeToolOperationId,
  decodeToolResultVersion,
  describedAdoption,
  judgeConsumerRef,
  judgeFixedToolRequest,
  judgeHandoff,
  judgeToolArguments,
  type Adoption,
  type ConsumerRef,
  type FixedToolRequest,
  type Handoff,
  type OperationResolution,
  type Reply,
  type ToolClock,
  type ToolCommands,
  type ToolDeliveryId,
  type ToolFailure,
  type ToolLookup,
  type ToolOperationId,
  type ToolReads,
  type ToolResultVersion,
} from '@omne-harness/tool-contract'
import {
  denied,
  invalid,
  judgeCallInput,
  judgeMutationInput,
  judgeWriteInput,
  type CallInput,
  type MutationInput,
} from './boundary.ts'
import { checkLedgerConfiguration } from './configuration.ts'
import type { ToolLedgerAdmissions, ToolLedgerConfiguration } from './construction.ts'
import { digestOf, isLaterRevision, nextRevision } from './evidence.ts'
import {
  decideAdmit,
  decideRelease,
  snapshotOf,
  stateRevision,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import type { ToolLedgerAction, ToolLedgerGuards } from './ledger-guards.ts'
import { lookupCall, readAccount, readResultPage, resolveOperation } from './ledger-reads.ts'
import {
  exclusionKey,
  type LedgerDomain,
  type LedgerWrite,
  type ToolLedgerStore,
} from './ledger-store.ts'

export type ToolLedger<P, B extends ContentBlock> = Readonly<{
  commands: ToolCommands<P, B>
  reads: ToolReads<P, B>
  /** The admission with the recall flag; `commands.admit` answers its state only. */
  admissions: ToolLedgerAdmissions<P>
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

/**
 * Whether a negative answer about `operation` was given after a command of that operation first
 * read the domain: the snapshot holds an exclusion fence of the operation that is newer than the
 * command's first read. A fence the command saw on its first read is not newer, so a fresh
 * submission after the negative proceeds. A committed operation is never excluded: recall wins.
 */
function excludedSince<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  operation: ToolOperationId,
  firstRead: Snapshot<B>['revision'],
): boolean {
  if (snapshot.operations.has(operation)) return false
  const exclusion = snapshot.exclusions.get(operation)
  return exclusion !== undefined && isLaterRevision(exclusion.revision, firstRead)
}

/** The retryable answer of a command that a negative answer excluded (P01). */
function excluded(operation: ToolOperationId): Outcome<never, ToolFailure> {
  return unavailable(
    'ledger-store',
    `operation ${operation} was excluded by a negative answer; resubmit with the same identity`,
  )
}

/** The writes of an operation's commit also remove the exclusion fence of that operation. */
function withExclusionRemoved<B extends ContentBlock>(
  writes: readonly LedgerWrite<B>[],
  operation: ToolOperationId | null,
): readonly LedgerWrite<B>[] {
  return operation === null ? writes : [...writes, { kind: 'delete', key: exclusionKey(operation) }]
}

/**
 * Creates the ledger. The store keeps the records, the guards answer qualification and policy,
 * the configuration gives the result page size and the commit attempts, and the clock is
 * reserved for the timing segments of later tickets. A bad configuration throws `TypeError`.
 */
export function createToolLedger<P, B extends ContentBlock>(
  store: ToolLedgerStore<B>,
  guards: ToolLedgerGuards<P, B>,
  clock: ToolClock,
  configuration: ToolLedgerConfiguration,
): ToolLedger<P, B> {
  void clock
  checkLedgerConfiguration(configuration)
  const { resultPageBytes, ledgerCommitAttempts: attempts } = configuration

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

  const read = async (domain: LedgerDomain): Promise<Outcome<Snapshot<B>, ToolFailure>> => {
    let result: Awaited<ReturnType<typeof store.read>>
    try {
      result = await store.read(domain)
    } catch {
      return unavailable('ledger-store', thrown('ledger-store'))
    }
    if (result.kind === 'unavailable') return unavailable('ledger-store', result.diagnostic)
    return succeed(snapshotOf(domain, result))
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
   * does not exclude it, and it re-fences instead.
   */
  const transact = async <T>(
    domain: LedgerDomain,
    operation: ToolOperationId | null,
    decide: Decide<T, B>,
    unknown: Outcome<T, ToolFailure>,
  ): Reply<T> => {
    let firstRead: Snapshot<B>['revision'] | null = null
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

  const commitUnknown = (operation: ToolOperationId): Outcome<never, ToolFailure> =>
    fail({ kind: 'commit-unknown', operation })

  const callDomain = (input: CallInput<P>): LedgerDomain => ({
    kind: 'call',
    tenant: input.tenant,
    call: input.call,
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
   * A write-context entry of a later ticket: boundary, access, revision gate, then unsupported.
   * The gate compares with the revision of the current state, which a fence does not change.
   */
  const write = async (input: unknown, name: string, increment: string): Reply<never> => {
    const checked = judgeWriteInput(input)
    if ('failure' in checked) return checked
    const principal = Reflect.get(input as object, 'principal') as P
    const callInput: CallInput<P> = { principal, tenant: checked.ok.tenant, call: checked.ok.call }
    const allowed = await access(callInput, 'write')
    if ('failure' in allowed) return allowed
    return transact(
      callDomain(callInput),
      checked.ok.operation,
      snapshot => ({
        kind: 'reply',
        outcome:
          stateRevision(snapshot) === checked.ok.expected
            ? unsupported(name, increment)
            : fail({ kind: 'stale-revision', current: stateRevision(snapshot) }),
      }),
      commitUnknown(checked.ok.operation),
    )
  }

  /** A mutation entry of a later ticket: boundary, access, then unsupported. */
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
      verdict = await guards.sources.verify({
        principal: checked.principal,
        tenant: checked.tenant,
        call: checked.call,
        invocation: request.invocation,
        consumer: request.consumer,
        scope: request.scope,
      })
    } catch {
      return unavailable('source-guard', thrown('source-guard'))
    }
    if (verdict.kind === 'trusted') return succeed(undefined)
    if (verdict.kind === 'forged') return denied('admit')
    return unavailable('source-guard', verdict.diagnostic)
  }

  const admitTools = {
    arguments: (input: Parameters<typeof judgeToolArguments>[0]) =>
      judgeToolArguments(input, guards.budgets.arguments),
    text: (reason: string) => {
      const made = guards.results.text(reason)
      return 'failure' in made ? made : guards.policy.judgeResult(made.ok)
    },
  }

  const admissions: ToolLedgerAdmissions<P> = {
    admit: input =>
      mutate(input, 'admit', async checked => {
        const judged = judgeFixedToolRequest(Reflect.get(input, 'request'))
        if ('failure' in judged)
          return invalid(`request.${judged.failure.field}`, judged.failure.reason)
        const request = judged.ok
        const trusted = await verifySource(checked, request)
        if ('failure' in trusted) return trusted
        const command = { ...checked, request, inputDigest: digestOf(request) }
        return succeed((snapshot, mint) => decideAdmit(snapshot, command, admitTools, mint))
      }),
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
    control: input => later(input, 'control', 'control', 'ticket 08'),
    acceptDecision: input => later(input, 'accept-decision', 'acceptDecision', 'ticket 12'),
    acceptResource: input => later(input, 'accept-resource', 'acceptResource', 'ticket 12'),
    scanPending: () => Promise.resolve(unsupported('scanPending', 'ticket 10')),
    loadRecovery: input => query(input, 'recover', () => unsupported('loadRecovery', 'ticket 10')),
    claim: input => later(input, 'recover', 'claim', 'ticket 10'),
    planPreparation: input => write(input, 'planPreparation', 'ticket 06'),
    prepared: input => write(input, 'prepared', 'ticket 06'),
    enqueue: input => write(input, 'enqueue', 'ticket 06'),
    prepareStart: input => write(input, 'prepareStart', 'ticket 06'),
    prepareResume: input => write(input, 'prepareResume', 'checkpointed executors'),
    rejectPending: input => write(input, 'rejectPending', 'ticket 06'),
    recordStart: input => write(input, 'recordStart', 'ticket 06'),
    preserveProcess: input => write(input, 'preserveProcess', 'ticket 09'),
    openWait: input => write(input, 'openWait', 'ticket 12'),
    attachCard: input => write(input, 'attachCard', 'ticket 12'),
    attachResource: input => write(input, 'attachResource', 'ticket 12'),
    planSuspension: input => write(input, 'planSuspension', 'checkpointed executors'),
    suspend: input => write(input, 'suspend', 'checkpointed executors'),
    preserveResult: input => write(input, 'preserveResult', 'ticket 06'),
    recordResponse: input => write(input, 'recordResponse', 'ticket 12'),
    closeWait: input => write(input, 'closeWait', 'ticket 12'),
    recordControl: input => later(input, 'control', 'recordControl', 'ticket 08'),
    receiveFacts: input => query(input, 'write', () => unsupported('receiveFacts', 'ticket 06')),
    recordFactAcknowledgement: input =>
      later(input, 'write', 'recordFactAcknowledgement', 'ticket 06'),
    recordScheduling: input => write(input, 'recordScheduling', 'program executors'),
    recordAccount: input => later(input, 'write', 'recordAccount', 'ticket 06'),
    planRelease: input => later(input, 'write', 'planRelease', 'ticket 06'),
    recordRelease: input => later(input, 'write', 'recordRelease', 'ticket 06'),
    recordLateFact: input => later(input, 'write', 'recordLateFact', 'ticket 09'),
    recordLateResult: input => later(input, 'write', 'recordLateResult', 'ticket 09'),
    settleLost: input => later(input, 'write', 'settleLost', 'ticket 10'),
    recordTask: input => later(input, 'write', 'recordTask', 'ticket 06'),
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
    process: input => query(input, 'read-process', () => unsupported('process', 'ticket 09')),
    wait: input => query(input, 'read-wait', () => unsupported('wait', 'ticket 12')),
    diagnostics: input =>
      query(input, 'read-diagnostics', () => unsupported('diagnostics', 'ticket 09')),
    account: input => query(input, 'account', snapshot => readAccount(snapshot)),
    content: {
      read: input => query(input, 'read-content', () => unsupported('content.read', 'ticket 06')),
      raw: input => query(input, 'read-content', () => unsupported('content.raw', 'ticket 06')),
    },
  }

  return Object.freeze({
    commands: Object.freeze(commands),
    reads: Object.freeze(reads),
    admissions: Object.freeze(admissions),
  })
}

function decodeToolOperationIdField(
  value: unknown,
  field: string,
): Outcome<ToolOperationId, ToolFailure> {
  const decoded = decodeToolOperationId(value)
  return 'ok' in decoded ? decoded : invalid(field, decoded.failure.reason)
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
