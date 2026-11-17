import { compactionGeneration } from '@omne-harness/agent-contract'
import type {
  Access,
  Adoption,
  CompactionFailure,
  CompactionHandoff,
  CompactionOperationId,
  CompactionOutcome,
  CompactionReply,
  CompactionRequest,
  CompactionResultIdentity,
  CompactionTaskRef,
  CompactionTaskState,
  ContextCompaction,
  DurableEvidence,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeCompactionHandoff,
  decodeCompactionRequest,
  encodeCompactionRequest,
} from '@omne-harness/agent-contract'
import { tenantEquals } from '@omne-harness/legal-identity'
import { judgeMessage } from '@omne-harness/message'
import { canonical, compactionRequestDigest, digest, taskEvidence } from './evidence.ts'

export type CompactionRecord = Readonly<{
  state: CompactionTaskState
  request: CompactionRequest | null
  execution: string | null
  cancellation: CompactionOperationId | null
  acknowledgment: Readonly<{
    operation: CompactionOperationId
    handoff: CompactionHandoff
  }> | null
}>

export interface CompactionStore {
  read(ref: CompactionTaskRef): CompactionReply<CompactionRecord | null>
  change<T>(
    ref: CompactionTaskRef,
    decide: (
      record: CompactionRecord | null,
    ) => Outcome<Readonly<{ record: CompactionRecord | null; value: T }>, CompactionFailure>,
  ): CompactionReply<T>
  pending(
    input: Readonly<{ authority: string; after: string | null; limit: number }>,
  ): CompactionReply<Readonly<{ refs: readonly CompactionTaskRef[]; next: string | null }>>
}

export type CompactionExecution =
  | Readonly<{
      phase: 'pending'
      knowledge: 'accepted' | 'uncertain'
      physical: 'pending' | 'unknown'
    }>
  | Readonly<{
      phase: 'terminal'
      outcome: Exclude<CompactionOutcome, { kind: 'cancelled' }>
      physical: 'pending' | 'settled' | 'unknown'
    }>

export interface CompactionExecutor {
  readonly initialState?: string
  advance(
    request: CompactionRequest,
    generation: DurableEvidence,
  ): CompactionReply<CompactionExecution>
  cancel(request: CompactionRequest): CompactionReply<'pending' | 'settled' | 'unknown'>
}

export type CompactionProviderOptions<P> = Readonly<{
  authority: string
  adoption: Adoption
  store: CompactionStore
  executor: CompactionExecutor
  authorize(
    input: Access<P> &
      Readonly<{
        operation: 'admit' | 'inspect' | 'cancel' | 'acknowledge'
        ref: CompactionTaskRef
      }>,
  ): CompactionReply<void>
  custody(
    input: Access<P> &
      Readonly<{
        ref: CompactionTaskRef
        consumer: CompactionRequest['consumer']
        result: CompactionResultIdentity
        handoff: CompactionHandoff
      }>,
  ): CompactionReply<void>
}>

export type CompactionProvider<P> = Readonly<{
  service: ContextCompaction<P>
  reconcile(ref: CompactionTaskRef): CompactionReply<CompactionTaskState>
  withdraw(): void
}>

export function createContextCompaction<P>(
  options: CompactionProviderOptions<P>,
): CompactionProvider<P> {
  let accepting = true

  async function authorize(
    input: Access<P>,
    operation: Parameters<typeof options.authorize>[0]['operation'],
    ref: CompactionTaskRef,
  ) {
    if (!tenantEquals(input.tenant, ref.tenant))
      return fail<CompactionFailure>({ kind: 'denied', action: operation })
    if (ref.authority !== options.authority)
      return fail<CompactionFailure>({
        kind: 'invalid',
        field: 'authority',
        reason: 'wrong-authority',
      })
    return options.authorize({ ...input, operation, ref })
  }

  async function read(ref: CompactionTaskRef): CompactionReply<CompactionRecord | null> {
    const found = await options.store.read(ref)
    if ('failure' in found || found.ok === null) return found
    return matches(found.ok, ref) ? found : fail({ kind: 'conflict', ref })
  }

  const service: ContextCompaction<P> = {
    async inspect(input) {
      const allowed = await authorize(input, 'inspect', input.ref)
      if ('failure' in allowed) return allowed
      const found = await read(input.ref)
      if ('failure' in found) return found
      return succeed(
        found.ok === null ? { kind: 'missing' } : { kind: 'found', state: found.ok.state },
      )
    },
    async admit(input) {
      const encoded = encodeCompactionRequest(input.request)
      if ('failure' in encoded) return fail({ kind: 'invalid', ...encoded.failure })
      const copied = decodeCompactionRequest(encoded.ok)
      if ('failure' in copied) return fail({ kind: 'invalid', ...copied.failure })
      const request = copied.ok
      const allowed = await authorize(input, 'admit', request.ref)
      if ('failure' in allowed) return allowed
      if (compactionRequestDigest(request) !== request.ref.requestDigest)
        return fail({
          kind: 'invalid',
          field: 'requestDigest',
          reason: 'does not bind the complete request',
        })
      return options.store.change(request.ref, record =>
        admittedRecord(options, accepting, request, record),
      )
    },
    async cancel(input) {
      const allowed = await authorize(input, 'cancel', input.ref)
      if ('failure' in allowed) return allowed
      return options.store.change(input.ref, record => cancelledRecord(input, record))
    },
    async acknowledge(input) {
      const copied = decodeCompactionHandoff(JSON.stringify(input.handoff))
      if ('failure' in copied) return fail({ kind: 'invalid', ...copied.failure })
      input = { ...input, handoff: copied.ok }
      const allowed = await authorize(input, 'acknowledge', input.ref)
      if ('failure' in allowed) return allowed
      const readResult = await read(input.ref)
      if ('failure' in readResult) return readResult
      const record = readResult.ok
      if (record === null) return fail({ kind: 'not-found' })
      const checked = acknowledgment(record, input)
      if ('failure' in checked) return checked
      if (checked.ok !== null) return succeed(checked.ok)
      const retained = await options.custody({
        ...input,
        consumer: input.handoff.consumer,
      })
      if ('failure' in retained) return retained
      return options.store.change(input.ref, latest => handedOffRecord(input, latest))
    },
  }

  async function reconcile(ref: CompactionTaskRef): CompactionReply<CompactionTaskState> {
    const found = await read(ref)
    if ('failure' in found) return found
    const record = found.ok
    if (record === null) return fail({ kind: 'not-found' })
    if (
      record.request === null ||
      (record.state.phase !== 'pending' && record.state.physical === 'settled')
    )
      return succeed(record.state)
    const request = record.request
    const execution =
      record.cancellation !== null
        ? await options.executor
            .cancel(record.request)
            .then(answer =>
              'failure' in answer
                ? answer
                : succeed({ phase: 'physical' as const, physical: answer.ok }),
            )
        : await options.executor.advance(record.request, compactionGeneration(record.request.ref))
    if ('failure' in execution) return execution
    const update = execution.ok
    return options.store.change(ref, latest =>
      reconciledRecord(ref, record, request, update, latest),
    )
  }

  return {
    service,
    reconcile,
    withdraw() {
      accepting = false
    },
  }
}

// The store changes of the provider. Each takes the record it changes and returns the next one.
type AcknowledgeReceipt = Readonly<{
  ref: CompactionTaskRef
  result: CompactionResultIdentity
  receipt: DurableEvidence
}>
type Change<T> = Outcome<Readonly<{ record: CompactionRecord | null; value: T }>, CompactionFailure>

function admittedRecord<P>(
  options: CompactionProviderOptions<P>,
  accepting: boolean,
  request: CompactionRequest,
  record: CompactionRecord | null,
): Change<CompactionTaskState> {
  if (record !== null) return existing(record, request.ref)
  if (!accepting)
    return fail({
      kind: 'unavailable',
      dependency: options.authority,
      diagnostic: 'provider is withdrawing',
    })
  if (canonical(request.provider) !== canonical(options.adoption))
    return fail({ kind: 'unsupported', field: 'provider', provider: request.provider })
  const state: CompactionTaskState = {
    ref: request.ref,
    revision: '1',
    phase: 'pending',
    knowledge: 'accepted',
    physical: 'pending',
  }
  return succeed({
    record: {
      state,
      request,
      execution: options.executor.initialState ?? null,
      cancellation: null,
      acknowledgment: null,
    },
    value: state,
  })
}

function cancelledRecord(
  input: Readonly<{ ref: CompactionTaskRef; operation: CompactionOperationId }>,
  record: CompactionRecord | null,
): Change<CompactionTaskState> {
  if (record !== null && !matches(record, input.ref))
    return fail({ kind: 'conflict', ref: input.ref })
  if (record !== null && record.state.phase !== 'pending') return existing(record, input.ref)
  const outcome: CompactionOutcome = { kind: 'cancelled', operation: input.operation }
  const state = terminal(
    input.ref,
    record === null ? '1' : next(record.state.revision),
    outcome,
    record === null ? 'settled' : 'unknown',
  )
  return succeed({
    record: {
      state,
      request: record?.request ?? null,
      execution: record?.execution ?? null,
      cancellation: input.operation,
      acknowledgment: null,
    },
    value: state,
  })
}

function handedOffRecord(
  input: Parameters<ContextCompaction<unknown>['acknowledge']>[0],
  latest: CompactionRecord | null,
): Change<AcknowledgeReceipt> {
  if (latest === null) return fail({ kind: 'not-found' })
  const known = acknowledgment(latest, input)
  if ('failure' in known) return known
  if (known.ok !== null) return succeed({ record: latest, value: known.ok })
  const receipt = taskEvidence(input.ref, 'handoff', {
    operation: input.operation,
    result: input.result,
    handoff: input.handoff,
  })
  const state: CompactionTaskState = {
    ref: input.ref,
    revision: next(latest.state.revision),
    physical: latest.state.physical,
    phase: 'handed-off',
    result: input.result,
    receipt,
  }
  return succeed({
    record: {
      ...latest,
      state,
      acknowledgment: { operation: input.operation, handoff: input.handoff },
    },
    value: { ref: input.ref, result: input.result, receipt },
  })
}

function reconciledRecord(
  ref: CompactionTaskRef,
  record: CompactionRecord,
  request: CompactionRequest,
  update:
    | CompactionExecution
    | Readonly<{ phase: 'physical'; physical: 'pending' | 'settled' | 'unknown' }>,
  latest: CompactionRecord | null,
): Change<CompactionTaskState> {
  if (latest === null) return fail({ kind: 'not-found' })
  if (!matches(latest, ref)) return fail({ kind: 'conflict', ref })
  if (latest.state.phase !== 'pending') {
    if (latest.state.revision !== record.state.revision) return existing(latest, ref)
    const state = {
      ...latest.state,
      revision: next(latest.state.revision),
      physical: update.physical,
    }
    return succeed({ record: { ...latest, state }, value: state })
  }
  if (update.phase === 'physical') return existing(latest, ref)
  const state: CompactionTaskState =
    update.phase === 'pending'
      ? {
          ...latest.state,
          revision: next(latest.state.revision),
          knowledge: update.knowledge,
          physical: update.physical,
        }
      : terminal(
          ref,
          next(latest.state.revision),
          validatedOutcome(request, update.outcome),
          update.physical,
        )
  return succeed({ record: { ...latest, state }, value: state })
}

const next = (revision: string) => String(BigInt(revision) + 1n)
const matches = (record: CompactionRecord, ref: CompactionTaskRef) =>
  canonical(record.state.ref) === canonical(ref)

function existing(record: CompactionRecord, ref: CompactionTaskRef) {
  return matches(record, ref)
    ? succeed({ record, value: record.state })
    : fail<CompactionFailure>({ kind: 'conflict', ref })
}

function terminal(
  ref: CompactionTaskRef,
  revision: string,
  outcome: CompactionOutcome,
  physical: CompactionTaskState['physical'],
): CompactionTaskState {
  return {
    ref,
    revision,
    physical,
    phase: 'terminal',
    custody: 'provider',
    outcome,
    result: {
      version: '1',
      evidence: taskEvidence(ref, 'result', outcome),
      digest: digest(outcome),
    },
  }
}

function validatedOutcome(
  request: CompactionRequest,
  outcome: CompactionOutcome,
): CompactionOutcome {
  if (outcome.kind !== 'completed') return outcome
  const message = judgeMessage(outcome.message)
  return 'ok' in message &&
    message.ok.role === 'compaction' &&
    message.ok.id === request.input.outputMessageId &&
    canonical(message.ok.derivation) === canonical(compactionGeneration(request.ref))
    ? { kind: 'completed', message: message.ok }
    : {
        kind: 'failed',
        reason: 'invalid-output',
        diagnostic:
          'message identity, shape, visibility or generation differs from the frozen task',
      }
}

type Acknowledgment = Awaited<ReturnType<ContextCompaction<unknown>['acknowledge']>>
type Acknowledged = Extract<Acknowledgment, { ok: unknown }>['ok']

function acknowledgment(
  record: CompactionRecord,
  input: Parameters<ContextCompaction<unknown>['acknowledge']>[0],
): Outcome<Acknowledged | null, CompactionFailure> {
  if (!matches(record, input.ref)) return fail({ kind: 'conflict', ref: input.ref })
  if (record.state.phase === 'pending') return fail({ kind: 'not-terminal' })
  if (canonical(record.state.result) !== canonical(input.result))
    return fail({ kind: 'conflict', ref: input.ref })
  if (
    record.request !== null &&
    canonical(record.request.consumer) !== canonical(input.handoff.consumer)
  )
    return fail({ kind: 'handoff-invalid', reason: 'consumer differs from the admitted request' })
  if (record.state.phase !== 'handed-off') return succeed(null)
  if (
    record.acknowledgment === null ||
    canonical(record.acknowledgment.handoff) !== canonical(input.handoff)
  )
    return fail({ kind: 'conflict', ref: input.ref })
  return succeed({ ref: input.ref, result: input.result, receipt: record.state.receipt })
}
