import { compactionOperation } from '../compaction-identities.ts'
import { createHash } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Access,
  ActionId,
  AgentExecutionId,
  AgentJournal,
  AgentMaterials,
  AgentReceivedCommits,
  CompactionInputReader,
  CompactionOutcome,
  CompactionResultIdentity,
  CompactionState,
  ContextCompaction,
  DurableEvidence,
  Reply,
  CompactionFailure,
  CompactionProviderBinding,
  CompactionRequest,
  CompactionTaskState,
  Failure,
  Preparation,
  ProducedResult,
  ReceivedCommitValue,
  AgentOperationId,
} from '@omne-harness/agent-contract'
import {
  compactionInputText,
  compactionRequestText,
  decodeActionId,
  decodeCompactionOperationId,
  decodeCompactionOutcome,
  decodeCompactionTaskId,
  decodeConsumptionId,
} from '@omne-harness/agent-contract'
import { canonical } from '../canonical.ts'

export type CompactionConsumerPorts<P> = Readonly<{
  compaction: ContextCompaction<P>
  compactionInputs: CompactionInputReader<P>
  received: AgentReceivedCommits<P, ContentBlock>
  materials: Pick<AgentMaterials<P, ContentBlock>, 'read'>
  journal: Pick<AgentJournal<P>, 'recordResult' | 'query'>
}>
type RetainedCompaction = Readonly<{
  kind: 'received'
  result: CompactionResultIdentity
  received: DurableEvidence
  custody: DurableEvidence
  outcome: CompactionOutcome
}>
export type ReceivedCompaction = RetainedCompaction & Readonly<{ release: DurableEvidence }>

const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`
const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })
function identity<T>(value: Outcome<T, unknown>): T {
  if ('ok' in value) return value.ok
  throw new Error('derived compaction identity is invalid')
}
function operation(state: CompactionState, stage: string): AgentOperationId {
  return compactionOperation(state.task, stage)
}
function failureOf(failure: CompactionFailure): Failure {
  switch (failure.kind) {
    case 'denied':
    case 'invalid':
      return failure
    case 'unavailable':
      return { kind: 'unavailable', owner: failure.dependency, diagnostic: failure.diagnostic }
    case 'unknown':
    case 'commit-unknown':
      return { kind: 'unavailable', owner: failure.ref.authority, diagnostic: failure.kind }
    case 'not-found':
    case 'not-terminal':
      return { kind: 'unavailable', owner: 'compaction', diagnostic: failure.kind }
    default:
      return invalid('compaction', JSON.stringify(failure))
  }
}

export async function beginCompaction<P>(
  reader: CompactionInputReader<P>,
  input: Access<P> &
    Readonly<{
      preparation: Extract<Preparation, { kind: 'needs-compaction' }>
      provider: CompactionProviderBinding
    }>,
): Reply<CompactionState> {
  const frozen = await reader.read({ ...input, reference: input.preparation.input })
  if ('failure' in frozen) return frozen
  if (hash(compactionInputText(frozen.ok)) !== input.preparation.input.digest)
    return fail(invalid('input', 'frozen compaction input digest mismatch'))
  const key = hash(canonical([input.preparation.id, input.preparation.position, input.provider]))
  const action = identity(decodeActionId(`compaction/${key}`))
  const task = identity(decodeCompactionTaskId(`compaction/${key}`))
  const consumer = { ...input.preparation.position, position: 'C1', purpose: 'compaction' }
  const ref = { authority: input.provider.authority, tenant: input.tenant, task }
  const requestDigest = hash(
    compactionRequestText({
      ref,
      provider: input.provider.adoption,
      consumer,
      preparation: input.preparation.id,
      input: frozen.ok,
    }),
  )
  return succeed({
    action,
    task: { authority: ref.authority, task, requestDigest },
    provider: input.provider.adoption,
    consumer,
    input: input.preparation.input,
    consumption: identity(decodeConsumptionId(`compaction/${key}`)),
    result: null,
    received: null,
    transition: null,
    ended: null,
  })
}

type Input<P> = Access<P> &
  Readonly<{ execution: AgentExecutionId; state: CompactionState; preparation: ActionId }>

async function taskState<P>(
  ports: CompactionConsumerPorts<P>,
  input: Input<P>,
): Reply<CompactionTaskState> {
  const ref = { ...input.state.task, tenant: input.tenant }
  const inspected = await ports.compaction.inspect({ ...input, ref })
  if ('failure' in inspected) return fail(failureOf(inspected.failure))
  if (inspected.ok.kind === 'found') return succeed(inspected.ok.state)
  const frozen = await ports.compactionInputs.read({ ...input, reference: input.state.input })
  if ('failure' in frozen) return frozen
  if (hash(compactionInputText(frozen.ok)) !== input.state.input.digest)
    return fail(invalid('input', 'frozen compaction input digest mismatch'))
  const request: CompactionRequest = {
    ref,
    provider: input.state.provider,
    consumer: input.state.consumer,
    preparation: input.preparation,
    input: frozen.ok,
  }
  if (hash(compactionRequestText(request)) !== ref.requestDigest)
    return fail(invalid('request', 'original compaction request changed'))
  const admitted = await ports.compaction.admit({ ...input, request })
  return 'failure' in admitted ? fail(failureOf(admitted.failure)) : admitted
}

async function retained<P>(
  ports: CompactionConsumerPorts<P>,
  input: Input<P>,
  value: ReceivedCommitValue,
): Reply<RetainedCompaction> {
  const { entry } = value
  if (
    entry.delivery.producer !== 'compaction' ||
    canonical(entry.delivery.key.task) !== canonical(input.state.task)
  )
    return fail(invalid('received', 'not the original compaction task'))
  const material = await ports.materials.read({ ...input, source: entry.material })
  if ('failure' in material) return material
  if (
    material.ok.kind !== 'compaction' ||
    material.ok.result.producer.kind !== 'compaction' ||
    canonical(material.ok.result.producer.task) !== canonical(input.state.task) ||
    material.ok.result.version !== entry.delivery.key.result.version
  )
    return fail(invalid('material', 'not the received compaction result'))
  return succeed({
    kind: 'received',
    result: entry.delivery.key.result,
    received: entry.material,
    custody: value.saved,
    outcome: material.ok.outcome,
  })
}

async function receive<P>(
  ports: CompactionConsumerPorts<P>,
  input: Input<P>,
): Reply<RetainedCompaction | Readonly<{ kind: 'pending' }>> {
  const mutation = { ...input, operation: operation(input.state, 'received') }
  const existing = await ports.received.query(mutation)
  if ('failure' in existing) return existing
  if (existing.ok.kind === 'committed') return retained(ports, input, existing.ok.value)
  if (existing.ok.kind === 'excluded')
    return fail(invalid('received', 'compaction custody was excluded'))
  const state = await taskState(ports, input)
  if ('failure' in state) return state
  if (canonical(state.ok.ref) !== canonical({ ...input.state.task, tenant: input.tenant }))
    return fail(invalid('task', 'provider returned a different task'))
  if (state.ok.phase === 'pending') return succeed({ kind: 'pending' })
  if (state.ok.phase === 'handed-off')
    return fail(invalid('custody', 'provider released a result without recoverable custody'))
  const checked = decodeCompactionOutcome(JSON.stringify(state.ok.outcome))
  if ('failure' in checked) return fail(invalid('outcome', checked.failure.field))
  if (hash(canonical(checked.ok)) !== state.ok.result.digest)
    return fail(invalid('result', 'compaction result digest mismatch'))
  const produced: ProducedResult = {
    producer: { kind: 'compaction', task: input.state.task },
    version: state.ok.result.version,
    delivery: null,
    source: state.ok.result.evidence,
  }
  const body = {
    ...mutation,
    entry: {
      kind: 'received' as const,
      delivery: {
        producer: 'compaction' as const,
        key: { kind: 'result' as const, task: input.state.task, result: state.ok.result },
      },
      consumer: input.state.consumer,
      consumption: input.state.consumption,
    },
    material: { kind: 'compaction' as const, result: produced, outcome: checked.ok },
  }
  let committed
  try {
    committed = await ports.received.commit(body)
  } catch {
    committed = fail<Failure>({ kind: 'commit-unknown', operation: mutation.operation })
  }
  if ('failure' in committed && committed.failure.kind !== 'commit-unknown') return committed
  const known = 'failure' in committed ? await ports.received.query(mutation) : committed
  if ('failure' in known) return known
  if (known.ok.kind === 'unknown')
    return fail({ kind: 'commit-unknown', operation: mutation.operation })
  if (known.ok.kind === 'excluded')
    return fail(invalid('received', 'compaction custody was excluded'))
  return retained(ports, input, known.ok.value)
}

async function record<P>(
  ports: CompactionConsumerPorts<P>,
  input: Parameters<CompactionConsumerPorts<P>['journal']['recordResult']>[0],
): Reply<void> {
  let recorded
  try {
    recorded = await ports.journal.recordResult(input)
  } catch {
    recorded = fail<Failure>({ kind: 'commit-unknown', operation: input.operation })
  }
  if ('ok' in recorded) return succeed(undefined)
  if (recorded.failure.kind !== 'commit-unknown') return recorded
  const known = await ports.journal.query(input)
  if ('failure' in known) return known
  return known.ok.kind === 'committed'
    ? succeed(undefined)
    : fail({ kind: 'commit-unknown', operation: input.operation })
}

export async function receiveCompaction<P>(
  ports: CompactionConsumerPorts<P>,
  input: Input<P>,
): Reply<ReceivedCompaction | Readonly<{ kind: 'pending' }>> {
  const received = await receive(ports, input)
  if ('failure' in received) return received
  if (received.ok.kind === 'pending') return succeed(received.ok)
  const value = received.ok
  const result: ProducedResult = {
    producer: { kind: 'compaction', task: input.state.task },
    version: value.result.version,
    delivery: null,
    source: value.result.evidence,
  }
  const recorded = await record(ports, {
    ...input,
    operation: operation(input.state, 'custody'),
    result,
    consumption: input.state.consumption,
    transfer: {
      kind: 'custody',
      result,
      consumption: input.state.consumption,
      retained: value.received,
    },
    release: { kind: 'pending' },
  })
  if ('failure' in recorded) return recorded
  const acknowledged = await ports.compaction.acknowledge({
    ...input,
    ref: { ...input.state.task, tenant: input.tenant },
    operation: identity(decodeCompactionOperationId(operation(input.state, 'acknowledge'))),
    result: value.result,
    handoff: { kind: 'retained', consumer: input.state.consumer, custody: value.custody },
  })
  if ('failure' in acknowledged) return fail(failureOf(acknowledged.failure))
  const released = await record(ports, {
    ...input,
    operation: operation(input.state, 'released'),
    result,
    consumption: input.state.consumption,
    transfer: { kind: 'none' },
    release: { kind: 'confirmed', receipt: acknowledged.ok.receipt },
  })
  return 'failure' in released ? released : succeed({ ...value, release: acknowledged.ok.receipt })
}

export async function cancelCompaction<P>(
  ports: CompactionConsumerPorts<P>,
  input: Input<P> & Readonly<{ completion: DurableEvidence }>,
): Reply<void> {
  const cancelled = await ports.compaction.cancel({
    ...input,
    ref: { ...input.state.task, tenant: input.tenant },
    operation: identity(decodeCompactionOperationId(operation(input.state, 'cancel'))),
  })
  if ('failure' in cancelled) return fail(failureOf(cancelled.failure))
  const received = await receiveCompaction(ports, input)
  if ('failure' in received) return received
  if (received.ok.kind === 'pending')
    return fail(invalid('cancel', 'logical cancellation did not settle the task'))
  const result: ProducedResult = {
    producer: { kind: 'compaction', task: input.state.task },
    version: received.ok.result.version,
    delivery: null,
    source: received.ok.result.evidence,
  }
  return record(ports, {
    ...input,
    operation: operation(input.state, 'excluded'),
    result,
    consumption: input.state.consumption,
    transfer: {
      kind: 'processed',
      result,
      consumption: input.state.consumption,
      completion: input.completion,
    },
    release: { kind: 'confirmed', receipt: received.ok.release },
  })
}
