import { randomBytes } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  decodeModelOperationId,
  type MaterializationReceipt,
  type ModelFailure,
  type ModelFault,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import {
  MODEL_SEND,
  type MaterializedTransport,
  type ModelCommands,
  type SendDemand,
  type SendResult,
  type ModelTransport,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import { SendLifetime, ownedFacts } from './lifetime.ts'
import type { CredentialSelection, ModelSendBoundaryOptions, SendStart } from './types.ts'
type Commands = ModelCommands<unknown>
type Write<A, T> = {
  input: A
  confirmation: 'new' | 'pending' | 'committed'
  run(input: A): Promise<Outcome<T, ModelFailure>>
}
type WriteResult<T> =
  | { kind: 'confirmed'; value: T }
  | { kind: 'rejected'; failure: ModelFailure }
  | { kind: 'unconfirmed' }
// A pending stop stays outside perform's busy lifetime, as with a direct return of stop().
type Completion = { kind: 'complete'; result: SendResult | Promise<SendResult> }
type Progress = Completion | { kind: 'continue' }
type Materialization = Parameters<Commands['recordMaterialization']>[0]
type MaterializationResult = Extract<
  Awaited<ReturnType<Commands['recordMaterialization']>>,
  { ok: unknown }
>['ok']
type Window = Parameters<Commands['openReceiveWindow']>[0]
type RecordSend = Parameters<Commands['recordSend']>[0]
type Preserve = Parameters<Commands['preserve']>[0]
type Refusal = Extract<SendStart, { kind: 'refused' }>
type TransportFailure = Extract<
  Awaited<ReturnType<ModelTransport['prepare']>>,
  { failure: unknown }
>['failure']
type Stage =
  | { kind: 'acquire' }
  | { kind: 'refusal'; result: Refusal }
  | {
      kind: 'materialization'
      write: Write<Materialization, MaterializationResult>
    }
  | { kind: 'window'; write: Write<Window, Window['expected']>; next: { kind: 'start' } | Refusal }
  | { kind: 'start'; revision: Window['expected'] }
  | { kind: 'record'; write: Write<RecordSend, RecordSend['expected']>; result: SendStart }
  | { kind: 'terminal'; write: Write<Preserve, unknown>; failure: ModelFailure }
  | { kind: 'handed' }
  | { kind: 'unknown'; diagnostic: string }
export type SendAttempt<P> = {
  input: SendDemand<P>
  signal: AbortSignal
  lifetime: SendLifetime
  window: string
  receipt: MaterializationReceipt | undefined
  stage: Stage
  busy: boolean
}
export const unavailable = (dependency: string, diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency,
  diagnostic,
})
export const refused = (failure: ModelFailure): SendResult => ({ kind: 'not-started', failure })
/**
 * A credential that is missing or cannot be read does not come back by itself: the call ends as a
 * failure with cause `credential`, not as an unavailable that a caller waits on. No byte was sent,
 * so there is no upstream status.
 */
function credentialFault(diagnostic: 'credential-missing' | 'credential-unreadable'): ModelFault {
  return { cause: 'credential', diagnostic, upstreamStatus: null }
}
type RefusalReason = Readonly<{ failure: ModelFailure; fault?: ModelFault }>
function transportRefusal(failure: TransportFailure): RefusalReason {
  if (failure.kind === 'unavailable') return { failure }
  const causes = { denied: 'excluded', invalid: 'input-rejected', unsupported: 'modality' } as const
  return {
    failure,
    fault: {
      cause: causes[failure.kind],
      diagnostic: `transport-${failure.kind}`,
      upstreamStatus: null,
    },
  }
}
function operation(): ModelOperationId {
  const decoded = decodeModelOperationId(`mop_${randomBytes(16).toString('hex')}`)
  if ('ok' in decoded) return decoded.ok
  throw new Error('invalid generated Model operation')
}

export function createAttemptRunner<P>(
  options: ModelSendBoundaryOptions<P>,
  attempts: Map<string, SendAttempt<P>>,
) {
  const { commands, coordinator, credentials, resources } = options
  const unknown = (attempt: SendAttempt<P>, diagnostic: string): SendResult => ({
    kind: 'unknown',
    dispatch: attempt.input.dispatch,
    diagnostic,
  })
  async function write<A extends { operation: ModelOperationId }, T>(
    attempt: SendAttempt<P>,
    entry: Write<A, T>,
  ): Promise<WriteResult<T>> {
    try {
      if (entry.confirmation === 'pending') {
        const query = await commands.query({ ...attempt.input, operation: entry.input.operation })
        if ('failure' in query || query.ok.kind === 'unknown') return { kind: 'unconfirmed' }
        entry.confirmation = query.ok.kind === 'committed' ? 'committed' : 'new'
      }
      // Mark before entering a provider: a thrown or disconnected write can have committed.
      const committed = entry.confirmation === 'committed'
      if (!committed) entry.confirmation = 'pending'
      const result = await entry.run(entry.input)
      if ('ok' in result) {
        entry.confirmation = 'committed'
        return { kind: 'confirmed', value: result.ok }
      }
      if (
        committed ||
        result.failure.kind === 'commit-unknown' ||
        result.failure.kind === 'unavailable'
      )
        return { kind: 'unconfirmed' }
      entry.confirmation = 'new'
      return { kind: 'rejected', failure: result.failure }
    } catch {
      return { kind: 'unconfirmed' }
    }
  }
  async function stop(
    id: string,
    attempt: SendAttempt<P>,
    failure: ModelFailure,
  ): Promise<SendResult> {
    try {
      await attempt.lifetime.close()
    } catch {
      attempt.stage = { kind: 'unknown', diagnostic: 'resource-release-failed' }
      return refused(unavailable('model-send', 'resource-release-failed'))
    }
    attempts.delete(id)
    return refused(failure)
  }
  /**
   * Ends a final refusal. A release failure keeps the attempt and its capacity held, as `stop`
   * does, but the answer stays the definite one: a retryable unavailable would leave the caller
   * waiting on a call that cannot be sent.
   */
  async function stopFinal(
    id: string,
    attempt: SendAttempt<P>,
    failure: ModelFailure,
  ): Promise<SendResult> {
    try {
      await attempt.lifetime.close()
    } catch {
      attempt.stage = { kind: 'unknown', diagnostic: 'resource-release-failed' }
      return refused(failure)
    }
    attempts.delete(id)
    return refused(failure)
  }
  /** The secret of the selected credential, only through the qualified path and its own scope. */
  function resolveCredential(
    attempt: SendAttempt<P>,
    selection: CredentialSelection,
  ): Readonly<{ ok: string }> | RefusalReason {
    if (!credentials.resolveFor || typeof selection.official !== 'boolean')
      return { failure: unavailable('model-credential', 'qualified-path-missing') }
    const resolved = credentials.resolveFor({
      id: selection.id,
      purpose: MODEL_SEND,
      official: selection.official,
      access: { principal: attempt.input.principal, tenant: attempt.input.tenant },
    })
    if (resolved.kind === 'denied')
      return { failure: { kind: 'denied', action: 'model-credential' } }
    if (resolved.kind === 'absent' || resolved.kind === 'unreadable') {
      const diagnostic = resolved.kind === 'absent' ? 'credential-missing' : 'credential-unreadable'
      return {
        failure: unavailable('model-credential', diagnostic),
        fault: credentialFault(diagnostic),
      }
    }
    if (resolved.kind !== 'value')
      return { failure: unavailable('model-credential', `credential-${resolved.kind}`) }
    if (resolved.scope !== selection.scope)
      return { failure: { kind: 'denied', action: 'credential-scope' } }
    return { ok: resolved.value }
  }
  function start(attempt: SendAttempt<P>, selection: CredentialSelection): SendStart {
    try {
      if (attempt.signal.aborted)
        return { kind: 'refused', failure: unavailable('model-send', 'cancelled-before-start') }
      const { materialized, resource } = attempt.lifetime
      if (!materialized || !resource) throw new Error('missing send resource')
      if (!isDeepStrictEqual(attempt.receipt, materialized.receipt))
        return {
          kind: 'refused',
          failure: { kind: 'invalid', field: 'receipt', reason: 'changed-after-commit' },
        }
      const credential = resolveCredential(attempt, selection)
      if ('failure' in credential) return { kind: 'refused', ...credential }
      try {
        return {
          kind: 'started',
          facts: resource.startWithCredential(materialized, credential.ok, attempt.signal),
        }
      } catch {
        return { kind: 'unknown', diagnostic: 'transport-start-unknown' }
      }
    } catch {
      return { kind: 'refused', failure: unavailable('model-credential', 'credential-unavailable') }
    }
  }
  async function acquireResources(
    attempt: SendAttempt<P>,
  ): Promise<{ ok: MaterializedTransport } | RefusalReason> {
    const input = attempt.input
    const acquired = await resources.acquire(input)
    if ('failure' in acquired) return acquired
    attempt.lifetime.resource = acquired.ok
    // A send is a first dispatch until a re-dispatch after `replay-rejected` names its messages.
    const prepared = await acquired.ok.transport.prepare(input.request, input.supplier, {
      resent: [],
    })
    if ('failure' in prepared) return transportRefusal(prepared.failure)
    attempt.lifetime.prepared = prepared.ok
    const materialized = await prepared.ok.materialize(attempt.signal)
    if ('failure' in materialized) return transportRefusal(materialized.failure)
    attempt.lifetime.materialized = materialized.ok
    return materialized
  }
  function receiptMatches(
    receipt: MaterializationReceipt,
    original: MaterializationReceipt,
    input: SendDemand<P>,
  ): boolean {
    return (
      isDeepStrictEqual(receipt, original) &&
      isDeepStrictEqual(receipt.supplier, input.supplier.adoption) &&
      isDeepStrictEqual(receipt.representation, input.request.representation) &&
      /^[0-9a-f]{64}$/u.test(receipt.payloadDigest)
    )
  }
  async function acquire(id: string, attempt: SendAttempt<P>): Promise<Progress> {
    const input = attempt.input
    const records = await commands.dispatches(input)
    if ('failure' in records)
      return { kind: 'complete', result: stop(id, attempt, records.failure) }
    const dispatch = records.ok.find(record => record.dispatch === input.dispatch)
    if (!dispatch || dispatch.send !== 'prepared' || dispatch.materialization !== null) {
      attempts.delete(id)
      return { kind: 'complete', result: unknown(attempt, 'original-send-already-attempted') }
    }
    const eligible = coordinator.check(input, 'prepare')
    if ('failure' in eligible)
      return { kind: 'complete', result: stop(id, attempt, eligible.failure) }
    if (attempt.signal.aborted)
      return {
        kind: 'complete',
        result: stop(id, attempt, unavailable('model-send', 'cancelled-before-prepare')),
      }
    const materialized = await acquireResources(attempt)
    if ('failure' in materialized) {
      if (materialized.fault !== undefined) {
        attempt.stage = { kind: 'refusal', result: { kind: 'refused', ...materialized } }
        return { kind: 'continue' }
      }
      return { kind: 'complete', result: stop(id, attempt, materialized.failure) }
    }
    const receipt = structuredClone(materialized.ok.receipt)
    if (!receiptMatches(receipt, materialized.ok.receipt, input))
      return {
        kind: 'complete',
        result: stop(id, attempt, { kind: 'invalid', field: 'receipt', reason: 'binding' }),
      }
    attempt.receipt = receipt
    const current = await commands.loadRecovery(input)
    if ('failure' in current)
      return { kind: 'complete', result: stop(id, attempt, current.failure) }
    attempt.stage = {
      kind: 'materialization',
      write: {
        input: {
          ...input.execution,
          operation: operation(),
          expected: current.ok.state.revision,
          dispatch: input.dispatch,
          receipt,
        },
        confirmation: 'new',
        run: entry => commands.recordMaterialization(entry),
      },
    }
    return { kind: 'continue' }
  }
  async function prepareRefusalWindow(
    attempt: SendAttempt<P>,
    entry: Extract<Stage, { kind: 'refusal' }>,
  ): Promise<Progress> {
    const current = await commands.loadRecovery(attempt.input)
    if ('failure' in current)
      return { kind: 'complete', result: unknown(attempt, 'refusal-revision-unconfirmed') }
    attempt.stage = {
      kind: 'window',
      next: entry.result,
      write: {
        input: {
          ...attempt.input.execution,
          operation: operation(),
          expected: current.ok.state.revision,
          dispatch: attempt.input.dispatch,
          window: attempt.window,
        },
        confirmation: 'new',
        run: input => commands.openReceiveWindow(input),
      },
    }
    return { kind: 'continue' }
  }
  async function recordMaterialization(
    id: string,
    attempt: SendAttempt<P>,
    entry: Extract<Stage, { kind: 'materialization' }>,
  ): Promise<Progress> {
    const input = attempt.input
    const result = await write(attempt, entry.write)
    if (result.kind === 'unconfirmed')
      return { kind: 'complete', result: unknown(attempt, 'materialization-commit-unknown') }
    if (result.kind === 'rejected')
      return { kind: 'complete', result: stop(id, attempt, result.failure) }
    attempt.stage = {
      kind: 'window',
      next: { kind: 'start' },
      write: {
        input: {
          ...input.execution,
          operation: operation(),
          expected: result.value.revision,
          dispatch: input.dispatch,
          window: attempt.window,
        },
        confirmation: 'new',
        run: entry => commands.openReceiveWindow(entry),
      },
    }
    return { kind: 'continue' }
  }
  async function recordWindow(
    id: string,
    attempt: SendAttempt<P>,
    entry: Extract<Stage, { kind: 'window' }>,
  ): Promise<Completion> {
    const result = await write(attempt, entry.write)
    if (result.kind === 'unconfirmed')
      return { kind: 'complete', result: unknown(attempt, 'receive-window-commit-unknown') }
    if (result.kind === 'rejected')
      return { kind: 'complete', result: stop(id, attempt, result.failure) }
    if (entry.next.kind === 'refused')
      return recordStarted(id, attempt, buildRecord(attempt, result.value, operation(), entry.next))
    const starting: Extract<Stage, { kind: 'start' }> = { kind: 'start', revision: result.value }
    attempt.stage = starting
    const recording = startAndBuildRecord(attempt, starting)
    return recordStarted(id, attempt, recording)
  }
  function startQualified(attempt: SendAttempt<P>, receipt: MaterializationReceipt): SendStart {
    const input = attempt.input
    let original: SendStart | undefined
    let entered = false
    let decision: SendStart
    try {
      const coordinated = coordinator.withinCurrent(input, receipt, attempt.window, selection => {
        if (entered) return original ?? { kind: 'unknown', diagnostic: 'send-start-in-progress' }
        entered = true
        original = start(attempt, selection)
        return original
      })
      decision = original ?? coordinated
    } catch {
      decision = original ?? {
        kind: 'refused',
        failure: unavailable('model-send', 'qualification-unavailable'),
      }
    }
    return decision
  }
  function startAndBuildRecord(
    attempt: SendAttempt<P>,
    entry: Extract<Stage, { kind: 'start' }>,
  ): Extract<Stage, { kind: 'record' }> {
    if (!attempt.receipt) throw new Error('missing receipt')
    const sendOperation = operation()
    const decision = startQualified(attempt, attempt.receipt)
    return buildRecord(attempt, entry.revision, sendOperation, decision)
  }
  function buildRecord(
    attempt: SendAttempt<P>,
    revision: Window['expected'],
    sendOperation: ModelOperationId,
    decision: SendStart,
  ): Extract<Stage, { kind: 'record' }> {
    const input = attempt.input
    const recording: Extract<Stage, { kind: 'record' }> = {
      kind: 'record',
      result: decision,
      write: {
        input: {
          ...input.execution,
          operation: sendOperation,
          expected: revision,
          dispatch: input.dispatch,
          state:
            decision.kind === 'refused'
              ? 'not-sent'
              : decision.kind === 'started'
                ? 'started'
                : 'unknown',
        },
        confirmation: 'new',
        run: entry => commands.recordSend(entry),
      },
    }
    attempt.stage = recording
    return recording
  }
  /** A refusal whose not-sent record was definitely rejected: nothing was committed or sent. */
  async function rejectedRefusal(
    id: string,
    attempt: SendAttempt<P>,
    decision: Extract<SendStart, { kind: 'refused' }>,
    rejection: ModelFailure,
  ): Promise<Completion> {
    // A final refusal must not come back as a retryable unavailable: the write rejection is the
    // definite answer of the record owner.
    if (decision.fault !== undefined)
      return { kind: 'complete', result: stopFinal(id, attempt, rejection) }
    try {
      await attempt.lifetime.close()
    } catch {
      return {
        kind: 'complete',
        result: refused(unavailable('model-send', 'resource-release-failed')),
      }
    }
    return { kind: 'complete', result: refused(decision.failure) }
  }
  async function recordStarted(
    id: string,
    attempt: SendAttempt<P>,
    entry: Extract<Stage, { kind: 'record' }>,
  ): Promise<Completion> {
    const { result: decision, write: original } = entry
    const recorded = await write(attempt, original)
    if (recorded.kind === 'rejected' && decision.kind === 'refused')
      return rejectedRefusal(id, attempt, decision, recorded.failure)
    if (recorded.kind !== 'confirmed')
      return { kind: 'complete', result: unknown(attempt, 'send-record-unconfirmed') }
    if (decision.kind === 'refused' && decision.fault !== undefined) {
      attempt.stage = terminalStage(attempt, recorded.value, decision.failure, decision.fault)
      return recordTerminal(id, attempt, attempt.stage)
    }
    if (decision.kind === 'refused')
      return { kind: 'complete', result: stop(id, attempt, decision.failure) }
    if (decision.kind === 'unknown') {
      attempt.stage = { kind: 'unknown', diagnostic: decision.diagnostic }
      try {
        await attempt.lifetime.close()
      } catch {
        return { kind: 'complete', result: unknown(attempt, 'resource-release-failed') }
      }
      return { kind: 'complete', result: unknown(attempt, decision.diagnostic) }
    }
    attempt.stage = { kind: 'handed' }
    return {
      kind: 'complete',
      result: {
        kind: 'started',
        window: attempt.window,
        facts: ownedFacts(decision.facts, attempt.lifetime, () => {
          attempts.delete(id)
        }),
      },
    }
  }
  /**
   * Prepares the write that records a final refusal as the terminal of the not-sent dispatch, in
   * the receive window this attempt opened. Nothing was started, so the window holds this one fact.
   * The stage keeps the write, so a retry after an unconfirmed result uses the same operation.
   */
  function terminalStage(
    attempt: SendAttempt<P>,
    revision: RecordSend['expected'],
    failure: ModelFailure,
    fault: ModelFault,
  ): Extract<Stage, { kind: 'terminal' }> {
    const input = attempt.input
    return {
      kind: 'terminal',
      failure,
      write: {
        input: {
          ...input.execution,
          operation: operation(),
          expected: revision,
          dispatch: input.dispatch,
          window: attempt.window,
          facts: [{ kind: 'ended', termination: { kind: 'failed', fault } }],
        },
        confirmation: 'new',
        run: entry => commands.preserve(entry),
      },
    }
  }
  /** Writes the terminal so the driver can settle the call with it. Unconfirmed stays unknown. */
  async function recordTerminal(
    id: string,
    attempt: SendAttempt<P>,
    entry: Extract<Stage, { kind: 'terminal' }>,
  ): Promise<Completion> {
    const written = await write(attempt, entry.write)
    if (written.kind === 'unconfirmed')
      return { kind: 'complete', result: unknown(attempt, 'credential-terminal-unconfirmed') }
    // A definite rejection (stale instance, conflict, denied) is returned as it is, so the caller
    // does not wait on the credential's retryable unavailable.
    const failure = written.kind === 'rejected' ? written.failure : entry.failure
    return { kind: 'complete', result: stopFinal(id, attempt, failure) }
  }
  async function failed(id: string, attempt: SendAttempt<P>): Promise<Completion> {
    // A coordinator exception can occur after calling start. Never retry that stage.
    if (attempt.stage.kind === 'start') {
      attempt.stage = { kind: 'unknown', diagnostic: 'coordinator-start-unconfirmed' }
      try {
        await attempt.lifetime.close()
      } catch {
        return { kind: 'complete', result: unknown(attempt, 'resource-release-failed') }
      }
      return { kind: 'complete', result: unknown(attempt, 'coordinator-start-unconfirmed') }
    }
    if (attempt.stage.kind === 'record')
      return { kind: 'complete', result: unknown(attempt, 'send-record-unconfirmed') }
    if (attempt.stage.kind === 'refusal')
      return { kind: 'complete', result: unknown(attempt, 'refusal-revision-unconfirmed') }
    return {
      kind: 'complete',
      result: stop(id, attempt, unavailable('model-send', 'transport-prepare-failed')),
    }
  }
  async function perform(id: string, attempt: SendAttempt<P>): Promise<SendResult> {
    try {
      if (attempt.stage.kind === 'acquire') {
        const result = await acquire(id, attempt)
        if (result.kind !== 'continue') return result.result
      }
      if (attempt.stage.kind === 'refusal') {
        const result = await prepareRefusalWindow(attempt, attempt.stage)
        if (result.kind !== 'continue') return result.result
      }
      if (attempt.stage.kind === 'materialization') {
        const result = await recordMaterialization(id, attempt, attempt.stage)
        if (result.kind !== 'continue') return result.result
      }
      if (attempt.stage.kind === 'window')
        return (await recordWindow(id, attempt, attempt.stage)).result
      if (attempt.stage.kind === 'start') startAndBuildRecord(attempt, attempt.stage)
      if (attempt.stage.kind === 'record')
        return (await recordStarted(id, attempt, attempt.stage)).result
      if (attempt.stage.kind === 'terminal')
        return (await recordTerminal(id, attempt, attempt.stage)).result
      return unknown(
        attempt,
        attempt.stage.kind === 'unknown'
          ? attempt.stage.diagnostic
          : 'original-send-already-attempted',
      )
    } catch {
      return (await failed(id, attempt)).result
    } finally {
      attempt.busy = false
    }
  }
  return perform
}
