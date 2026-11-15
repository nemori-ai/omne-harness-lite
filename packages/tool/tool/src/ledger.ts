import { createBodyWriting, instantAfter } from './ledger-body-writer.ts'
import { createLedgerSweep, type ToolLedgerSweep } from './ledger-sweep.ts'
import type { ToolBodyWrites } from '@omne-harness/tool-contract/provider'
import { firstResultReference } from './result-address.ts'
import { answerOf, createLedgerTransactions, type Decide } from './ledger-transactions.ts'
import { createLedgerAccess } from './ledger-access.ts'
import { activateResultDecision } from './ledger-result-activation.ts'
import { systemBodyPolicy } from './result-offloading.ts'
import {
  createResultPreparation,
  type PendingSynthetic,
  type SyntheticDecider,
} from './ledger-result-preparation.ts'
import { authoredBodyOf, readResultValue } from './ledger-result-material.ts'
import type { ResultRecord } from './ledger-store.ts'
import { factValues } from './fact-values.ts'
import { adoptFinalFact, restoreSavedFact } from './ledger-final-fact.ts'
import { createLedgerFinalPlanner } from './ledger-final-planning.ts'
import { matchEnvironmentAdoption } from './environment-adoption.ts'
import { controlIntent } from './control-intent.ts'
import { controlProgress } from './control-progress.ts'
import { decideControl, decideRecordControl } from './ledger-control.ts'
import { settleLostWith } from './ledger-lost.ts'
import { controlSubject, createLedgerControls } from './ledger-control-subjects.ts'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type Adoption,
  type ClockSegment,
  type ConsumerRef,
  type DurableEvidence,
  type FixedToolRequest,
  type Handoff,
  type OperationResolution,
  type ControlReceipt,
  type Reply,
  type ToolCallId,
  type ToolDeliveryId,
  type ToolExecutionRef,
  type ToolFailure,
  type ToolLookup,
  type ToolOperationId,
  type ToolResultVersion,
  type ToolResult,
  type ToolStartRecord,
  type ToolState,
  type ToolTiming,
  type ToolWaitId,
  type DecisionValue,
} from '@omne-harness/tool-contract'
import {
  type CallAccess,
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolWaitId,
  describedAdoption,
  judgeConsumerRef,
  judgeFixedToolRequest,
  judgeHandoff,
  judgeToolArguments,
  type PreparationRecord,
  type ReleaseRecord,
  type StartProgress,
  type ToolClock,
  type ToolCommands,
  type ToolReads,
  type ToolFinalPlanner,
} from '@omne-harness/tool-contract/provider'
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
  ToolLedgerRejections,
  ToolLedgerFacts,
  ToolLedgerPorts,
  ToolLedgerControls,
  ToolLedgerRecovery,
} from './construction.ts'
import { fixJsonTree } from './json-tree.ts'
import {
  fixFactAcknowledgement,
  fixFactBasis,
  fixFactInput,
  judgeStartRecord,
} from './facts-boundary.ts'
import { checkFactAcknowledgement, decideFactAcknowledgement } from './ledger-fact-ack.ts'
import { checkFactBatch, decideReceiveFacts, readSavedFact } from './ledger-facts.ts'
import { digestOf, nextRevision, sameFactValue } from './evidence.ts'
import {
  decideAdmit,
  decideRelease,
  stateRevision,
  ledgerText,
  terminalText,
  type Decision,
  type Snapshot,
} from './ledger-decider.ts'
import { fixCleanupFields, fixReleaseOutcome } from './cleanup-boundary.ts'
import {
  decideAttachRegistration,
  decideBlockRegistration,
  decideClosePark,
  decideCompleteInvalidation,
  decidePlanSuspension,
  decideSuspend,
  parkDutyOf,
} from './ledger-suspension.ts'
import {
  judgeCheckpointField,
  judgeCheckpointStateField,
  judgeSuspensionField,
} from './suspension-boundary.ts'
import {
  decideAcceptDecision,
  decideCloseWait,
  decidePrepareResume,
  decideResumePlan,
  refuseDecision,
  refuseResume,
} from './ledger-resumption.ts'
import {
  decidePlanRelease,
  checkRelease,
  decideRecordRelease,
  decideRecordFactsTask,
} from './ledger-environment-release.ts'
import { checkSettlement, decidePreserveResult } from './ledger-settlement.ts'
import { excluded, excludedSince } from './ledger-exclusion.ts'
import type { ToolLedgerAction, ToolLedgerGuards } from './ledger-guards.ts'
import { createLedgerContent, fixResultInput } from './ledger-content.ts'
import { createLedgerBodyReads } from './ledger-body-reads.ts'
import { createQueueReconciler } from './ledger-queue.ts'
import {
  lookupCall,
  readAccount,
  readRecovery,
  readResultPage,
  resultRecord,
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
  decideQueuePark,
  decideQueueReady,
  decideQueueRelease,
  decideQueueRequeue,
  decideRecordStart,
  decideLedgerRejected,
  decideRejectPending,
  queueKeyOf,
  queueSnapshotOf,
  refuseEnqueue,
  refusePlan,
  refuseStart,
  releaseBasisOf,
  wrongPhase,
  type QueueSnapshot,
  type WriteCommand,
} from './ledger-start.ts'
import {
  CALL_DUE_KEY,
  type CallRecord,
  type LedgerDomain,
  type LedgerPendingScanInput,
  type PendingCall,
  type QueueEntryRecord,
  type ToolLedgerStore,
} from './ledger-store.ts'

export type ToolLedger<P, B extends ContentBlock> = Readonly<{
  delivery: Readonly<{
    read(input: CallAccess<P> & Readonly<{ result: ToolResultVersion }>): Reply<ToolResult<B>>
  }>
  bodyWrites: ToolBodyWrites<P>
  sweep: ToolLedgerSweep['sweep']
  finalPlanner: ToolFinalPlanner<P, B>
  controls: ToolLedgerControls<P>
  commands: ToolCommands<P, B>
  reads: ToolReads<P, B>
  admissions: ToolLedgerAdmissions<P>
  queues: ToolLedgerQueues<P>
  rejections: ToolLedgerRejections<P>
  facts: ToolLedgerFacts<P, B>
  recovery: ToolLedgerRecovery
}>

const SCAN_LIMIT = 1000

export const toolLedgerAdoption: Adoption = describedAdoption({
  owner: '@omne-harness/tool',
  name: 'tool-ledger',
  revision: '1',
})

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

type DecideQueue<T> = (snapshot: QueueSnapshot) => Decision<T>

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

type WriteEntry<P> = WriteInput & Readonly<{ principal: P }>

export function createToolLedger<P, B extends ContentBlock>(
  store: ToolLedgerStore,
  guards: ToolLedgerGuards<P, B>,
  clock: ToolClock,
  configuration: ToolLedgerConfiguration,
  settlement: ToolLedgerPorts<P>,
): ToolLedger<P, B> {
  checkLedgerConfiguration(configuration)
  if (typeof settlement?.releaseInspection?.inspectRelease !== 'function')
    throw new TypeError('settlement.releaseInspection.inspectRelease: missing')
  if (settlement.content !== null && typeof settlement.content?.read !== 'function')
    throw new TypeError('settlement.content.read: missing (use null to disable byte reads)')
  const { resultPageBytes, ledgerCommitAttempts: attempts, queueCapacity } = configuration

  const { access, entry } = createLedgerAccess(guards.access)

  const { readDomain, read, commit, transact } = createLedgerTransactions(store, attempts)

  const readQueue = async (
    domain: Extract<LedgerDomain, { kind: 'queue' }>,
  ): Promise<Outcome<QueueSnapshot, ToolFailure>> => {
    const result = await readDomain(domain)
    return 'failure' in result ? result : succeed(queueSnapshotOf(domain, result.ok))
  }

  const scanStore = async (
    input: LedgerPendingScanInput,
  ): Reply<Readonly<{ calls: readonly PendingCall[]; more: boolean }>> => {
    let answer: Awaited<ReturnType<typeof store.scanPending>>
    try {
      answer = await store.scanPending(input)
    } catch {
      return unavailable('ledger-store', thrown('ledger-store'))
    }
    if (answer.kind === 'unavailable') return unavailable('ledger-store', answer.diagnostic)
    if (answer.kind === 'unsupported')
      return fail({ kind: 'unsupported', adoption: toolLedgerAdoption, reason: answer.reason })
    return succeed({ calls: answer.calls, more: answer.more })
  }

  const judgeLimit = (value: unknown): Outcome<number, ToolFailure> =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= SCAN_LIMIT
      ? succeed(value)
      : invalid('limit', `expected an integer from 1 to ${SCAN_LIMIT}`)

  const scanPending: ToolCommands<P, B>['scanPending'] = async input => {
    if (typeof input !== 'object' || input === null) return invalid('input', 'type')
    const tenant: unknown = Reflect.get(input, 'tenant')
    if (!isTenantShape(tenant) || !('principal' in input)) return denied('recover')
    const limit = judgeLimit(Reflect.get(input, 'limit'))
    if ('failure' in limit) return limit
    const cursor: unknown = Reflect.get(input, 'after')
    let after: PendingCall | null = null
    if (cursor !== null) {
      const call = decodeToolCallId(cursor)
      if ('failure' in call) return invalid('after', call.failure.reason)
      after = { tenant, call: call.ok }
    }
    const page = await scanStore({ tenant, after, limit: limit.ok })
    if ('failure' in page) return page
    const principal = Reflect.get(input, 'principal') as P
    for (const listed of page.ok.calls) {
      const allowed = await access({ principal, tenant, call: listed.call }, 'recover')
      if ('failure' in allowed) return allowed
    }
    const last = page.ok.calls.at(-1)
    return succeed({
      calls: page.ok.calls.map(listed => listed.call),
      next: page.ok.more && last !== undefined ? last.call : null,
    })
  }

  const recovery: ToolLedgerRecovery = {
    scan: async input => {
      if (typeof input !== 'object' || input === null) return invalid('input', 'type')
      const limit = judgeLimit(Reflect.get(input, 'limit'))
      if ('failure' in limit) return limit
      const after: unknown = Reflect.get(input, 'after')
      if (after !== null) {
        if (typeof after !== 'object' || !isTenantShape(Reflect.get(after, 'tenant')))
          return invalid('after', 'tenant')
        const call = decodeToolCallId(Reflect.get(after, 'call'))
        if ('failure' in call) return invalid('after', call.failure.reason)
      }
      const page = await scanStore({
        tenant: null,
        after: after as PendingCall | null,
        limit: limit.ok,
      })
      if ('failure' in page) return page
      const last = page.ok.calls.at(-1)
      return succeed({
        calls: page.ok.calls,
        next: page.ok.more && last !== undefined ? last : null,
      })
    },
  }

  const transactQueue = async <T>(
    domain: Extract<LedgerDomain, { kind: 'queue' }>,
    decide: DecideQueue<T>,
    unknown: Outcome<T, ToolFailure>,
  ): Reply<T> => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const snapshot = await readQueue(domain)
      if ('failure' in snapshot) return snapshot
      const decision = decide(snapshot.ok)
      if (decision.kind === 'reply') return decision.outcome
      const revision = nextRevision(snapshot.ok.revision)
      const committed = await commit(domain, snapshot.ok.revision, revision, decision.writes)
      const answer = answerOf(committed, decision.value, unknown)
      if (answer !== null) return answer
    }
    return unavailable('ledger-store', `${attempts} revision conflicts in a row`)
  }

  const commitUnknown = (operation: ToolOperationId): Outcome<never, ToolFailure> =>
    fail({ kind: 'commit-unknown', operation })

  const callDomain = (
    input: Readonly<{ tenant: CallInput<P>['tenant']; call: ToolCallId }>,
  ): LedgerDomain => ({
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

  const query = async <T>(
    input: unknown,
    action: ToolLedgerAction,
    project: (snapshot: Snapshot, checked: CallInput<P>) => Outcome<T, ToolFailure>,
  ): Reply<T> => {
    const checked = await entry(input, action)
    if ('failure' in checked) return checked
    const snapshot = await read(callDomain(checked.ok))
    if ('failure' in snapshot) return snapshot
    return project(snapshot.ok, checked.ok)
  }

  const fenced = async <T>(
    input: unknown,
    action: ToolLedgerAction,
    field: 'admission' | 'operation',
    project: (snapshot: Snapshot, operation: ToolOperationId) => T,
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
        const clock = settlement.bodies?.clock
        return {
          kind: 'commit',
          writes: [
            { kind: 'put', record: { kind: 'exclusion', exclusion } },
            ...(snapshot.call === null && clock !== undefined
              ? [
                  {
                    kind: 'schedule' as const,
                    key: CALL_DUE_KEY,
                    dueAt: instantAfter(clock.now(), configuration.offloading.orphanGraceMs),
                  },
                ]
              : []),
          ],
          value: answer,
        }
      },
      fence.unknown,
    )
  }

  const mutate = async <T>(
    input: unknown,
    action: ToolLedgerAction,
    decide: (checked: MutationInput<P>) => Promise<Outcome<Decide<T>, ToolFailure>>,
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

  const writeEntry = async (input: unknown): Promise<Outcome<WriteEntry<P>, ToolFailure>> => {
    const checked = judgeWriteInput(input)
    if ('failure' in checked) return checked
    if (!('principal' in (input as object))) return denied('write')
    const principal = Reflect.get(input as object, 'principal') as P
    const allowed = await access(
      { principal, tenant: checked.ok.tenant, call: checked.ok.call },
      'write',
    )
    if ('failure' in allowed) return allowed
    return succeed({ ...checked.ok, principal })
  }

  const writeCommand = (context: WriteEntry<P>, fields: unknown): WriteCommand => ({
    tenant: context.tenant,
    call: context.call,
    operation: context.operation,
    expected: context.expected,
    inputDigest: digestOf(fields),
  })

  const peek = async (context: WriteEntry<P>): Promise<Outcome<Snapshot, ToolFailure>> =>
    read(callDomain(context))

  const committedBefore = (snapshot: Snapshot, operation: ToolOperationId): boolean =>
    snapshot.operations.has(operation)

  const recordOf = (snapshot: Snapshot): Outcome<CallRecord, ToolFailure> => {
    const call = snapshot.call
    if (call === null) return invalid('call', 'unknown-call')
    return succeed(call)
  }

  const preGate = (
    snapshot: Snapshot,
    context: WriteEntry<P>,
  ): Outcome<CallRecord, ToolFailure> => {
    const record = recordOf(snapshot)
    if ('failure' in record) return record
    if (stateRevision(snapshot) !== context.expected)
      return fail({ kind: 'stale-revision', current: stateRevision(snapshot) })
    return record
  }

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

  const later = (input: unknown, action: ToolLedgerAction, name: string, increment: string) =>
    mutate<never>(input, action, () =>
      Promise.resolve(succeed(() => ({ kind: 'reply', outcome: unsupported(name, increment) }))),
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
    if (verdict.kind === 'forged' || verdict.kind === 'denied') return denied('admit')
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
  const closedText = (closedResult: string) => ledgerText(closedResult, admitTools.text)

  const bodyWriting = createBodyWriting<P>({
    bodies: settlement.bodies,
    ...(settlement.bodySchemas === undefined ? {} : { bodySchemas: settlement.bodySchemas }),
    configuration,
    entry,
    load: input => read(callDomain(input)),
    transact,
  })

  const settleSynthetic = async <T>(
    context: MutationInput<P>,
    action: ToolLedgerAction,
    inputDigest: string,
    decide: SyntheticDecider<T>,
    since: Snapshot['revision'] | null = null,
  ): Reply<T> => {
    const before = await read(callDomain(context))
    if ('failure' in before) return before
    const firstRead = since ?? before.ok.revision
    if (excludedSince(before.ok, context.operation, firstRead)) return excluded(context.operation)
    const initial = decide(before.ok, { revision: nextRevision(before.ok.revision) }, null)
    let prepared: PendingSynthetic | null = null
    if (initial.kind === 'prepare-synthetic') {
      const target = firstResultReference({
        tenant: context.tenant,
        call: context.call,
        admission: before.ok.call?.admission ?? context.operation,
      })
      if ('failure' in target) return target
      const prepare = createResultPreparation<P, B>({
        authorize: input => entry(input, action),
        writeBody: bodyWriting.writeBody,
        transact,
        text,
        closedText,
        policy: systemBodyPolicy(configuration.offloading, configuration.readResultArguments),
        target: target.ok,
        delivery: { pageBytes: resultPageBytes },
      })
      const value = await prepare({ ...context, inputDigest }, initial.need, snapshot => {
        if (excludedSince(snapshot, context.operation, firstRead))
          return excluded(context.operation)
        const current = decide(snapshot, { revision: nextRevision(snapshot.revision) }, null)
        if (
          current.kind === 'prepare-synthetic' &&
          digestOf(current.need) === digestOf(initial.need)
        )
          return succeed(undefined)
        if (current.kind === 'reply' && 'failure' in current.outcome) return current.outcome
        return unavailable(
          'result-preparation',
          'the original settlement changed during preparation',
        )
      })
      if ('failure' in value) {
        const current = await read(callDomain(context))
        if ('failure' in current) return current
        if (excludedSince(current.ok, context.operation, firstRead))
          return excluded(context.operation)
        if (!current.ok.operations.has(context.operation))
          return value.failure.kind === 'commit-unknown' &&
            value.failure.operation !== context.operation
            ? unavailable('result-preparation', 'preparation has an unresolved commit')
            : value
      } else prepared = value.ok
    }
    return transact(
      callDomain(context),
      context.operation,
      async (snapshot, mint) => {
        const allowed = await access(context, action)
        if ('failure' in allowed) return { kind: 'reply', outcome: allowed }
        const current = decide(snapshot, mint, null)
        if (current.kind !== 'prepare-synthetic') return current
        if (prepared === null)
          return {
            kind: 'reply',
            outcome: unavailable('result-preparation', 'prepared channels are unavailable'),
          }
        const pending = prepared
        return activateResultDecision(
          pending.state.prepared,
          settlement.bodies?.clock,
          async value => {
            const qualified = await access(context, action)
            if ('failure' in qualified) return { kind: 'reply', outcome: qualified }
            const decision = decide(snapshot, mint, {
              ...pending,
              state: { kind: 'prepared', value },
            })
            return decision.kind === 'prepare-synthetic'
              ? {
                  kind: 'reply',
                  outcome: unavailable('result-preparation', 'prepared channels are unavailable'),
                }
              : decision
          },
        )
      },
      commitUnknown(context.operation),
      firstRead,
    )
  }

  const queueLoad = async (
    checked: MutationInput<P>,
    request: FixedToolRequest,
  ): Promise<Outcome<Readonly<{ load: number; capacity: number }> | null, ToolFailure>> => {
    if (request.availability.kind !== 'available') return succeed(null)
    const snapshot = await readQueue(queueDomain(checked.tenant, request))
    if ('failure' in snapshot) return snapshot
    return succeed({ load: snapshot.ok.entries.size, capacity: queueCapacity })
  }

  const order = async (
    context: Readonly<{
      tenant: CallInput<P>['tenant']
      call: ToolCallId
      operation: ToolOperationId
    }>,
    request: FixedToolRequest,
    first: Snapshot,
    gate: (snapshot: Snapshot) => Outcome<unknown, ToolFailure>,
  ): Promise<Outcome<QueueEntryRecord, ToolFailure>> => {
    const domain = queueDomain(context.tenant, request)
    const command = {
      call: context.call,
      operation: context.operation,
      tool: request.availability.definition.name,
      limit: request.limits.concurrency,
      scopeBudget: request.limits.scopeBudget,
    }
    let judged = first
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const allowed = gate(judged)
      if ('failure' in allowed) return allowed
      const queue = await readQueue(domain)
      if ('failure' in queue) return queue
      const decision = decideQueueOrder(queue.ok, command)
      if (decision.kind === 'reply') return decision.outcome
      const committed = await commit(
        domain,
        queue.ok.revision,
        nextRevision(queue.ok.revision),
        decision.writes,
        [{ domain: callDomain(context), revision: judged.revision }],
      )
      const answer = answerOf(committed, decision.value, commitUnknown(context.operation))
      if (answer !== null) return answer
      const current = await read(callDomain(context))
      if ('failure' in current) return current
      judged = current.ok
    }
    return unavailable('ledger-store', `${attempts} revision conflicts in a row`)
  }

  const stillAccepted = (snapshot: Snapshot): Outcome<void, ToolFailure> => {
    const record = recordOf(snapshot)
    if ('failure' in record) return record
    return record.ok.state.phase === 'accepted'
      ? succeed(undefined)
      : wrongPhase(record.ok.state.phase)
  }

  const assignOrdinal = async (checked: MutationInput<P>, request: FixedToolRequest) => {
    const current = await read(callDomain(checked))
    if ('failure' in current) return
    await order(checked, request, current.ok, stillAccepted)
  }

  const admissions: ToolLedgerAdmissions<P> = {
    admit: async input => {
      const checked = judgeMutationInput<P>(input, 'admit')
      if ('failure' in checked) return checked
      const allowed = await access(checked.ok, 'admit')
      if ('failure' in allowed) return allowed
      const judged = judgeFixedToolRequest(Reflect.get(input, 'request'))
      if ('failure' in judged)
        return invalid(`request.${judged.failure.field}`, judged.failure.reason)
      const request = judged.ok
      const trusted = await verifySource(checked.ok, request)
      if ('failure' in trusted) return trusted
      const granted = await verifyGrant(checked.ok, request)
      if ('failure' in granted) return granted
      const queue = await queueLoad(checked.ok, request)
      if ('failure' in queue) return queue
      const command = { ...checked.ok, request, inputDigest: digestOf(request), queue: queue.ok }
      const admitted = await settleSynthetic(
        checked.ok,
        'admit',
        command.inputDigest,
        (snapshot, mint, prepared) => decideAdmit(snapshot, command, admitTools, mint, prepared),
      )
      if ('ok' in admitted && !admitted.ok.recovered && admitted.ok.state.phase === 'accepted')
        await assignOrdinal(checked.ok, request)
      return admitted
    },
  }

  const releaseQueue = async (
    context: WriteEntry<P>,
    record: CallRecord,
    state: ToolState,
  ): Reply<ToolState> => {
    if (state.phase !== 'settled' || record.request.availability.kind !== 'available')
      return succeed(state)
    const current = await peek(context)
    if ('failure' in current) return current
    const basis = releaseBasisOf(current.ok)
    if (basis === null) return succeed(state)
    const released = await transactQueue(
      queueDomain(context.tenant, record.request),
      snapshot => decideQueueRelease(snapshot, [context.call]),
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

  const placeForPlan = async (
    context: WriteEntry<P>,
    command: WriteCommand,
    before: Snapshot,
    planned: Readonly<{ request: FixedToolRequest }>,
  ): Promise<Outcome<QueueEntryRecord, ToolFailure>> => {
    const gated = preGate(before, context)
    if ('failure' in gated) return gated
    return order(command, gated.ok.request, before, snapshot => {
      const current = preGate(snapshot, context)
      return 'failure' in current ? current : refusePlan(current.ok, planned, digestOf)
    })
  }

  const planPreparation: ToolCommands<P, B>['planPreparation'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const judged = judgeFixedToolRequest(Reflect.get(input, 'request'))
    if ('failure' in judged)
      return invalid(`request.${judged.failure.field}`, judged.failure.reason)
    const purpose: unknown = Reflect.get(input, 'purpose')
    if (purpose !== 'initial' && purpose !== 'resume') return invalid('purpose', 'value')
    const environmentAdoption = judgeAdoptionField(
      Reflect.get(input, 'environmentAdoption'),
      'environmentAdoption',
    )
    if ('failure' in environmentAdoption) return environmentAdoption
    const command = writeCommand(context.ok, {
      request: judged.ok,
      purpose,
      environmentAdoption: environmentAdoption.ok,
    })
    const before = await peek(context.ok)
    if ('failure' in before) return before
    if (purpose === 'resume')
      return transact(
        callDomain(context.ok),
        command.operation,
        (snapshot, mint) =>
          decideResumePlan(
            snapshot,
            { ...command, request: judged.ok, environmentAdoption: environmentAdoption.ok },
            mint,
          ),
        commitUnknown(command.operation),
        before.ok.revision,
      )
    let entry: QueueEntryRecord | null = null
    if (!committedBefore(before.ok, command.operation)) {
      const placed = await placeForPlan(context.ok, command, before.ok, { request: judged.ok })
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
            environmentAdoption: environmentAdoption.ok,
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
    const settled = await settleSynthetic(
      context.ok,
      'write',
      command.inputDigest,
      (snapshot, mint, prepared) => decideRejectPending(snapshot, command, prepared, mint),
      before.ok.revision,
    )
    if ('failure' in settled) return settled
    return releaseQueue(context.ok, record.ok, settled.ok)
  }

  const settleRejected: ToolLedgerRejections<P>['settle'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const reason: unknown = Reflect.get(input, 'reason')
    if (typeof reason !== 'string' || reason.length === 0) return invalid('reason', 'type')
    const command = { ...writeCommand(context.ok, { reason }), reason }
    const before = await peek(context.ok)
    if ('failure' in before) return before
    const record = recordOf(before.ok)
    if ('failure' in record) return record
    const settled = await settleSynthetic(
      context.ok,
      'write',
      command.inputDigest,
      (snapshot, mint, prepared) => decideLedgerRejected(snapshot, command, prepared, mint),
      before.ok.revision,
    )
    if ('failure' in settled) return settled
    return releaseQueue(context.ok, record.ok, settled.ok)
  }

  const beginSegment = async (
    context: WriteEntry<P>,
    since: Snapshot['revision'],
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
    const recorded = await settleSynthetic(
      context.ok,
      'write',
      command.inputDigest,
      (snapshot, mint, prepared) =>
        decideRecordStart(
          snapshot,
          { ...command, segment: timing, execution: executionOf(context.ok) },
          prepared,
          digestOf,
          mint,
        ),
      before.ok.revision,
    )
    if ('failure' in recorded) return recorded
    return releaseQueue(context.ok, record.ok, recorded.ok)
  }

  const preserveResult: ToolCommands<P, B>['preserveResult'] = async input => {
    const fixed = fixFactBasis(input)
    if ('failure' in fixed) return fixed
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const execution = executionOf(context.ok)
    const fields = { basis: fixed.ok, execution }
    const command = { ...writeCommand(context.ok, fields), ...fields }
    const before = await peek(context.ok)
    if ('failure' in before) return before
    const checked = checkSettlement(before.ok, command)
    if ('failure' in checked) return checked
    const record = recordOf(before.ok)
    if ('failure' in record) return record
    if (checked.ok.kind === 'recalled') return releaseQueue(context.ok, record.ok, checked.ok.state)
    const restored = restoreSavedFact<B>(checked.ok.saved)
    if (restored.fact.kind !== 'final') return invalid('basis', 'original-final-required')
    const final = restored.fact
    const qualified = await access(context.ok, 'write')
    if ('failure' in qualified) return qualified
    const authored =
      final.result.original.kind === 'offloaded'
        ? authoredBodyOf(before.ok, final.result.original.source)
        : succeed(null)
    if ('failure' in authored) return authored
    const channels = { value: final.result, body: authored.ok?.prepared ?? null }
    const allowed = await access(context.ok, 'write')
    if ('failure' in allowed) return allowed
    const settled = await transact(
      callDomain(context.ok),
      command.operation,
      async (snapshot, mint) => {
        const current = checkSettlement(snapshot, command)
        if ('failure' in current) return { kind: 'reply', outcome: current }
        if (current.ok.kind === 'recalled')
          return { kind: 'reply', outcome: succeed(current.ok.state) }
        return activateResultDecision(
          channels,
          settlement.bodies?.clock,
          async (committed, settledAt) => {
            const qualified = await access(context.ok, 'write')
            return 'failure' in qualified
              ? { kind: 'reply', outcome: qualified }
              : decidePreserveResult(
                  snapshot,
                  command,
                  final,
                  committed,
                  settledAt === null
                    ? null
                    : instantAfter(settledAt, configuration.offloading.orphanGraceMs),
                  mint,
                )
          },
        )
      },
      commitUnknown(command.operation),
      before.ok.revision,
    )
    if ('failure' in settled) return settled
    return releaseQueue(context.ok, record.ok, settled.ok)
  }

  const closeSegment = async (timing: ToolTiming): Promise<ToolTiming> => {
    if (timing.kind !== 'running') return timing
    const unknown = {
      kind: 'unknown',
      accumulatedMs: timing.accumulatedMs,
      segment: timing.segment,
      diagnostic: 'suspension-elapsed-unavailable',
    } as const
    try {
      const elapsed = await clock.elapsed(timing.segment.marker)
      if ('failure' in elapsed || !/^(0|[1-9][0-9]*)$/u.test(elapsed.ok.milliseconds))
        return unknown
      const total = BigInt(timing.accumulatedMs) + BigInt(elapsed.ok.milliseconds)
      return { kind: 'paused', accumulatedMs: total.toString() }
    } catch {
      return unknown
    }
  }

  const planSuspension: ToolCommands<P, B>['planSuspension'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const fixed = fixCleanupFields(input, ['start', 'schema'])
    if ('failure' in fixed) return fixed
    const start = judgeStartRecord(fixed.ok['start'])
    if ('failure' in start) return invalid('start', 'shape')
    const schema = judgeAdoptionField(fixed.ok['schema'], 'schema')
    if ('failure' in schema) return schema
    const fields = { start: start.ok, schema: schema.ok }
    const command = { ...writeCommand(context.ok, fields), ...fields }
    return transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) => decidePlanSuspension(snapshot, command, mint),
      commitUnknown(command.operation),
    )
  }

  const suspend: ToolCommands<P, B>['suspend'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const fixed = fixCleanupFields(input, ['suspension', 'checkpoint', 'state'])
    if ('failure' in fixed) return fixed
    const suspension = judgeSuspensionField(fixed.ok['suspension'])
    if ('failure' in suspension) return suspension
    const checkpoint = judgeCheckpointField(fixed.ok['checkpoint'])
    if ('failure' in checkpoint) return checkpoint
    const state = judgeCheckpointStateField(fixed.ok['state'])
    if ('failure' in state) return state
    const fields = { suspension: suspension.ok, checkpoint: checkpoint.ok }
    const command = { ...writeCommand(context.ok, fields), ...fields, state: state.ok }
    const before = await peek(context.ok)
    if ('failure' in before) return before
    const record = recordOf(before.ok)
    if ('failure' in record) return record
    const timing = committedBefore(before.ok, command.operation)
      ? record.ok.state.timing
      : await closeSegment(record.ok.state.timing)
    return transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) => decideSuspend(snapshot, { ...command, timing }, mint),
      commitUnknown(command.operation),
      before.ok.revision,
    )
  }

  const attachRegistration: ToolCommands<P, B>['attachRegistration'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const wait = decodeToolWaitId(Reflect.get(input, 'wait'))
    if ('failure' in wait) return invalid('wait', wait.failure.reason)
    const registration = judgeEvidenceField(Reflect.get(input, 'registration'), 'registration')
    if ('failure' in registration) return registration
    const fields = { wait: wait.ok, registration: registration.ok }
    const command = { ...writeCommand(context.ok, fields), ...fields }
    return transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) => decideAttachRegistration(snapshot, command, mint),
      commitUnknown(command.operation),
    )
  }

  const resolveDecision = async (
    checked: MutationInput<P>,
    wait: ToolWaitId,
    decision: DurableEvidence,
    maxBytes: number,
  ): Promise<Outcome<DecisionValue, ToolFailure>> => {
    const decisions = settlement.decisions
    if (decisions === undefined)
      return unavailable('tool-decisions', 'no decision owner is assembled for this ledger')
    let resolved: Awaited<ReturnType<typeof decisions.resolve>>
    try {
      resolved = await decisions.resolve({
        principal: checked.principal,
        tenant: checked.tenant,
        call: checked.call,
        wait,
        decision: structuredClone(decision),
      })
    } catch {
      return unavailable('tool-decisions', thrown('tool-decisions'))
    }
    if ('failure' in resolved)
      return resolved.failure.kind === 'commit-unknown'
        ? unavailable('tool-decisions', 'the decision owner could not confirm the decision')
        : resolved
    return judgeDecisionValue(resolved.ok, maxBytes)
  }

  const acceptDecision: ToolCommands<P, B>['acceptDecision'] = async input => {
    const checked = judgeMutationInput<P>(input, 'accept-decision')
    if ('failure' in checked) return checked
    const wait = decodeToolWaitId(Reflect.get(input, 'wait'))
    if ('failure' in wait) return invalid('wait', wait.failure.reason)
    const decision = judgeEvidenceField(Reflect.get(input, 'decision'), 'decision')
    if ('failure' in decision) return decision
    const allowed = await access(checked.ok, 'accept-decision')
    if ('failure' in allowed) return allowed
    const { operation } = checked.ok
    const fields = { wait: wait.ok, decision: decision.ok }
    const before = await read(callDomain(checked.ok))
    if ('failure' in before) return before
    let value: DecisionValue = { kind: 'no-answer' }
    if (!committedBefore(before.ok, operation)) {
      const refused = refuseDecision(before.ok, wait.ok)
      if ('failure' in refused) return refused
      const { intent } = refused.ok.found.record
      const resolved = await resolveDecision(
        checked.ok,
        wait.ok,
        decision.ok,
        intent.schemas.responseMaxBytes,
      )
      if ('failure' in resolved) return resolved
      value = resolved.ok
    }
    const command = {
      tenant: checked.ok.tenant,
      call: checked.ok.call,
      operation,
      inputDigest: digestOf(fields),
      ...fields,
      value,
    }
    return transact(
      callDomain(checked.ok),
      operation,
      (snapshot, mint) => decideAcceptDecision(snapshot, command, mint),
      commitUnknown(operation),
      before.ok.revision,
    )
  }

  const prepareResume: ToolCommands<P, B>['prepareResume'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const checkpoint = judgeEvidenceField(Reflect.get(input, 'checkpoint'), 'checkpoint')
    if ('failure' in checkpoint) return checkpoint
    const command = {
      ...writeCommand(context.ok, { checkpoint: checkpoint.ok }),
      checkpoint: checkpoint.ok,
    }
    const before = await peek(context.ok)
    if ('failure' in before) return before
    let hold = null
    if (!committedBefore(before.ok, command.operation)) {
      const gated = preGate(before.ok, context.ok)
      if ('failure' in gated) return gated
      const record = gated.ok
      const refused = refuseResume(before.ok, record, checkpoint.ok)
      if ('failure' in refused) return refused
      const permitted = await qualifyStart(context.ok, record.request)
      if ('failure' in permitted) return permitted
      const domain = queueDomain(context.ok.tenant, record.request)
      const step = { call: context.ok.call, operation: command.operation }
      const requeued = await transactQueue(
        domain,
        snapshot => decideQueueRequeue(snapshot, step),
        commitUnknown(command.operation),
      )
      if ('failure' in requeued) return requeued
      const held = await transactQueue(
        domain,
        snapshot => decideQueueHold(snapshot, { ...step, keep: true }),
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
        decidePrepareResume(
          snapshot,
          {
            ...command,
            execution: executionOf(context.ok),
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

  const closeWait: ToolCommands<P, B>['closeWait'] = async input => {
    const context = await writeEntry(input)
    if ('failure' in context) return context
    const wait = decodeToolWaitId(Reflect.get(input, 'wait'))
    if ('failure' in wait) return invalid('wait', wait.failure.reason)
    const continuation = judgeEvidenceField(Reflect.get(input, 'continuation'), 'continuation')
    if ('failure' in continuation) return continuation
    const fields = { wait: wait.ok, continuation: continuation.ok }
    const command = { ...writeCommand(context.ok, fields), ...fields }
    return transact(
      callDomain(context.ok),
      command.operation,
      (snapshot, mint) => decideCloseWait(snapshot, command, mint),
      commitUnknown(command.operation),
    )
  }

  const confirmEnvironmentRelease = async (
    context: MutationInput<P>,
    release: ReleaseRecord,
    evidence: DurableEvidence,
  ): Promise<Outcome<void, ToolFailure>> => {
    try {
      const matching = matchEnvironmentAdoption(settlement.releaseInspection, release.adoption)
      if ('failure' in matching) return matching
      const inspected = await settlement.releaseInspection.inspectRelease({
        ...context,
        release: structuredClone(release),
      })
      if ('failure' in inspected || inspected.ok.kind !== 'released')
        return unavailable('environment', 'environment release confirmation is unavailable')
      return sameFactValue(inspected.ok.evidence, evidence)
        ? succeed(undefined)
        : invalid('outcome.evidence', 'environment-release-confirmation-mismatch')
    } catch {
      return unavailable('environment', 'environment release confirmation is unavailable')
    }
  }

  const finalPlanner = createLedgerFinalPlanner<P, B>({
    policy: guards.policy,
    adoption: toolLedgerAdoption,
    configuration,
    entry,
    load: input => read(callDomain(input)),
    writeBody: bodyWriting.writeBody,
  })

  const resultValue = async (_input: CallInput<P>, record: ResultRecord) =>
    readResultValue(record.value, guards.policy)

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
        const clock = settlement.bodies?.clock
        return Promise.resolve(
          succeed((snapshot, mint) =>
            decideRelease(
              snapshot,
              command,
              mint,
              clock === undefined
                ? null
                : instantAfter(clock.now(), configuration.offloading.orphanGraceMs),
            ),
          ),
        )
      }),
    control: async input => {
      const intent = controlIntent(input)
      if ('failure' in intent) return intent
      const checked = judgeMutationInput<P>(input, 'control')
      if ('failure' in checked) return checked
      const context = checked.ok
      const allowed = await access(context, 'control')
      if ('failure' in allowed) return allowed
      const attempt = async (): Promise<
        Readonly<{ answer: Outcome<ControlReceipt, ToolFailure>; overtaken: boolean }>
      > => {
        const before = await read(callDomain(context))
        if ('failure' in before) return { answer: before, overtaken: false }
        const subject = await controlSubject(before.ok, context, settlement.controlSubjects)
        if ('failure' in subject) return { answer: subject, overtaken: false }
        const command = {
          ...context,
          intent: intent.ok,
          subject: subject.ok,
          inputDigest: digestOf(intent.ok),
        }
        const judged = before.ok.operations.get(context.operation)?.revision
        let overtaken = false
        const answer = await settleSynthetic(
          context,
          'control',
          command.inputDigest,
          (snapshot, mint, prepared) => {
            if (snapshot.operations.get(context.operation)?.revision === judged)
              return decideControl(snapshot, command, prepared, mint)
            overtaken = true
            return {
              kind: 'reply',
              outcome: unavailable('control-subjects', 'the operation was recorded meanwhile'),
            }
          },
        )
        return { answer, overtaken }
      }
      const first = await attempt()
      return first.overtaken ? (await attempt()).answer : first.answer
    },
    acceptDecision,
    acceptResource: input =>
      later(input, 'accept-resource', 'acceptResource', 'waits, decisions and resources'),
    scanPending,
    loadRecovery: input => query(input, 'recover', snapshot => readRecovery(snapshot)),
    claim: input => later(input, 'recover', 'claim', 'recovery scan'),
    planPreparation,
    prepared,
    enqueue,
    prepareStart,
    prepareResume,
    rejectPending,
    recordStart,
    preserveProcess: input =>
      write(input, 'preserveProcess', 'process observation and diagnostics'),
    openWait: input => write(input, 'openWait', 'waits, decisions and resources'),
    attachRegistration,
    attachResource: input => write(input, 'attachResource', 'waits, decisions and resources'),
    planSuspension,
    suspend,
    preserveResult,
    recordResponse: input => write(input, 'recordResponse', 'waits, decisions and resources'),
    closeWait,
    recordControl: async input => {
      const fixed = fixCleanupFields(input, ['control', 'source', 'progress'])
      if ('failure' in fixed) return fixed
      const control = decodeToolOperationIdField(fixed.ok.control, 'control')
      if ('failure' in control) return control
      const source = judgeEvidenceField(fixed.ok.source, 'source')
      if ('failure' in source) return source
      const progress = controlProgress(fixed.ok.progress)
      if ('failure' in progress) return progress
      return mutate(input, 'write', async context => {
        const command = {
          ...context,
          control: control.ok,
          source: source.ok,
          progress: progress.ok,
          inputDigest: digestOf(fixed.ok),
        }
        return Promise.resolve(
          succeed((snapshot, mint) => decideRecordControl(snapshot, command, mint)),
        )
      })
    },
    receiveFacts: async input => {
      const fixed = fixFactInput(input, guards.policy, toolLedgerAdoption)
      if ('failure' in fixed) return fixed
      const values = factValues(fixed.ok.batch)
      if ('failure' in values) return values
      const checked = await entry(input, 'write')
      if ('failure' in checked) return checked
      const before = await read(callDomain(checked.ok))
      if ('failure' in before) return before
      const recalled = checkFactBatch(before.ok, fixed.ok.start, fixed.ok.batch, values.ok.batch)
      if ('failure' in recalled) return recalled
      if (recalled.ok !== null) return succeed(recalled.ok)
      const prepared = adoptFinalFact(before.ok, fixed.ok.batch, values.ok)
      if ('failure' in prepared) return prepared
      const disclosure = await access(checked.ok, 'write')
      if ('failure' in disclosure) return disclosure
      return transact(
        callDomain(checked.ok),
        null,
        (snapshot, mint) =>
          decideReceiveFacts(snapshot, fixed.ok.start, prepared.ok, mint, toolLedgerAdoption),
        unavailable('ledger-store', 'fact custody outcome is unknown; resubmit the original batch'),
      )
    },
    recordFactAcknowledgement: async input => {
      const fixed = fixFactAcknowledgement(input)
      if ('failure' in fixed) return fixed
      const checked = judgeMutationInput<P>(input, 'write')
      if ('failure' in checked) return checked
      const context = checked.ok
      const allowed = await access(context, 'write')
      if ('failure' in allowed) return allowed
      const command = { ...context, ...fixed.ok, inputDigest: digestOf(fixed.ok) }
      const before = await read(callDomain(context))
      if ('failure' in before) return before
      const original = checkFactAcknowledgement(before.ok, command)
      if ('failure' in original) return original
      if (original.ok.kind === 'recalled') return succeed(original.ok.progress)
      const batch = original.ok.batch
      if (batch.acknowledgement.kind === 'pending') {
        try {
          const verdict = await guards.factAcknowledgements.verify({
            ...context,
            ...structuredClone({ start: batch.start, source: batch.source, ...fixed.ok }),
          })
          if (verdict.kind === 'forged')
            return invalid('sourceReceipt', 'source-confirmation-mismatch')
          if (verdict.kind === 'denied') return denied('write')
          if (verdict.kind !== 'trusted')
            return unavailable(
              'fact-acknowledgement-guard',
              'the original source confirmation is unavailable',
            )
        } catch {
          return unavailable('fact-acknowledgement-guard', thrown('fact-acknowledgement-guard'))
        }
      }
      return transact(
        callDomain(context),
        command.operation,
        (snapshot, mint) => decideFactAcknowledgement(snapshot, command, mint),
        commitUnknown(command.operation),
        before.ok.revision,
      )
    },
    recordScheduling: input => write(input, 'recordScheduling', 'program executors'),
    recordAccount: input => later(input, 'write', 'recordAccount', 'execution facts and release'),
    planRelease: async input => {
      const fixed = fixCleanupFields(input, ['preparation', 'custody'])
      if ('failure' in fixed) return fixed
      const custody = judgeEvidenceField(fixed.ok.custody, 'custody')
      if ('failure' in custody) return custody
      return mutate(input, 'write', context => {
        const command = {
          ...context,
          preparation: fixed.ok.preparation,
          custody: custody.ok,
          inputDigest: digestOf(fixed.ok),
        }
        return Promise.resolve(
          succeed(async (snapshot, mint) => {
            let value: ToolResult<B> | null = null
            const state = snapshot.call?.state
            const record =
              state?.phase === 'settled' ? snapshot.results.get(state.result) : undefined
            if (!snapshot.operations.has(command.operation) && record !== undefined) {
              const loaded = await resultValue(context, record)
              if ('failure' in loaded) return { kind: 'reply', outcome: loaded }
              const allowed = await access(context, 'write')
              if ('failure' in allowed) return { kind: 'reply', outcome: allowed }
              value = loaded.ok
            }
            return decidePlanRelease(
              snapshot,
              command,
              mint,
              unsupported('planRelease', 'independent output custody'),
              value,
            )
          }),
        )
      })
    },
    recordRelease: async input => {
      const fixed = fixCleanupFields(input, ['release', 'outcome'])
      if ('failure' in fixed) return fixed
      const outcome = fixReleaseOutcome(fixed.ok.outcome)
      if ('failure' in outcome) return outcome
      const checked = judgeMutationInput<P>(input, 'write')
      if ('failure' in checked) return checked
      const context = checked.ok
      const allowed = await access(context, 'write')
      if ('failure' in allowed) return allowed
      const command = {
        ...context,
        release: fixed.ok.release,
        outcome: outcome.ok,
        inputDigest: digestOf(fixed.ok),
      }
      const before = await read(callDomain(context))
      if ('failure' in before) return before
      const original = checkRelease(before.ok, command)
      if ('failure' in original) return original
      if (original.ok.kind === 'recalled') return succeed(original.ok.evidence)
      if (outcome.ok.kind === 'released') {
        const confirmed = await confirmEnvironmentRelease(
          context,
          original.ok.release,
          outcome.ok.evidence,
        )
        if ('failure' in confirmed) return confirmed
      }
      return transact(
        callDomain(context),
        command.operation,
        (snapshot, mint) => decideRecordRelease(snapshot, command, mint),
        commitUnknown(command.operation),
        before.ok.revision,
      )
    },
    recordLateFact: input =>
      later(input, 'write', 'recordLateFact', 'process observation and diagnostics'),
    recordLateResult: input =>
      later(input, 'write', 'recordLateResult', 'process observation and diagnostics'),
    settleLost: settleLostWith<P>({ access, settle: settleSynthetic }),
    recordTask: async input => {
      const fixed = fixCleanupFields(input, ['task', 'resolution'])
      if ('failure' in fixed) return fixed
      return mutate(input, 'write', context => {
        const command = {
          ...context,
          task: fixed.ok.task,
          resolution: fixed.ok.resolution,
          inputDigest: digestOf(fixed.ok),
        }
        return Promise.resolve(
          succeed((snapshot, mint) =>
            isRegistrationTask(fixed.ok['task'])
              ? isDone(fixed.ok['resolution'])
                ? decideCompleteInvalidation(snapshot, command, mint)
                : decideBlockRegistration(snapshot, command, mint)
              : decideRecordFactsTask(
                  snapshot,
                  command,
                  mint,
                  unsupported(
                    'recordTask',
                    'settled facts blocked, refused registrations and done invalidations only',
                  ),
                ),
          ),
        )
      })
    },
  }

  const bodyReads = createLedgerBodyReads<P>({
    bodies: settlement.bodies,
    configuration: configuration.offloading,
    authorize: input => access(input, 'read-content'),
    load: input => read(callDomain(input)),
  })
  const reads: ToolReads<P, B> = {
    body: { read: bodyReads.read },
    lookup: input => fenced(input, 'lookup', 'admission', lookupCall, lookupFence),
    operation: input =>
      fenced(input, 'query-operation', 'operation', resolveOperation, operationFence),
    result: async input => {
      const fixed = fixResultInput<P>(input, 'read-result')
      if ('failure' in fixed) return fixed
      const { after } = input
      if (after !== null && typeof after !== 'string') return invalid('after', 'type')
      const allowed = await access(fixed.ok, 'read-result')
      if ('failure' in allowed) return allowed
      const snapshot = await read(callDomain(fixed.ok))
      if ('failure' in snapshot) return snapshot
      const record = resultRecord(snapshot.ok, fixed.ok.result)
      if ('failure' in record) return record
      if (record.ok.delivery.kind === 'released')
        return fail({ kind: 'not-found', target: 'result', reason: 'released' })
      const value = await resultValue(fixed.ok, record.ok)
      if ('failure' in value) return value
      const page = readResultPage(
        snapshot.ok,
        {
          result: fixed.ok.result,
          after,
          pageBytes: resultPageBytes,
          adoption: toolLedgerAdoption,
        },
        value.ok,
      )
      if ('failure' in page) return page
      const current = await access(fixed.ok, 'read-result')
      return 'failure' in current ? current : page
    },
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
    content: createLedgerContent({
      bodyBytes: bodyReads.bytes,
      adoption: toolLedgerAdoption,
      provider: settlement.content,
      authorize: access,
      load: input => read(callDomain(input)),
      resultValue,
    }),
  }

  const queues = createQueueReconciler<P>({
    authorize: input => entry(input, 'recover'),
    read,
    readQueue,
    transactQueue,
    park: async (checked, operation) => {
      const own = await read(callDomain(checked))
      if ('failure' in own) return own
      const duty = parkDutyOf(own.ok, operation)
      if (duty.kind === 'none') return succeed({ parked: false })
      let parked = false
      if (duty.kind === 'park') {
        const queued = await transactQueue(
          queueDomain(checked.tenant, duty.record.request),
          snapshot =>
            decideQueuePark(snapshot, { call: checked.call, operation, holder: duty.holder }),
          commitUnknown(operation),
        )
        if ('failure' in queued) return queued
        parked = queued.ok.kind === 'parked'
      }
      const closed = await transact(
        callDomain(checked),
        null,
        snapshot => decideClosePark(snapshot, operation),
        commitUnknown(operation),
      )
      return 'failure' in closed ? closed : succeed({ parked })
    },
    release: async (checked, operation) => {
      const own = await read(callDomain(checked))
      if ('failure' in own) return own
      const { call } = own.ok
      if (call === null) return invalid('call', 'unknown-call')
      if (!own.ok.tasks.some(task => task.kind === 'queue' && task.operation === operation))
        return succeed({ released: false })
      if (call.request.availability.kind !== 'available') return invalid('call', 'no-queue-place')
      if (releaseBasisOf(own.ok) === null) return invalid('call', 'no-release-basis')
      const released = await transactQueue(
        queueDomain(checked.tenant, call.request),
        snapshot => decideQueueRelease(snapshot, [checked.call]),
        commitUnknown(operation),
      )
      if ('failure' in released) return released
      const closed = await transact(
        callDomain(checked),
        null,
        snapshot => decideCloseQueueTask(snapshot, operation),
        commitUnknown(operation),
      )
      return 'failure' in closed ? closed : succeed({ released: true })
    },
  })

  return Object.freeze({
    delivery: Object.freeze({
      read: async (input: Parameters<ToolLedger<P, B>['delivery']['read']>[0]) => {
        const fixed = fixResultInput<P>(input, 'recover')
        if ('failure' in fixed) return fixed
        const before = await query(fixed.ok, 'recover', snapshot =>
          resultRecord(snapshot, fixed.ok.result),
        )
        if ('failure' in before) return before
        if (before.ok.delivery.kind === 'released') return invalid('result', 'delivery-released')
        const value = await resultValue(fixed.ok, before.ok)
        if ('failure' in value) return value
        const after = await query(fixed.ok, 'recover', snapshot =>
          resultRecord(snapshot, fixed.ok.result),
        )
        if ('failure' in after) return after
        if (after.ok.delivery.kind === 'released') return invalid('result', 'delivery-released')
        if (digestOf(after.ok) !== digestOf(before.ok))
          return unavailable('result-delivery', 'result changed during material read')
        const current = await access(fixed.ok, 'recover')
        return 'failure' in current ? current : value
      },
    }),
    bodyWrites: bodyWriting.writes,
    sweep: createLedgerSweep<P>({
      bodies: settlement.bodies,
      due: (tenant, now, limit) => store.due(tenant, now, limit),
      transact,
      read,
      commit,
      removal: {
        graceMs: configuration.offloading.orphanGraceMs,
        hostRecords: () => Promise.resolve(succeed('removed' as const)),
      },
    }).sweep,
    finalPlanner,
    controls: Object.freeze(
      createLedgerControls<P>({ subjects: settlement.controlSubjects, entry, transact }),
    ),
    commands: Object.freeze(commands),
    reads: Object.freeze(reads),
    admissions: Object.freeze(admissions),
    queues: Object.freeze(queues),
    rejections: Object.freeze({ settle: settleRejected }),
    facts: Object.freeze({
      read: async input => {
        const context = judgeCallInput<P>(input, 'recover')
        if ('failure' in context) return context
        const basis = fixFactBasis(input)
        if ('failure' in basis) return basis
        const saved = await query(context.ok, 'recover', snapshot =>
          readSavedFact(snapshot, basis.ok),
        )
        if ('failure' in saved) return saved
        const restored = restoreSavedFact<B>(saved.ok)
        const allowed = await access(context.ok, 'recover')
        return 'failure' in allowed ? allowed : succeed(restored)
      },
    } satisfies ToolLedgerFacts<P, B>),
    recovery: Object.freeze(recovery),
  })
}

function isDone(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'kind') === 'done'
}

function isRegistrationTask(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'kind') === 'wait-registration'
  )
}

function missingEntry(call: ToolCallId, operation: ToolOperationId) {
  return {
    call,
    ordinal: '0',
    stage: 'held',
    operation,
    tool: '',
    limit: null,
    scopeBudget: null,
  } as const
}

function decodeToolOperationIdField(
  value: unknown,
  field: string,
): Outcome<ToolOperationId, ToolFailure> {
  const decoded = decodeToolOperationId(value)
  return 'ok' in decoded ? decoded : invalid(field, decoded.failure.reason)
}

function judgePreparationField(value: unknown): Outcome<PreparationRecord, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid('preparation', 'type')
  const identity = judgePreparationIdentity(value)
  if ('failure' in identity) return identity
  const purpose: unknown = Reflect.get(value, 'purpose')
  if (purpose !== 'initial' && purpose !== 'resume') return invalid('preparation.purpose', 'value')
  const inputDigest: unknown = Reflect.get(value, 'inputDigest')
  if (typeof inputDigest !== 'string') return invalid('preparation.inputDigest', 'type')
  const adoption = judgeAdoptionField(Reflect.get(value, 'adoption'), 'preparation.adoption')
  if ('failure' in adoption) return adoption
  return succeed({
    ...identity.ok,
    adoption: adoption.ok,
    inputDigest,
    purpose,
  })
}

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

function executionOf(context: WriteInput): ToolExecutionRef {
  const { tenant, call, instance, generation } = context
  return { tenant, call, instance, generation }
}

function judgeStartRecordField(value: unknown): Outcome<ToolStartRecord, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid('invocation', 'type')
  const kind: unknown = Reflect.get(value, 'kind')
  if (kind !== 'start' && kind !== 'resume') return invalid('invocation.kind', 'value')
  const judged = judgeStartRecord(value)
  return 'failure' in judged ? invalid('invocation', 'shape') : judged
}

function exclusionOf(value: object): Outcome<DurableEvidence, ToolFailure> {
  return judgeEvidenceField(Reflect.get(value, 'exclusion'), 'outcome.exclusion')
}

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

function judgeStartProgressField(value: unknown): Outcome<StartProgress, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid('outcome', 'type')
  const kind: unknown = Reflect.get(value, 'kind')
  if (typeof kind !== 'string' || !Object.hasOwn(START_PROGRESS, kind))
    return invalid('outcome.kind', 'value')
  return START_PROGRESS[kind as StartProgress['kind']](value)
}

type ReleaseFields = Readonly<{
  result: ToolResultVersion
  delivery: ToolDeliveryId
  consumer: ConsumerRef
  evidence: Handoff
}>

function field<T>(
  judged: Outcome<T, Readonly<{ field: string; reason: string }>>,
  name: string,
  root: string,
): Outcome<T, ToolFailure> {
  if ('ok' in judged) return judged
  const { field: at, reason } = judged.failure
  return invalid(at === root ? name : `${name}.${at}`, reason)
}

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

function judgeDecisionValue(value: unknown, maxBytes: number): Outcome<DecisionValue, ToolFailure> {
  if (typeof value !== 'object' || value === null) return invalid('decision', 'type')
  const kind: unknown = Reflect.get(value, 'kind')
  const keys = Object.keys(value)
  if ((kind === 'no-answer' || kind === 'declined') && keys.length === 1) return succeed({ kind })
  if (kind !== 'answer' || keys.length !== 2 || !Object.hasOwn(value, 'value'))
    return invalid('decision', 'not-a-decision')
  const tree = fixJsonTree(Reflect.get(value, 'value'), maxBytes)
  return 'failure' in tree
    ? invalid('decision.value', tree.failure.reason)
    : succeed({ kind, value: tree.ok.value })
}
