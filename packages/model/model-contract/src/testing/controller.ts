import { succeed } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ControlState,
  CustodyState,
  DispatchRecord,
  DurableEvidence,
  ResultPart,
  Reply,
  Termination,
  VisibleBlock,
} from '../index.ts'
import type { CommitQuery, TransportFact } from '../provider/index.ts'
import type {
  CallAccess,
  DispatchId,
  ModelCallId,
  ModelInstanceId,
  ModelOperationId,
  ResultVersion,
  Revision,
} from '../root.ts'
import { validateParts, resultPage, encodedBytes } from './result-pages.ts'
import { ScriptedModelError } from './error.ts'
import { applyFact, visibleBlocks } from './reduce.ts'
import { endObservations } from './observation.ts'
import { mintCursor, mintRevision } from './mint.ts'
import {
  commit,
  denied,
  isRevoked,
  notify,
  findCall,
  scopeOf,
  scoped,
  type CallRecord,
  type Core,
  type ScriptedAction,
} from './core.ts'
import { unknownKey, type WriteAction } from './writes.ts'

export type ScriptedCall = Readonly<{ tenant: TenantId; call: ModelCallId }>

/**
 * The hand that drives a scripted provider from the test. The scripted provider does not run
 * a model: the script decides when a call starts, what it shows, how it ends and what goes
 * wrong, and it answers for the result. What the script says is not evidence about a real
 * provider, so a `not-committed` answer is a scripted answer and not an exclusion proof.
 */
export interface ScriptController<P> {
  /** The call begins running on a dispatch. */
  start(
    input: ScriptedCall &
      Readonly<{ dispatch: DispatchId; firstContent: DispatchRecord['firstContent'] }>,
  ): void
  /** The call shows these blocks to its observers; the earlier blocks are replaced. */
  emit(input: ScriptedCall & Readonly<{ blocks: readonly VisibleBlock[] }>): void
  /** The call ends. `parts` are the final result, grouped by pageSize and pageTargetBytes. */
  settle(
    input: ScriptedCall &
      Readonly<{
        version: ResultVersion
        termination: Termination
        parts: readonly ResultPart[]
        source: DurableEvidence
        pageSize: number
        pageTargetBytes: number
      }>,
  ): void
  /**
   * The call receives these upstream facts in order and shows the blocks they build. A fact that
   * the contract forbids is refused, and the facts after it are dropped. Facts and `emit` are two
   * ways to set the blocks: the last one used wins. An `ended`, `account` or `diagnostic` fact is
   * accepted but does not change the blocks or the phase: the call stays running, and only
   * `settle` ends it. Each `play` still commits a new revision and notifies the observers.
   */
  play(input: ScriptedCall & Readonly<{ facts: readonly TransportFact[] }>): void
  /**
   * The evidence that the script gives for acknowledging the call. Once the call has some,
   * `acknowledge` takes only evidence from this set and refuses anything else as `handoff-invalid`.
   */
  expectEvidence(input: ScriptedCall & Readonly<{ evidence: DurableEvidence }>): void
  /** The directory cannot be reached: `connect` answers `unavailable` for every call. */
  failDirectory(): void
  /** Keeps a dispatch of the call, or replaces the one with the same id: a late result or cost. */
  recordDispatch(input: ScriptedCall & Readonly<{ record: DispatchRecord }>): void
  /** Moves the requested control on: how far the cancel travelled and what upstream did. */
  advanceControl(
    input: ScriptedCall &
      Readonly<{
        propagation: Extract<ControlState, { kind: 'requested' }>['propagation']
        upstream: Extract<ControlState, { kind: 'requested' }>['upstream']
      }>,
  ): void
  /** Sets the cleanup state of an acknowledged call. */
  setCleanup(
    input: ScriptedCall &
      Readonly<{
        cleanup: Extract<CustodyState, { kind: 'acknowledged' }>['cleanup']
        diagnostic: string | null
      }>,
  ): void
  /** The instance leaves: observers end as unavailable and `connect` finds no live route. */
  withdrawInstance(input: ScriptedCall): void
  /** Another instance takes over: observers of the old one end as stale-instance. */
  replaceInstance(input: ScriptedCall & Readonly<{ instance: ModelInstanceId }>): void
  /** Every open observation of the call ends as unavailable; the call itself goes on. */
  disconnectObservers(input: ScriptedCall): void
  /** How many observations of the call are open: begun and neither ended nor closed. */
  openObservations(input: ScriptedCall): number
  /** The principal loses the right to these actions on the call, from now on. */
  revokeAccess(
    input: ScriptedCall &
      Readonly<{ principal: P; actions: 'all' | readonly [ScriptedAction, ...ScriptedAction[]] }>,
  ): void
  /**
   * The next `action` with `operation` of `tenant` answers `commit-unknown`. `applied` makes it
   * take effect anyway, `dropped` leaves nothing behind. The same operation sent again then gets
   * the original result or becomes the first acceptance. With `stays-unknown`, `queryCommit` also
   * answers `unknown` until that retry. The script belongs to the tenant: the same operation of
   * another tenant neither uses it up nor settles it.
   */
  commitUnknown(
    input: Readonly<{
      tenant: TenantId
      action: WriteAction
      operation: ModelOperationId
      effect: 'applied' | 'dropped'
      query: 'answers' | 'stays-unknown'
    }>,
  ): void
  /**
   * What the provider would answer when asked whether `operation` was committed. An operation
   * belongs to the call that sent it; asked by another call, or by another tenant, the answer is
   * the one for an operation that was never sent.
   */
  queryCommit(
    input: CallAccess<P> & Readonly<{ operation: ModelOperationId }>,
  ): Reply<CommitQuery<Readonly<{ revision: Revision }>>>
}

export function createController<P>(core: Core<P>): ScriptController<P> {
  function callOf({ tenant, call }: ScriptedCall): CallRecord<P> {
    const record = findCall(core, tenant, call)
    if (record === null)
      throw new ScriptedModelError('unknown-call', `the provider accepted no call ${call}`)
    return record
  }

  function runningCallOf(input: ScriptedCall): CallRecord<P> {
    const record = callOf(input)
    if (record.lifecycle.phase === 'settled')
      throw new ScriptedModelError('invalid-script', `the call ${input.call} already ended`)
    return record
  }

  return {
    start(input) {
      const record = runningCallOf(input)
      record.lifecycle = {
        phase: 'running',
        dispatch: input.dispatch,
        firstContent: input.firstContent,
      }
      commit(record)
    },

    emit(input) {
      const record = runningCallOf(input)
      record.blocks = structuredClone(input.blocks)
      commit(record)
    },

    settle(input) {
      const record = runningCallOf(input)
      const { pageSize, pageTargetBytes, parts: given, version, termination, source } = input
      if (!Number.isSafeInteger(pageSize) || pageSize < 1)
        throw new ScriptedModelError('invalid-script', 'pageSize must be a positive integer')
      if (!Number.isSafeInteger(pageTargetBytes) || pageTargetBytes < 1)
        throw new ScriptedModelError('invalid-script', 'pageTargetBytes must be a positive integer')
      const parts = structuredClone(given)
      validateParts(parts)
      const settlement = structuredClone({
        version,
        termination,
        cursor: mintCursor(record.revision + 1),
        source,
      })
      const size = encodedBytes({ parts, settlement, next: String(Number.MAX_SAFE_INTEGER) })
      if (
        !/^[1-9][0-9]*$/u.test(record.capacity.bytes) ||
        BigInt(size) > BigInt(record.capacity.bytes) ||
        BigInt(parts.length) > BigInt(record.capacity.blocks)
      )
        throw new ScriptedModelError('invalid-script', 'result exceeds the admitted capacity')
      for (let offset = 0; offset < parts.length;) {
        const page = resultPage(parts, offset, pageSize, pageTargetBytes, settlement)
        if (BigInt(encodedBytes(page)) > BigInt(record.capacity.bytes))
          throw new ScriptedModelError(
            'invalid-script',
            'result page exceeds the admitted capacity',
          )
        if (page.next === null) break
        offset = Number(page.next)
      }
      record.revision += 1
      record.lifecycle = {
        phase: 'settled',
        settlement,
        pages: { parts, pageSize, pageTargetBytes },
      }
      notify(record)
    },

    play(input) {
      const record = runningCallOf(input)
      for (const fact of input.facts) if (!applyFact(record.fill, fact)) break
      record.blocks = visibleBlocks(record.fill)
      commit(record)
    },

    expectEvidence(input) {
      callOf(input).evidence.push(structuredClone(input.evidence))
    },

    failDirectory() {
      core.state.directoryDown = true
    },

    recordDispatch(input) {
      const record = callOf(input)
      const entry = structuredClone(input.record)
      const index = record.dispatches.findIndex(known => known.dispatch === entry.dispatch)
      record.dispatches =
        index === -1
          ? [...record.dispatches, entry]
          : record.dispatches.map((known, at) => (at === index ? entry : known))
    },

    advanceControl(input) {
      const record = callOf(input)
      if (record.control.kind !== 'requested')
        throw new ScriptedModelError('invalid-script', `the call ${input.call} has no control`)
      record.control = {
        ...record.control,
        propagation: input.propagation,
        upstream: input.upstream,
      }
      commit(record)
    },

    setCleanup(input) {
      const record = callOf(input)
      if (record.custody.kind !== 'acknowledged')
        throw new ScriptedModelError('invalid-script', `the call ${input.call} is not acknowledged`)
      record.custody = { ...record.custody, cleanup: input.cleanup, diagnostic: input.diagnostic }
      commit(record)
    },

    withdrawInstance(input) {
      const record = callOf(input)
      record.instance = null
      endObservations(record, 'unavailable')
    },

    replaceInstance(input) {
      const record = callOf(input)
      if (record.instance === input.instance)
        throw new ScriptedModelError('invalid-script', 'the instance is already the live one')
      record.instance = input.instance
      endObservations(record, 'stale-instance')
    },

    disconnectObservers(input) {
      endObservations(callOf(input), 'unavailable')
    },

    openObservations(input) {
      return callOf(input).observers.size
    },

    revokeAccess(input) {
      const scope = scopeOf(input.tenant)
      if (scope === null)
        throw new ScriptedModelError('invalid-script', 'the tenant is not a legal identity')
      const key = scoped(scope, input.call)
      core.revocations.set(key, [
        ...(core.revocations.get(key) ?? []),
        { principal: input.principal, actions: input.actions },
      ])
      const record = core.records.get(key)
      if (record !== undefined && (input.actions === 'all' || input.actions.includes('observe')))
        endObservations(record, 'denied', subscription =>
          core.samePrincipal(subscription.principal, input.principal),
        )
    },

    commitUnknown(input) {
      const scope = scopeOf(input.tenant)
      if (scope === null)
        throw new ScriptedModelError('invalid-script', 'the tenant is not a legal identity')
      core.unknownWrites.set(unknownKey(scope, input.action, input.operation), {
        effect: input.effect,
        query: input.query,
      })
    },

    async queryCommit(input) {
      const scope = scopeOf(input.tenant)
      if (scope === null || isRevoked(core, scope, input.call, input.principal, 'query'))
        return denied('query')
      if (core.heldQueries.get(scoped(scope, input.operation)) === input.call)
        return succeed<CommitQuery<Readonly<{ revision: Revision }>>>({ kind: 'unknown' })
      const known = core.operations.get(scoped(scope, input.operation))
      if (known === undefined || known.record.call !== input.call)
        return succeed<CommitQuery<Readonly<{ revision: Revision }>>>({ kind: 'not-committed' })
      return succeed<CommitQuery<Readonly<{ revision: Revision }>>>({
        kind: 'committed',
        value: { revision: mintRevision(known.revision) },
      })
    },
  }
}
