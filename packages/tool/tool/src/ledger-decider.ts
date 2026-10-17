// The pure admission decider (P01, P02) and the delivery release decider (P08). A decision reads
// the domain snapshot and the command, and answers either a reply without writes or a set of
// writes with the value to reply after the commit. It reads no port, runs no tool and mints no
// time of its own.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import type {
  ConsumerRef,
  DeliveryState,
  DurableEvidence,
  FixedToolRequest,
  Handoff,
  ParsedToolArguments,
  ToolArguments,
  ToolArgumentsRejection,
  ToolCallId,
  ToolFailure,
  ToolOperationId,
  ToolResult,
  ToolResultVersion,
  ToolRevision,
  ToolState,
  ToolTask,
  ToolTerminal,
} from '@omne-harness/tool-contract'
import { invalid } from './boundary.ts'
import { LEDGER_OWNER, deliveryId, mintEvidence, resultVersion } from './evidence.ts'
import {
  taskKey,
  type AccountRecord,
  type CallAccount,
  type CallRecord,
  type LedgerDomain,
  type LedgerRead,
  type LedgerRecord,
  type LedgerWrite,
  type OperationReceipt,
  type OperationRecord,
  type ResultRecord,
  type TenantId,
} from './ledger-store.ts'

/** The records of one domain, indexed for the deciders and the read projections. */
export type Snapshot<B extends ContentBlock> = Readonly<{
  domain: LedgerDomain
  revision: ToolRevision
  call: CallRecord | null
  operations: ReadonlyMap<string, OperationRecord>
  results: ReadonlyMap<string, ResultRecord<B>>
  accounts: readonly AccountRecord[]
  tasks: readonly ToolTask[]
}>

export function snapshotOf<B extends ContentBlock>(
  domain: LedgerDomain,
  read: Extract<LedgerRead<B>, { kind: 'complete' }>,
): Snapshot<B> {
  let call: CallRecord | null = null
  const operations = new Map<string, OperationRecord>()
  const results = new Map<string, ResultRecord<B>>()
  const accounts: AccountRecord[] = []
  const tasks: ToolTask[] = []
  for (const record of read.records) {
    if (record.kind === 'call') call = record.call
    else if (record.kind === 'operation')
      operations.set(record.operation.operation, record.operation)
    else if (record.kind === 'result') results.set(record.result.result, record.result)
    else if (record.kind === 'account') accounts.push(record.account)
    else tasks.push(record.task)
  }
  return { domain, revision: read.revision, call, operations, results, accounts, tasks }
}

export type Decision<T, B extends ContentBlock> =
  | Readonly<{ kind: 'reply'; outcome: Outcome<T, ToolFailure> }>
  | Readonly<{ kind: 'commit'; writes: readonly LedgerWrite<B>[]; value: T }>

/** What the ledger mints for one attempt: the revision the commit will set. */
export type Mint = Readonly<{ revision: ToolRevision }>

function reply<T, B extends ContentBlock>(outcome: Outcome<T, ToolFailure>): Decision<T, B> {
  return { kind: 'reply', outcome }
}

function put<B extends ContentBlock>(record: LedgerRecord<B>): LedgerWrite<B> {
  return { kind: 'put', record }
}

/**
 * P01: a committed operation answers again with its original receipt when the input is the same,
 * and `conflict` when the input differs. An `undefined` success means the operation is new.
 */
function recall<B extends ContentBlock>(
  snapshot: Snapshot<B>,
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
}>

/** The pure functions the admit decision needs: the strict argument parse and the text result. */
export type AdmitTools<B extends ContentBlock> = Readonly<{
  arguments(input: ToolArguments): Outcome<ParsedToolArguments, ToolArgumentsRejection>
  text(reason: string): Outcome<ToolResult<B>, Readonly<{ reason: string }>>
}>

/**
 * Decides one admission. Order: recall by operation; a call admitted under another operation is
 * `stale-revision` (admit expects "not admitted yet"); a known-unavailable target settles as
 * unavailable without reading the arguments; a script call to a tool without `programmable`
 * is `unsupported`; a background start needs the author's permission; incomplete arguments are
 * `invalid`; a failed strict parse of either text settles as an arguments failure; a real
 * execution is not implemented in this increment.
 */
export function decideAdmit<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: AdmitCommand,
  tools: AdmitTools<B>,
  mint: Mint,
): Decision<ToolState, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'admit')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(stateOf(known.ok)))
  if (snapshot.call !== null)
    return reply(fail({ kind: 'stale-revision', current: snapshot.revision }))
  const { request } = command
  const { definition } = request.availability
  if (request.availability.kind === 'known-unavailable')
    return settle(
      command,
      { kind: 'unavailable', reason: request.availability.reason },
      tools,
      mint,
    )
  if (request.invocation.kind === 'programmatic' && definition.programmable !== true)
    return reply(
      fail({
        kind: 'unsupported',
        adoption: definition.adoption,
        reason: 'the definition does not permit programmatic invocation',
      }),
    )
  if (request.mode === 'background' && !definition.backgroundAllowed)
    return reply(invalid('request.mode', 'background-not-allowed'))
  const parsed = tools.arguments(request.arguments)
  if ('failure' in parsed) return argumentsFailure(command, parsed.failure, tools, mint)
  return reply(
    fail({
      kind: 'unsupported',
      adoption: definition.adoption,
      reason: 'real execution is not implemented in this increment (ticket 06)',
    }),
  )
}

function stateOf(record: OperationRecord): ToolState {
  if (record.receipt.kind !== 'admit') throw new Error('recall checked the receipt kind')
  return record.receipt.state
}

function argumentsFailure<B extends ContentBlock>(
  command: AdmitCommand,
  rejection: ToolArgumentsRejection,
  tools: AdmitTools<B>,
  mint: Mint,
): Decision<ToolState, B> {
  switch (rejection.kind) {
    case 'incomplete':
      return reply(invalid('request.arguments.complete', 'incomplete'))
    case 'shape':
      return reply(invalid(`request.arguments.${rejection.field}`, rejection.reason))
    case 'invalid': {
      const diagnostic = `${rejection.field}: ${rejection.reason}`
      return settle(command, { kind: 'failed', cause: 'arguments', diagnostic }, tools, mint)
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

/**
 * The replacement-processing account of a logical terminal (P09): no original tool ran, so no
 * usage or cost is invented. The processing duration is not measured in this increment, so it is
 * unknown rather than zero.
 */
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

/** A logical terminal formed at admission: dummy unavailable or an arguments failure (P02). */
function settle<B extends ContentBlock>(
  command: AdmitCommand,
  terminal: Extract<ToolTerminal, { kind: 'unavailable' | 'failed' }>,
  tools: AdmitTools<B>,
  mint: Mint,
): Decision<ToolState, B> {
  const made = tools.text(describeTerminal(terminal))
  if ('failure' in made)
    return reply(
      fail({ kind: 'unavailable', dependency: 'result-factory', diagnostic: made.failure.reason }),
    )
  const { tenant, call, operation, request } = command
  const version = resultVersion(1)
  const delivery: DeliveryState = {
    kind: 'pending',
    delivery: deliveryId(1),
    consumer: request.consumer,
  }
  const state = logicalState(call, version, terminal, delivery, mint.revision)
  const resultBody = { terminal, effect: state.effect, value: made.ok }
  const result: ResultRecord<B> = {
    tenant,
    call,
    result: version,
    relation: 'original',
    terminal,
    actual: null,
    effect: state.effect,
    value: made.ok,
    delivery,
    source: mintEvidence(`result:${call}/${version}`, mint.revision, resultBody),
    settledBy: operation,
  }
  const account = replacementAccount(call)
  const task: ToolTask = {
    kind: 'deliver',
    operation,
    state: 'pending',
    diagnostic: null,
    result: version,
    delivery: delivery.delivery,
    consumer: request.consumer,
  }
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { tenant, call, admission: operation, request, state } }),
      put(operationRecord(command, { kind: 'admit', state }, mint)),
      put({ kind: 'result', result }),
      put({
        kind: 'account',
        account: {
          tenant,
          call,
          start: null,
          source: mintEvidence(`account:${call}/admission`, mint.revision, account),
          event: 'admission',
          value: account,
        },
      }),
      put({ kind: 'task', task }),
    ],
    value: state,
  }
}

function operationRecord<B extends ContentBlock>(
  command: Pick<AdmitCommand, 'tenant' | 'call' | 'operation' | 'inputDigest'>,
  receipt: OperationReceipt,
  mint: Mint,
): LedgerRecord<B> {
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

/**
 * The authoritative state of a call that settled before any execution. It is a foreground final
 * result: no execution, no effect, no timing segment and no queue position (342 values; the
 * `judgeToolState` rules for an unavailable terminal).
 */
function logicalState(
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
  const state: ToolState = { ...body, source: mintEvidence(`state:${call}`, revision, body) }
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

/** The result version a release names, or why the release cannot proceed (P08). */
function releaseTarget<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: ReleaseCommand,
): Outcome<ResultRecord<B>, ToolFailure> {
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

/**
 * Decides one delivery release. Order: recall by operation; the version, delivery and consumer
 * must be the recorded ones; the handoff evidence must belong to the consumer; an already
 * released delivery answers its released state; otherwise the release is committed with a
 * Tool-side receipt, and the deliver task of that version is done.
 */
export function decideRelease<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: ReleaseCommand,
  mint: Mint,
): Decision<DeliveryState, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'release-delivery')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(deliveryOf(known.ok)))
  const target = releaseTarget(snapshot, command)
  if ('failure' in target) return reply(target)
  const record = target.ok
  if (record.delivery.kind === 'released') return reply(succeed(record.delivery))
  const released: DeliveryState = {
    kind: 'released',
    delivery: record.delivery.delivery,
    consumer: record.delivery.consumer,
    evidence: mintEvidence(
      `delivery:${command.call}/${command.result}/${command.delivery}`,
      mint.revision,
      { operation: command.operation, consumer: command.consumer, handoff: command.evidence },
    ),
  }
  const call = snapshot.call
  if (call === null) throw new Error('releaseTarget checked the call record')
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'result', result: { ...record, delivery: released } }),
      put(operationRecord(command, { kind: 'release-delivery', delivery: released }, mint)),
      put({
        kind: 'call',
        call: { ...call, state: withDelivery(call.state, record, released, mint) },
      }),
      { kind: 'delete', key: taskKey({ kind: 'deliver', operation: record.settledBy }) },
    ],
    value: released,
  }
}

function deliveryOf(record: OperationRecord): DeliveryState {
  if (record.receipt.kind !== 'release-delivery') throw new Error('recall checked the receipt kind')
  return record.receipt.delivery
}

/** The state after a release: the original delivery or the supplement of that version changes. */
function withDelivery<B extends ContentBlock>(
  state: ToolState,
  record: ResultRecord<B>,
  released: DeliveryState,
  mint: Mint,
): ToolState {
  const { source: _source, ...rest } = state
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
  return { ...body, source: mintEvidence(`state:${state.call}`, mint.revision, body) }
}
