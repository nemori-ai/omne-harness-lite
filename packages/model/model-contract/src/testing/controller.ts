import { succeed } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  CallContact,
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
import { validateParts } from './result-pages.ts'
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

export interface ScriptController<P> {
  start(
    input: ScriptedCall &
      Readonly<{ dispatch: DispatchId; firstContent: DispatchRecord['firstContent'] }>,
  ): void
  emit(input: ScriptedCall & Readonly<{ blocks: readonly VisibleBlock[] }>): void
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
  play(input: ScriptedCall & Readonly<{ facts: readonly TransportFact[] }>): void
  expectEvidence(input: ScriptedCall & Readonly<{ evidence: DurableEvidence }>): void
  failDirectory(): void
  recordDispatch(input: ScriptedCall & Readonly<{ record: DispatchRecord }>): void
  advanceControl(
    input: ScriptedCall &
      Readonly<{
        propagation: Extract<ControlState, { kind: 'requested' }>['propagation']
        upstream: Extract<ControlState, { kind: 'requested' }>['upstream']
      }>,
  ): void
  setCleanup(
    input: ScriptedCall &
      Readonly<{
        cleanup: Extract<CustodyState, { kind: 'acknowledged' }>['cleanup']
        diagnostic: string | null
      }>,
  ): void
  setContact(input: ScriptedCall & Readonly<{ answer: CallContact | null }>): void
  withdrawInstance(input: ScriptedCall): void
  replaceInstance(input: ScriptedCall & Readonly<{ instance: ModelInstanceId }>): void
  disconnectObservers(input: ScriptedCall): void
  openObservations(input: ScriptedCall): number
  revokeAccess(
    input: ScriptedCall &
      Readonly<{ principal: P; actions: 'all' | readonly [ScriptedAction, ...ScriptedAction[]] }>,
  ): void
  commitUnknown(
    input: Readonly<{
      tenant: TenantId
      action: WriteAction
      operation: ModelOperationId
      effect: 'applied' | 'dropped'
      query: 'answers' | 'stays-unknown'
    }>,
  ): void
  queryCommit(
    input: CallAccess<P> & Readonly<{ operation: ModelOperationId }>,
  ): Reply<CommitQuery<Readonly<{ revision: Revision }>>>
}

function acceptedCall<P>(core: Core<P>, { tenant, call }: ScriptedCall): CallRecord<P> {
  const record = findCall(core, tenant, call)
  if (record === null)
    throw new ScriptedModelError('unknown-call', `the provider accepted no call ${call}`)
  return record
}

export function createController<P>(core: Core<P>): ScriptController<P> {
  const callOf = (input: ScriptedCall) => acceptedCall(core, input)

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

    setContact(input) {
      callOf(input).contact = structuredClone(input.answer)
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
