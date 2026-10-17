// The ledger factory (G1): `createToolLedger(store, guards, clock)` gives the ToolCommands and
// ToolReads of this implementation. Each entry checks its boundary input, asks the guards, reads
// the domain, lets a pure decider answer, and commits by revision. Operations of later tickets
// answer a named `unsupported` failure after the same checks; nothing throws for an expected
// failure, and nothing pretends to succeed.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import {
  decodeToolDeliveryId,
  decodeToolOperationId,
  decodeToolResultVersion,
  describedAdoption,
  judgeFixedToolRequest,
  judgeToolArguments,
  type Adoption,
  type ConsumerRef,
  type DurableEvidence,
  type FixedToolRequest,
  type Handoff,
  type Reply,
  type ToolClock,
  type ToolCommands,
  type ToolDeliveryId,
  type ToolFailure,
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
import { digestOf, nextRevision } from './evidence.ts'
import {
  decideAdmit,
  decideRelease,
  snapshotOf,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import type { ToolLedgerAction, ToolLedgerGuards } from './ledger-guards.ts'
import { lookupCall, readAccount, readResultPage, resolveOperation } from './ledger-reads.ts'
import type { LedgerDomain, ToolLedgerStore } from './ledger-store.ts'

export type ToolLedger<P, B extends ContentBlock> = Readonly<{
  commands: ToolCommands<P, B>
  reads: ToolReads<P, B>
}>

/** The identity of this ledger implementation, named in its `unsupported` answers. */
export const toolLedgerAdoption: Adoption = describedAdoption({
  owner: '@omne-harness/tool',
  name: 'tool-ledger',
  revision: '1',
})

/** How many times a command re-reads and re-decides after a revision conflict before it gives up. */
const COMMIT_ATTEMPTS = 8

function describeThrown(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'thrown'
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
 * Creates the ledger. The store keeps the records, the guards answer qualification and policy,
 * and the clock is reserved for the timing segments of later tickets.
 */
export function createToolLedger<P, B extends ContentBlock>(
  store: ToolLedgerStore<B>,
  guards: ToolLedgerGuards<P, B>,
  clock: ToolClock,
): ToolLedger<P, B> {
  void clock
  const access = async (
    input: CallInput<P>,
    action: ToolLedgerAction,
  ): Promise<Outcome<void, ToolFailure>> => {
    let verdict: Awaited<ReturnType<typeof guards.access.qualify>>
    try {
      verdict = await guards.access.qualify({ ...input, action })
    } catch (error) {
      return unavailable('access-guard', describeThrown(error))
    }
    if (verdict.kind === 'allowed') return succeed(undefined)
    if (verdict.kind === 'denied') return denied(action)
    return unavailable('access-guard', verdict.diagnostic)
  }

  const read = async (domain: LedgerDomain): Promise<Outcome<Snapshot<B>, ToolFailure>> => {
    let result: Awaited<ReturnType<typeof store.read>>
    try {
      result = await store.read(domain)
    } catch (error) {
      return unavailable('ledger-store', describeThrown(error))
    }
    if (result.kind === 'unavailable') return unavailable('ledger-store', result.diagnostic)
    return succeed(snapshotOf(domain, result))
  }

  /** Reads, decides and commits by revision. A conflict re-reads; an unknown commit is reported. */
  const transact = async <T>(
    domain: LedgerDomain,
    operation: ToolOperationId,
    decide: Decide<T, B>,
  ): Reply<T> => {
    for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt += 1) {
      const snapshot = await read(domain)
      if ('failure' in snapshot) return snapshot
      const revision = nextRevision(snapshot.ok.revision)
      const decision = decide(snapshot.ok, { revision })
      if (decision.kind === 'reply') return decision.outcome
      const committed = await commit(domain, snapshot.ok.revision, revision, decision.writes)
      if (committed.kind === 'committed') return succeed(decision.value)
      if (committed.kind === 'unknown') return fail({ kind: 'commit-unknown', operation })
      if (committed.kind === 'unavailable') return unavailable('ledger-store', committed.diagnostic)
    }
    return unavailable('ledger-store', `${COMMIT_ATTEMPTS} revision conflicts in a row`)
  }

  const commit = async (
    domain: LedgerDomain,
    expected: Snapshot<B>['revision'],
    revision: Snapshot<B>['revision'],
    writes: Extract<Decision<unknown, B>, { kind: 'commit' }>['writes'],
  ): Promise<Awaited<ReturnType<typeof store.commit>>> => {
    try {
      return await store.commit({ domain, expected, revision, writes })
    } catch (error) {
      // The store may have applied the writes before it threw, so the outcome is unknown.
      return { kind: 'unknown', diagnostic: describeThrown(error) }
    }
  }

  const callDomain = (input: CallInput<P>): LedgerDomain => ({
    kind: 'call',
    tenant: input.tenant,
    call: input.call,
  })

  /** A read entry: boundary, access, snapshot, projection. */
  const query = async <T>(
    input: unknown,
    action: ToolLedgerAction,
    project: (snapshot: Snapshot<B>, checked: CallInput<P>) => Outcome<T, ToolFailure>,
  ): Reply<T> => {
    const checked = judgeCallInput<P>(input, action)
    if ('failure' in checked) return checked
    const allowed = await access(checked.ok, action)
    if ('failure' in allowed) return allowed
    const snapshot = await read(callDomain(checked.ok))
    if ('failure' in snapshot) return snapshot
    return project(snapshot.ok, checked.ok)
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
    return transact(callDomain(checked.ok), checked.ok.operation, decider.ok)
  }

  /** A write-context entry of a later ticket: boundary, access, revision gate, then unsupported. */
  const write = async (input: unknown, name: string, increment: string): Reply<never> => {
    const checked = judgeWriteInput(input)
    if ('failure' in checked) return checked
    const principal = Reflect.get(input as object, 'principal') as P
    const callInput: CallInput<P> = { principal, tenant: checked.ok.tenant, call: checked.ok.call }
    const allowed = await access(callInput, 'write')
    if ('failure' in allowed) return allowed
    return transact(callDomain(callInput), checked.ok.operation, snapshot => ({
      kind: 'reply',
      outcome:
        snapshot.revision === checked.ok.expected
          ? unsupported(name, increment)
          : fail({ kind: 'stale-revision', current: snapshot.revision }),
    }))
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
    } catch (error) {
      return unavailable('source-guard', describeThrown(error))
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

  const commands: ToolCommands<P, B> = {
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
    lookup: input =>
      query(input, 'lookup', snapshot => {
        const admission = decodeToolOperationIdField(Reflect.get(input, 'admission'), 'admission')
        return 'failure' in admission ? admission : succeed(lookupCall(snapshot, admission.ok))
      }),
    operation: input =>
      query(input, 'query-operation', snapshot => {
        const operation = decodeToolOperationIdField(Reflect.get(input, 'operation'), 'operation')
        return 'failure' in operation
          ? operation
          : succeed(resolveOperation(snapshot, operation.ok))
      }),
    result: input =>
      query(input, 'read-result', snapshot => {
        const version = decodeToolResultVersion(Reflect.get(input, 'result'))
        if ('failure' in version) return invalid('result', version.failure.reason)
        const after: unknown = Reflect.get(input, 'after')
        if (after !== null && typeof after !== 'string') return invalid('after', 'type')
        return readResultPage(snapshot, {
          result: version.ok,
          after,
          pageBytes: guards.budgets.resultPageBytes,
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

  return Object.freeze({ commands: Object.freeze(commands), reads: Object.freeze(reads) })
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

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isConsumer(value: unknown): value is ConsumerRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['owner', 'work', 'position', 'purpose'].every(key => filled(Reflect.get(value, key)))
  )
}

function isEvidence(value: unknown): value is DurableEvidence {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['owner', 'record', 'revision', 'digest'].every(key => filled(Reflect.get(value, key)))
  )
}

function judgeHandoff(value: unknown): Outcome<Handoff, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid('evidence', 'type')
  const kind: unknown = Reflect.get(value, 'kind')
  if (kind === 'retained') {
    const custody: unknown = Reflect.get(value, 'custody')
    return isEvidence(custody) ? succeed({ kind, custody }) : invalid('evidence.custody', 'type')
  }
  if (kind === 'processed') {
    const completion: unknown = Reflect.get(value, 'completion')
    return isEvidence(completion)
      ? succeed({ kind, completion })
      : invalid('evidence.completion', 'type')
  }
  return invalid('evidence.kind', 'value')
}

/** The release-specific fields of a releaseDelivery input, after the mutation identity. */
function judgeRelease(input: object): Outcome<ReleaseFields, ToolFailure> {
  const result = decodeToolResultVersion(Reflect.get(input, 'result'))
  if ('failure' in result) return invalid('result', result.failure.reason)
  const delivery = decodeToolDeliveryId(Reflect.get(input, 'delivery'))
  if ('failure' in delivery) return invalid('delivery', delivery.failure.reason)
  const consumer: unknown = Reflect.get(input, 'consumer')
  if (!isConsumer(consumer)) return invalid('consumer', 'type')
  const evidence = judgeHandoff(Reflect.get(input, 'evidence'))
  if ('failure' in evidence) return evidence
  return succeed({ result: result.ok, delivery: delivery.ok, consumer, evidence: evidence.ok })
}
