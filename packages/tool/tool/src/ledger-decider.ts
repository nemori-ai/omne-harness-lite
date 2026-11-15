import type { BodyEntryRecord } from './ledger-body-records.ts'
import type { ResultPolicyRecord } from './ledger-result-policy.ts'
import { settleResultBodies } from './ledger-result-uses.ts'
import type {
  PreparedSynthetic,
  ResultPreparationRecord,
  SyntheticDecision,
  SyntheticNeed,
} from './ledger-result-preparation.ts'
import { releasedResultValue, type ResultValue } from './ledger-result-material.ts'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ConsumerRef,
  Effect,
  DeliveryState,
  ReleasedDelivery,
  DurableEvidence,
  FixedToolRequest,
  Handoff,
  ToolArguments,
  ToolCallId,
  ToolFailure,
  ToolOperationId,
  ToolRenderedResult,
  ToolResultVersion,
  ToolRevision,
  ToolState,
  ToolTerminal,
} from '@omne-harness/tool-contract'
import type {
  ParsedToolArguments,
  ToolArgumentsRejection,
  ToolInstant,
  ToolTask,
} from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import {
  INITIAL_REVISION,
  LEDGER_OWNER,
  deliveryId,
  mintEvidence,
  digestOf,
  FIRST_RESULT_VERSION,
} from './evidence.ts'
import {
  CALL_DUE_KEY,
  taskKey,
  factKey,
  type FactEventRecord,
  type EnvironmentReleaseRecord,
  type FactBatchRecord,
  type FactStreamRecord,
  type ProcessRecord,
  type AccountRecord,
  type CallAccount,
  type CallRecord,
  type CheckpointStateRecord,
  type ExclusionRecord,
  type LedgerDomain,
  type LedgerRead,
  type LedgerRecord,
  type LedgerWrite,
  type OperationReceipt,
  type OperationRecord,
  type ResultRecord,
  type ResultCustody,
  type SuspensionLedgerRecord,
  type TenantId,
  type WaitLedgerRecord,
  type WaitRequestRecord,
} from './ledger-store.ts'

export type Snapshot = Readonly<{
  bodies: ReadonlyMap<string, BodyEntryRecord>
  resultPolicies: ReadonlyMap<string, ResultPolicyRecord>
  resultPreparations: ReadonlyMap<string, ResultPreparationRecord>
  domain: LedgerDomain
  revision: ToolRevision
  call: CallRecord | null
  operations: ReadonlyMap<string, OperationRecord>
  results: ReadonlyMap<string, ResultRecord>
  releases: ReadonlyMap<string, EnvironmentReleaseRecord>
  facts: ReadonlyMap<string, FactEventRecord>
  batches: ReadonlyMap<string, FactBatchRecord>
  streams: ReadonlyMap<string, FactStreamRecord>
  process: readonly ProcessRecord[]
  accounts: readonly AccountRecord[]
  tasks: readonly ToolTask[]
  suspensions: ReadonlyMap<string, SuspensionLedgerRecord>
  waits: ReadonlyMap<string, WaitLedgerRecord>
  waitRequest: WaitRequestRecord | null
  checkpointState: CheckpointStateRecord | null
  exclusions: ReadonlyMap<string, ExclusionRecord>
}>

export function snapshotOf(
  domain: LedgerDomain,
  read: Extract<LedgerRead, { kind: 'complete' }>,
): Snapshot {
  const bodies = new Map<string, BodyEntryRecord>()
  const resultPolicies = new Map<string, ResultPolicyRecord>()
  const resultPreparations = new Map<string, ResultPreparationRecord>()
  const releases = new Map<string, EnvironmentReleaseRecord>()
  const facts = new Map<string, FactEventRecord>()
  const batches = new Map<string, FactBatchRecord>()
  const streams = new Map<string, FactStreamRecord>()
  const process: ProcessRecord[] = []
  let call: CallRecord | null = null
  const operations = new Map<string, OperationRecord>()
  const results = new Map<string, ResultRecord>()
  const accounts: AccountRecord[] = []
  const tasks: ToolTask[] = []
  const exclusions = new Map<string, ExclusionRecord>()
  const suspensions = new Map<string, SuspensionLedgerRecord>()
  const waits = new Map<string, WaitLedgerRecord>()
  let waitRequest: WaitRequestRecord | null = null
  let checkpointState: CheckpointStateRecord | null = null
  for (const record of read.records) {
    switch (record.kind) {
      case 'body-entry':
        bodies.set(record.body.bodyId, record.body)
        break
      case 'result-policy':
        resultPolicies.set(record.policy.operation, record.policy)
        break
      case 'result-preparation':
        resultPreparations.set(record.preparation.id, record.preparation)
        break
      case 'environment-release':
        releases.set(record.environmentRelease.release.preparation, record.environmentRelease)
        break
      case 'fact-event':
        facts.set(record.fact.key, record.fact)
        break
      case 'fact-batch':
        batches.set(
          factKey(record.batch.start, record.batch.source.owner, record.batch.batch),
          record.batch,
        )
        break
      case 'fact-stream':
        streams.set(factKey(record.stream.start, record.stream.source.owner), record.stream)
        break
      case 'process':
        process.push(record.process)
        break
      case 'call':
        call = record.call
        break
      case 'operation':
        operations.set(record.operation.operation, record.operation)
        break
      case 'result':
        results.set(record.result.result, record.result)
        break
      case 'account':
        accounts.push(record.account)
        break
      case 'task':
        tasks.push(record.task)
        break
      case 'exclusion':
        exclusions.set(record.exclusion.operation, record.exclusion)
        break
      case 'suspension':
        suspensions.set(record.suspension.suspension.operation, record.suspension)
        break
      case 'wait':
        waits.set(record.wait.record.intent.wait, record.wait)
        break
      case 'wait-request':
        waitRequest = record.waitRequest
        break
      case 'checkpoint-state':
        checkpointState = record.checkpointState
        break
      default:
        throw new Error(`a ${record.kind} record does not belong to a call domain`)
    }
  }
  return {
    bodies,
    resultPolicies,
    resultPreparations,
    domain,
    releases,
    facts,
    batches,
    streams,
    process,
    revision: read.revision,
    call,
    operations,
    results,
    accounts,
    tasks,
    suspensions,
    waits,
    waitRequest,
    checkpointState,
    exclusions,
  }
}

export type Decision<T> =
  | Readonly<{ kind: 'reply'; outcome: Outcome<T, ToolFailure> }>
  | Readonly<{ kind: 'commit'; writes: readonly LedgerWrite[]; value: T }>

export type Mint = Readonly<{ revision: ToolRevision }>

export function reply<T>(outcome: Outcome<T, ToolFailure>): Decision<T> {
  return { kind: 'reply', outcome }
}

export function put(record: LedgerRecord): LedgerWrite {
  return { kind: 'put', record }
}

const ADMITTED_NOT_DUE: LedgerWrite = { kind: 'unschedule', key: CALL_DUE_KEY }

export function recall(
  snapshot: Snapshot,
  operation: ToolOperationId,
  inputDigest: string,
  kind: OperationReceipt['kind'],
): Outcome<OperationRecord | undefined, ToolFailure> {
  const existing = snapshot.operations.get(operation)
  if (existing === undefined) return succeed(undefined)
  if (existing.receipt.kind !== kind || existing.inputDigest !== inputDigest)
    return fail({ kind: 'conflict', operation })
  return succeed(existing)
}

export type AdmitCommand = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  request: FixedToolRequest
  inputDigest: string
  queue: Readonly<{ load: number; capacity: number }> | null
}>

export type AdmitTools<B extends ContentBlock> = Readonly<{
  arguments(input: ToolArguments): Outcome<ParsedToolArguments, ToolArgumentsRejection>
  text(reason: string): Outcome<ToolRenderedResult<B>, Readonly<{ reason: string }>>
}>

export type Admitted = Readonly<{ state: ToolState; recovered: boolean }>

export function decideAdmit<B extends ContentBlock>(
  snapshot: Snapshot,
  command: AdmitCommand,
  tools: Pick<AdmitTools<B>, 'arguments'>,
  mint: Mint,
  prepared: PreparedSynthetic | null,
): SyntheticDecision<Admitted> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'admit')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed({ state: stateOf(known.ok), recovered: true }))
  if (snapshot.call !== null) return reply(staleCall(snapshot.call))
  const { request } = command
  const { definition } = request.availability
  if (request.mode === 'background' && !definition.backgroundAllowed)
    return reply(invalid('request.mode', 'background-not-allowed'))
  if (request.availability.kind === 'known-unavailable')
    return settle(
      snapshot,
      command,
      { kind: 'unavailable', reason: request.availability.reason },
      mint,
      prepared,
    )
  if (request.invocation.kind === 'programmatic' && definition.programmable !== true)
    return reply(
      fail({
        kind: 'unsupported',
        adoption: definition.adoption,
        reason: 'the definition does not permit programmatic invocation',
      }),
    )
  const parsed = tools.arguments(request.arguments)
  if ('failure' in parsed)
    return argumentsFailure(snapshot, command, parsed.failure, mint, prepared)
  return acceptWithinCapacity(command, mint)
}

function acceptWithinCapacity(command: AdmitCommand, mint: Mint): Decision<Admitted> {
  const { queue } = command
  if (queue === null || queue.load < queue.capacity) return accept(command, mint)
  return reply(
    fail({
      kind: 'unavailable',
      dependency: 'tool-queue',
      diagnostic: `the queue of this scope holds ${queue.load} unreleased calls, its capacity`,
    }),
  )
}

function acceptedState(command: AdmitCommand, revision: ToolRevision): ToolState {
  const { tenant, call, request } = command
  const body = {
    call,
    revision,
    foreground:
      request.mode === 'background'
        ? ({ kind: 'background', call, source: { kind: 'launched' } } as const)
        : null,
    effect: { kind: 'not-started' },
    execution: { kind: 'not-started' },
    timing: { kind: 'paused', accumulatedMs: '0' },
    queue: { kind: 'none' },
    controls: [],
    delivery: null,
    supplements: [],
    phase: 'accepted',
    wait: { kind: 'none' },
    relation: request.mode,
  } as const
  return { ...body, source: mintEvidence('state', { tenant, call }, revision, body) }
}

function accept(command: AdmitCommand, mint: Mint): Decision<Admitted> {
  const state = acceptedState(command, mint.revision)
  return {
    kind: 'commit',
    writes: [
      ADMITTED_NOT_DUE,
      put({ kind: 'call', call: callRecord(command, state) }),
      put(operationRecord(command, { kind: 'admit', state }, mint)),
      put({ kind: 'task', task: queueTask(command.operation, state.source) }),
    ],
    value: { state, recovered: false },
  }
}

export function queueTask(operation: ToolOperationId, basis: DurableEvidence): ToolTask {
  return { kind: 'queue', operation, state: 'pending', diagnostic: null, basis }
}

function callRecord(command: AdmitCommand, state: ToolState): CallRecord {
  const { tenant, call, operation, request } = command
  const { source } = request.invocation
  return {
    tenant,
    call,
    admission: operation,
    request,
    initiator: { owner: source.owner, subject: source.record, revision: source.revision },
    state,
    preparations: [],
    environment: null,
    start: null,
    startRejection: null,
    execution: null,
  }
}

export function stateRevision(snapshot: Snapshot): ToolRevision {
  return snapshot.call?.state.revision ?? INITIAL_REVISION
}

function staleCall(call: CallRecord): Outcome<never, ToolFailure> {
  return fail({ kind: 'stale-revision', current: call.state.revision })
}

function stateOf(record: OperationRecord): ToolState {
  if (record.receipt.kind !== 'admit') throw new Error('recall checked the receipt kind')
  return record.receipt.state
}

function argumentsFailure(
  snapshot: Snapshot,
  command: AdmitCommand,
  rejection: ToolArgumentsRejection,
  mint: Mint,
  prepared: PreparedSynthetic | null,
): SyntheticDecision<Admitted> {
  switch (rejection.kind) {
    case 'incomplete':
      return reply(invalid('request.arguments.complete', 'incomplete'))
    case 'shape':
      return reply(invalid(`request.arguments.${rejection.field}`, rejection.reason))
    case 'invalid': {
      const diagnostic = `${rejection.field}: ${rejection.reason}`
      return settle(
        snapshot,
        command,
        { kind: 'failed', cause: 'arguments', diagnostic },
        mint,
        prepared,
      )
    }
    default: {
      const exhaustive: never = rejection
      return exhaustive
    }
  }
}

function describeTerminal(terminal: ToolTerminal): string {
  switch (terminal.kind) {
    case 'unavailable':
      return `tool unavailable: ${terminal.reason}`
    case 'failed':
      return `tool ${terminal.cause} failure: ${terminal.diagnostic}`
    case 'completed':
    case 'interrupted':
    case 'no-response':
      return `tool ${terminal.kind}`
    default: {
      const exhaustive: never = terminal
      return exhaustive
    }
  }
}

const ADMISSION_EVENT = 'admission'

function replacementAccount(call: ToolCallId): CallAccount {
  return {
    subject: { kind: 'tool_execution', id: call },
    usage: [],
    cost: [],
    trimmed: { state: 'known', lexeme: '0', unit: 'bytes' },
    place: LEDGER_OWNER,
    duration: { state: 'unknown' },
    receipt: 'received',
    revision: '1',
  }
}

export function terminalText<B extends ContentBlock>(
  terminal: Extract<ToolTerminal, { kind: 'unavailable' | 'failed' }>,
  text: AdmitTools<B>['text'],
): Outcome<ToolRenderedResult<B>, ToolFailure> {
  return ledgerText(describeTerminal(terminal), text)
}

export function ledgerText<B extends ContentBlock>(
  words: string,
  text: AdmitTools<B>['text'],
): Outcome<ToolRenderedResult<B>, ToolFailure> {
  const made = text(words)
  if ('ok' in made) return made
  return fail({
    kind: 'unavailable',
    dependency: 'result-factory',
    diagnostic: made.failure.reason,
  })
}

export type FirstVersion = Readonly<{
  version: ToolResultVersion
  delivery: Extract<DeliveryState, { kind: 'pending' }>
  record: ResultRecord
}>

export function firstResultWrites(
  place: Readonly<{ tenant: TenantId; call: ToolCallId; operation: ToolOperationId }>,
  consumer: ConsumerRef,
  terminal: ToolTerminal,
  effect: Effect,
  value: ResultRecord['value'],
  custody: ResultCustody,
  mint: Mint,
): Readonly<{ version: FirstVersion; writes: readonly LedgerWrite[] }> {
  const { tenant, call, operation } = place
  const version = FIRST_RESULT_VERSION
  const delivery = { kind: 'pending', delivery: deliveryId(1), consumer } as const
  const resultPlace = { tenant, call, result: version, delivery: delivery.delivery, operation }
  const record: ResultRecord = {
    tenant,
    call,
    result: version,
    relation: 'original',
    terminal,
    actual: null,
    effect,
    value,
    delivery,
    source: mintEvidence('result', resultPlace, mint.revision, { terminal, effect, value }),
    settledBy: operation,
    custody,
  }
  const task: ToolTask = {
    kind: 'deliver',
    operation,
    state: 'pending',
    diagnostic: null,
    result: version,
    delivery: delivery.delivery,
    consumer,
  }
  return {
    version: { version, delivery, record },
    writes: [put({ kind: 'result', result: record }), put({ kind: 'task', task })],
  }
}

export function settlementWrites(
  snapshot: Snapshot,
  place: Readonly<{ tenant: TenantId; call: ToolCallId; operation: ToolOperationId }>,
  consumer: ConsumerRef,
  terminal: SyntheticNeed['terminal'],
  value: ResultValue,
  mint: Mint,
  effect: Effect = { kind: 'not-started' },
): Outcome<Readonly<{ version: FirstVersion; writes: readonly LedgerWrite[] }>, ToolFailure> {
  const first = firstResultWrites(
    place,
    consumer,
    terminal,
    effect,
    value,
    { kind: 'synthetic' },
    mint,
  )
  const uses = settleResultBodies(snapshot, first.version.record, null)
  if ('failure' in uses) return uses
  const account = replacementAccount(place.call)
  return succeed({
    version: first.version,
    writes: [
      ...first.writes,
      ...uses.ok,
      put({
        kind: 'account',
        account: {
          tenant: place.tenant,
          call: place.call,
          start: null,
          source: mintEvidence(
            'account',
            { tenant: place.tenant, call: place.call, event: ADMISSION_EVENT },
            mint.revision,
            account,
          ),
          event: ADMISSION_EVENT,
          value: account,
        },
      }),
    ],
  })
}

function settle(
  snapshot: Snapshot,
  command: AdmitCommand,
  terminal: Extract<ToolTerminal, { kind: 'unavailable' | 'failed' }>,
  mint: Mint,
  prepared: PreparedSynthetic | null,
): SyntheticDecision<Admitted> {
  const made = syntheticChannels(
    command,
    { terminal, consumer: command.request.consumer },
    prepared,
  )
  if ('kind' in made) return made
  if ('failure' in made) return reply(made)
  const { tenant, call, request } = command
  const settledReply = settlementWrites(
    snapshot,
    command,
    request.consumer,
    terminal,
    made.ok,
    mint,
  )
  if ('failure' in settledReply) return reply(settledReply)
  const settled = settledReply.ok
  const state = logicalState(
    tenant,
    call,
    settled.version.version,
    terminal,
    settled.version.delivery,
    mint.revision,
  )
  return {
    kind: 'commit',
    writes: [
      ADMITTED_NOT_DUE,
      put({ kind: 'call', call: { ...callRecord(command, state), state } }),
      put(operationRecord(command, { kind: 'admit', state }, mint)),
      ...settled.writes,
    ],
    value: { state, recovered: false },
  }
}

export function operationRecord(
  command: Pick<AdmitCommand, 'tenant' | 'call' | 'operation' | 'inputDigest'>,
  receipt: OperationReceipt,
  mint: Mint,
): LedgerRecord {
  return {
    kind: 'operation',
    operation: {
      tenant: command.tenant,
      call: command.call,
      operation: command.operation,
      inputDigest: command.inputDigest,
      revision: mint.revision,
      receipt,
    },
  }
}

function logicalState(
  tenant: TenantId,
  call: ToolCallId,
  version: ToolResultVersion,
  terminal: Extract<ToolTerminal, { kind: 'unavailable' | 'failed' }>,
  delivery: DeliveryState,
  revision: ToolRevision,
): ToolState {
  const body = {
    call,
    revision,
    foreground: { kind: 'final', result: version },
    effect: { kind: 'not-started' },
    execution: { kind: 'not-started' },
    timing: { kind: 'closed', accumulatedMs: '0' },
    queue: { kind: 'none' },
    controls: [],
    delivery,
    supplements: [],
    phase: 'settled',
    wait: { kind: 'none' },
    result: version,
    relation: 'foreground',
    terminal,
  } as const
  const source = mintEvidence('state', { tenant, call }, revision, body)
  const state: ToolState = { ...body, source }
  return state
}

export type ReleaseCommand = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  result: ToolResultVersion
  delivery: DeliveryState['delivery']
  consumer: ConsumerRef
  evidence: Handoff
  inputDigest: string
}>

function sameConsumer(left: ConsumerRef, right: ConsumerRef): boolean {
  return (
    left.owner === right.owner &&
    left.work === right.work &&
    left.position === right.position &&
    left.purpose === right.purpose
  )
}

function handoffEvidence(handoff: Handoff): Readonly<{ field: string; value: DurableEvidence }> {
  return handoff.kind === 'retained'
    ? { field: 'evidence.custody', value: handoff.custody }
    : { field: 'evidence.completion', value: handoff.completion }
}

function releaseTarget(
  snapshot: Snapshot,
  command: ReleaseCommand,
): Outcome<ResultRecord, ToolFailure> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  if (snapshot.call.state.phase !== 'settled') return fail({ kind: 'not-settled' })
  const record = snapshot.results.get(command.result)
  if (record === undefined) return invalid('result', 'unknown-version')
  if (record.delivery.delivery !== command.delivery) return invalid('delivery', 'mismatch')
  if (!sameConsumer(record.delivery.consumer, command.consumer))
    return fail({ kind: 'conflict', operation: record.settledBy })
  const proof = handoffEvidence(command.evidence)
  if (proof.value.owner !== command.consumer.owner)
    return invalid(`${proof.field}.owner`, 'owner-mismatch')
  return succeed(record)
}

function removalInstant(snapshot: Snapshot, graceEnd: ToolInstant): ToolInstant {
  let latest = graceEnd
  for (const record of snapshot.results.values()) {
    const original = record.value.original
    if (original.kind === 'offloaded' && original.retention.expiresAt > latest)
      latest = original.retention.expiresAt
  }
  return latest
}

export function decideRelease(
  snapshot: Snapshot,
  command: ReleaseCommand,
  mint: Mint,
  graceEnd: ToolInstant | null,
): Decision<ReleasedDelivery> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'release-delivery')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(deliveryOf(known.ok)))
  const target = releaseTarget(snapshot, command)
  if ('failure' in target) return reply(target)
  const record = target.ok
  if (record.delivery.kind === 'released') return reply(succeed(record.delivery))
  const { tenant, call: callId, result, delivery } = command
  const released: ReleasedDelivery = {
    kind: 'released',
    delivery: record.delivery.delivery,
    consumer: record.delivery.consumer,
    evidence: mintEvidence('delivery', { tenant, call: callId, result, delivery }, mint.revision, {
      operation: command.operation,
      consumer: command.consumer,
      handoff: command.evidence,
    }),
  }
  const call = snapshot.call
  if (call === null) throw new Error('releaseTarget checked the call record')
  return {
    kind: 'commit',
    writes: [
      put({
        kind: 'result',
        result: { ...record, delivery: released, value: releasedResultValue(record.value) },
      }),
      put(operationRecord(command, { kind: 'release-delivery', delivery: released }, mint)),
      put({
        kind: 'call',
        call: { ...call, state: withDelivery(call, record, released, mint) },
      }),
      { kind: 'delete', key: taskKey({ kind: 'deliver', operation: record.settledBy }) },
      ...(graceEnd === null
        ? []
        : [
            {
              kind: 'schedule' as const,
              key: CALL_DUE_KEY,
              dueAt: removalInstant(snapshot, graceEnd),
            },
          ]),
    ],
    value: released,
  }
}

function deliveryOf(record: OperationRecord): ReleasedDelivery {
  if (record.receipt.kind !== 'release-delivery') throw new Error('recall checked the receipt kind')
  return record.receipt.delivery
}

function withDelivery(
  call: CallRecord,
  record: ResultRecord,
  released: ReleasedDelivery,
  mint: Mint,
): ToolState {
  const { source: _source, ...rest } = call.state
  const body =
    record.relation === 'original'
      ? { ...rest, revision: mint.revision, delivery: released }
      : {
          ...rest,
          revision: mint.revision,
          supplements: rest.supplements.map(entry =>
            entry.result === record.result ? { ...entry, delivery: released } : entry,
          ),
        }
  const place = { tenant: call.tenant, call: call.call }
  return { ...body, source: mintEvidence('state', place, mint.revision, body) }
}

export function syntheticChannels(
  command: Readonly<{ operation: ToolOperationId; inputDigest: string }>,
  need: SyntheticNeed,
  prepared: PreparedSynthetic | null,
):
  | Outcome<ResultValue, ToolFailure>
  | Readonly<{ kind: 'prepare-synthetic'; need: SyntheticNeed }> {
  if (prepared === null) return { kind: 'prepare-synthetic', need }
  if (
    prepared.operation !== command.operation ||
    prepared.inputDigest !== command.inputDigest ||
    digestOf(prepared.need) !== digestOf(need)
  )
    return fail({ kind: 'conflict', operation: command.operation })
  return succeed(prepared.state.value)
}
