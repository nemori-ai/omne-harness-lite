import { randomBytes } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  MODEL_SEND,
  decodeModelOperationId,
  type MaterializationReceipt,
  type ModelCommands,
  type ModelFailure,
  type ModelOperationId,
  type SendDemand,
  type SendResult,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { SendLifetime, ownedFacts } from './lifetime.ts'
import type { CredentialSelection, ModelSendBoundaryOptions, SendStart } from './types.ts'
type Commands = ModelCommands<unknown>
type Write<A, T> = { input: A; pending: boolean; run(input: A): Promise<Outcome<T, ModelFailure>> }
type Materialization = Parameters<Commands['recordMaterialization']>[0]
type MaterializationResult = Extract<
  Awaited<ReturnType<Commands['recordMaterialization']>>,
  { ok: unknown }
>['ok']
type Window = Parameters<Commands['openReceiveWindow']>[0]
type RecordSend = Parameters<Commands['recordSend']>[0]
type Stage =
  | { kind: 'acquire' }
  | {
      kind: 'materialization'
      write: Write<Materialization, MaterializationResult>
    }
  | { kind: 'window'; write: Write<Window, Window['expected']> }
  | { kind: 'start'; revision: Window['expected'] }
  | { kind: 'record'; write: Write<RecordSend, RecordSend['expected']>; result: SendStart }
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
  ): Promise<Outcome<T, ModelFailure>> {
    try {
      if (entry.pending) {
        const query = await commands.query({ ...attempt.input, operation: entry.input.operation })
        if ('failure' in query) return query
        if (query.ok.kind === 'unknown')
          return { failure: { kind: 'commit-unknown', operation: entry.input.operation } }
      }
      // Mark before entering a provider: a thrown or disconnected write can have committed.
      entry.pending = true
      const result = await entry.run(entry.input)
      if ('ok' in result) entry.pending = false
      return result
    } catch {
      return { failure: unavailable('model-send', 'write-unconfirmed') }
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
      const resolved = credentials.resolve(
        { id: selection.id, tenant: attempt.input.tenant, purpose: MODEL_SEND },
        { authorized: true, official: selection.scope === 'factory' },
      )
      if (resolved.kind === 'denied')
        return { kind: 'refused', failure: { kind: 'denied', action: 'model-credential' } }
      if (resolved.kind !== 'value')
        return {
          kind: 'refused',
          failure: unavailable('model-credential', `credential-${resolved.kind}`),
        }
      if (resolved.scope !== selection.scope)
        return { kind: 'refused', failure: { kind: 'denied', action: 'credential-scope' } }
      try {
        return {
          kind: 'started',
          facts: resource.startWithCredential(materialized, resolved.value, attempt.signal),
        }
      } catch {
        return { kind: 'unknown', diagnostic: 'transport-start-unknown' }
      }
    } catch {
      return { kind: 'refused', failure: unavailable('model-credential', 'credential-unavailable') }
    }
  }
  async function perform(id: string, attempt: SendAttempt<P>): Promise<SendResult> {
    const input = attempt.input
    try {
      if (attempt.stage.kind === 'acquire') {
        if (attempt.signal.aborted)
          return stop(id, attempt, unavailable('model-send', 'cancelled-before-prepare'))
        const records = await commands.dispatches(input)
        if ('failure' in records) return stop(id, attempt, records.failure)
        const dispatch = records.ok.find(record => record.dispatch === input.dispatch)
        if (!dispatch || dispatch.send !== 'prepared' || dispatch.materialization !== null) {
          attempts.delete(id)
          return unknown(attempt, 'original-send-already-attempted')
        }
        const acquired = await resources.acquire(input)
        if ('failure' in acquired) return stop(id, attempt, acquired.failure)
        attempt.lifetime.resource = acquired.ok
        const prepared = await acquired.ok.transport.prepare(input.request, input.supplier)
        if ('failure' in prepared) return stop(id, attempt, prepared.failure)
        attempt.lifetime.prepared = prepared.ok
        const materialized = await prepared.ok.materialize(attempt.signal)
        if ('failure' in materialized) return stop(id, attempt, materialized.failure)
        attempt.lifetime.materialized = materialized.ok
        const receipt = structuredClone(materialized.ok.receipt)
        if (
          !isDeepStrictEqual(receipt, materialized.ok.receipt) ||
          !isDeepStrictEqual(receipt.supplier, input.supplier.adoption) ||
          !isDeepStrictEqual(receipt.representation, input.request.representation) ||
          !/^[0-9a-f]{64}$/u.test(receipt.payloadDigest)
        )
          return stop(id, attempt, { kind: 'invalid', field: 'receipt', reason: 'binding' })
        attempt.receipt = receipt
        const current = await commands.loadRecovery(input)
        if ('failure' in current) return stop(id, attempt, current.failure)
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
            pending: false,
            run: entry => commands.recordMaterialization(entry),
          },
        }
      }
      if (attempt.stage.kind === 'materialization') {
        const result = await write(attempt, attempt.stage.write)
        if ('failure' in result)
          return unresolved(id, attempt, result.failure, 'materialization-commit-unknown')
        attempt.stage = {
          kind: 'window',
          write: {
            input: {
              ...input.execution,
              operation: operation(),
              expected: result.ok.revision,
              dispatch: input.dispatch,
              window: attempt.window,
            },
            pending: false,
            run: entry => commands.openReceiveWindow(entry),
          },
        }
      }
      if (attempt.stage.kind === 'window') {
        const result = await write(attempt, attempt.stage.write)
        if ('failure' in result)
          return unresolved(id, attempt, result.failure, 'receive-window-commit-unknown')
        attempt.stage = { kind: 'start', revision: result.ok }
      }
      if (attempt.stage.kind === 'start') {
        if (!attempt.receipt) throw new Error('missing receipt')
        const sendOperation = operation()
        let original: SendStart | undefined
        let decision: SendStart
        try {
          const coordinated = coordinator.withinCurrent(
            input,
            attempt.receipt,
            attempt.window,
            selection => {
              original ??= start(attempt, selection)
              return original
            },
          )
          decision = original ?? coordinated
        } catch {
          decision = original ?? {
            kind: 'refused',
            failure: unavailable('model-send', 'qualification-unavailable'),
          }
        }
        attempt.stage = {
          kind: 'record',
          result: decision,
          write: {
            input: {
              ...input.execution,
              operation: sendOperation,
              expected: attempt.stage.revision,
              dispatch: input.dispatch,
              state:
                decision.kind === 'refused'
                  ? 'not-sent'
                  : decision.kind === 'started'
                    ? 'started'
                    : 'unknown',
            },
            pending: false,
            run: entry => commands.recordSend(entry),
          },
        }
      }
      if (attempt.stage.kind === 'record') {
        const { result: decision, write: original } = attempt.stage
        const recorded = await write(attempt, original)
        if ('failure' in recorded) {
          if (
            decision.kind === 'refused' &&
            recorded.failure.kind !== 'commit-unknown' &&
            recorded.failure.kind !== 'unavailable'
          ) {
            try {
              await attempt.lifetime.close()
            } catch {
              return refused(unavailable('model-send', 'resource-release-failed'))
            }
            return refused(decision.failure)
          }
          return unknown(attempt, 'send-record-unconfirmed')
        }
        if (decision.kind === 'refused') return stop(id, attempt, decision.failure)
        if (decision.kind === 'unknown') {
          attempt.stage = { kind: 'unknown', diagnostic: decision.diagnostic }
          try {
            await attempt.lifetime.close()
          } catch {
            return unknown(attempt, 'resource-release-failed')
          }
          return unknown(attempt, decision.diagnostic)
        }
        attempt.stage = { kind: 'handed' }
        return {
          kind: 'started',
          facts: ownedFacts(decision.facts, attempt.lifetime, () => {
            attempts.delete(id)
          }),
        }
      }
      return unknown(
        attempt,
        attempt.stage.kind === 'unknown'
          ? attempt.stage.diagnostic
          : 'original-send-already-attempted',
      )
    } catch {
      // A coordinator exception can occur after calling start. Never retry that stage.
      if (attempt.stage.kind === 'start') {
        attempt.stage = { kind: 'unknown', diagnostic: 'coordinator-start-unconfirmed' }
        try {
          await attempt.lifetime.close()
        } catch {
          return unknown(attempt, 'resource-release-failed')
        }
        return unknown(attempt, 'coordinator-start-unconfirmed')
      }
      if (attempt.stage.kind === 'record') return unknown(attempt, 'send-record-unconfirmed')
      return stop(id, attempt, unavailable('model-send', 'transport-prepare-failed'))
    } finally {
      attempt.busy = false
    }
  }
  function unresolved(
    id: string,
    attempt: SendAttempt<P>,
    failure: ModelFailure,
    diagnostic: string,
  ): Promise<SendResult> | SendResult {
    return failure.kind === 'commit-unknown' || failure.kind === 'unavailable'
      ? unknown(attempt, diagnostic)
      : stop(id, attempt, failure)
  }
  return perform
}
