import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  AckInput,
  AckReceipt,
  DurableEvidence,
  ModelConsumption,
  ModelFailure,
  ReadStart,
  ReadState,
  Reply,
  ResultPage,
} from '../index.ts'
import { isDeepStrictEqual } from 'node:util'
import type { CallAccess, Mutation, ReadId, ResultVersion } from '../root.ts'
import {
  commit,
  denied,
  findCall,
  isReserved,
  isRevoked,
  reservedOperation,
  resolve,
  retried,
  scoped,
  type CallRecord,
  type Core,
  type OperationEntry,
  type ReadRecord,
  type SettledLifecycle,
} from './core.ts'
import { resultPage } from './result-pages.ts'
import { mintRead } from './mint.ts'
import { conflictOf, performWrite, remember, sameParameters, writeOf } from './writes.ts'

/** Cuts the page that starts at `offset`; serving the last page makes the read completable. */
function servePage(read: ReadRecord, offset: number): ResultPage {
  const { parts, pageSize, pageTargetBytes } = read.source.pages
  const page = resultPage(parts, offset, pageSize, pageTargetBytes, read.source.settlement)
  if (page.next === null) read.exhausted = true
  else read.issued.add(page.next)
  return structuredClone(page)
}

function endedState(reason: ReadRecord['ended']): ReadState | null {
  return reason === null ? null : { kind: 'ended', reason }
}

/** Whether the remembered operation is this very acknowledgement. */
function sameAcknowledgement<P>(
  known: OperationEntry<P> | undefined,
  parameters: unknown,
): boolean {
  return known !== undefined && sameParameters(known, parameters)
}

/** The evidence that a handoff carries, whether it is the completion or the retained custody. */
function receiptOfHandoff(handoff: AckInput<unknown>['evidence']): DurableEvidence {
  return handoff.kind === 'processed' ? handoff.completion : handoff.custody
}

/** The evidence that is not one of those the script gave for the call; any when it gave none. */
function foreignEvidence<P>(record: CallRecord<P>, receipt: DurableEvidence): ModelFailure | null {
  if (record.evidence.length === 0) return null
  if (record.evidence.some(given => isDeepStrictEqual(given, receipt))) return null
  return {
    kind: 'handoff-invalid',
    reason: 'the evidence is not one that the script gave for the call',
  }
}

/** The settled phase of a call, or the failure that keeps a read or an acknowledgement from it. */
function settledFor<P>(
  record: CallRecord<P>,
  result: ResultVersion,
  mismatch: ModelFailure,
): Outcome<SettledLifecycle, ModelFailure> {
  if (record.lifecycle.phase !== 'settled') return fail({ kind: 'not-settled' })
  if (result !== record.lifecycle.settlement.version) return fail(mismatch)
  return succeed(record.lifecycle)
}

export function createConsumption<P>(core: Core<P>): ModelConsumption<P> {
  /** The read of a call; a revoked principal ends the read as denied the first time it asks. */
  function locate(
    input: CallAccess<P> & Readonly<{ read: ReadId }>,
  ): Outcome<ReadRecord, ModelFailure> {
    const record = findCall(core, input.tenant, input.call)
    if (record === null) return denied('read')
    const read = record.reads.get(input.read)
    if (read === undefined)
      return fail({ kind: 'invalid', field: 'read', reason: 'the call has no such read' })
    if (read.ended === null && isRevoked(core, record.scope, input.call, input.principal, 'read'))
      read.ended = 'denied'
    return succeed(read)
  }

  /** The answer to an operation that began a read before: the same read, or a conflict. */
  function repeatedRead(
    key: string,
    known: OperationEntry<P>,
    input: Mutation<P>,
    parameters: unknown,
  ): Outcome<ReadStart, ModelFailure> {
    const original = core.readsByOperation.get(key)
    if (original === undefined || !isDeepStrictEqual(original.parameters, parameters))
      return conflictOf(input.operation, known.record)
    return succeed({
      kind: 'started',
      read: original.read,
      value: endedState(original.ended) ?? { kind: 'reading', page: servePage(original, 0) },
    })
  }

  async function beginRead(
    input: Mutation<P> & Readonly<{ result: ResultVersion }>,
  ): Reply<ReadStart> {
    if (isReserved(input.operation)) return reservedOperation('operation')
    const target = resolve(core, input, 'read')
    if (target === null || target.record === null) return denied('read')
    const { scope, record } = target
    const key = scoped(scope, input.operation)
    const parameters = { call: input.call, result: input.result }
    const known = core.operations.get(key)
    if (known !== undefined) return repeatedRead(key, known, input, parameters)
    if (record.custody.kind === 'acknowledged')
      return succeed({ kind: 'acknowledged', custody: structuredClone(record.custody) })
    const settled = settledFor(record, input.result, {
      kind: 'invalid',
      field: 'result',
      reason: 'the result version is not the settled one',
    })
    if (!('ok' in settled)) return settled
    const id = mintRead(core.state.reads + 1)
    core.state.reads += 1
    const read: ReadRecord = {
      read: id,
      source: settled.ok,
      parameters,
      ended: null,
      exhausted: false,
      issued: new Set(),
    }
    record.reads.set(read.read, read)
    core.readsByOperation.set(key, read)
    remember(core, scope, input.operation, record, parameters)
    return succeed({
      kind: 'started',
      read: read.read,
      value: { kind: 'reading', page: servePage(read, 0) },
    })
  }

  async function readNext(
    input: CallAccess<P> & Readonly<{ read: ReadId; after: string }>,
  ): Reply<ReadState> {
    const located = locate(input)
    if (!('ok' in located)) return located
    const read = located.ok
    const finished = endedState(read.ended)
    if (finished !== null) return succeed(finished)
    if (!read.issued.has(input.after))
      return fail({ kind: 'invalid', field: 'after', reason: 'no page of this read ends there' })
    return succeed({ kind: 'reading', page: servePage(read, Number(input.after)) })
  }

  async function closeRead(input: CallAccess<P> & Readonly<{ read: ReadId }>): Reply<ReadState> {
    const located = locate(input)
    if (!('ok' in located)) return located
    const read = located.ok
    read.ended ??= read.exhausted ? 'complete' : 'closed'
    return succeed({ kind: 'ended', reason: read.ended })
  }

  async function acknowledge(input: AckInput<P>): Reply<AckReceipt> {
    if (isReserved(input.operation)) return reservedOperation('operation')
    const target = resolve(core, input, 'acknowledge')
    if (target === null || target.record === null) return denied('acknowledge')
    const { scope, record } = target
    retried(core, scope, input.operation, input.call)
    const parameters = {
      call: input.call,
      result: input.result,
      evidence: input.evidence,
    }
    const known = core.operations.get(scoped(scope, input.operation))
    const receiptOf = (custody: AckReceipt['custody']): AckReceipt =>
      structuredClone({ call: input.call, result: input.result, custody })
    if (record.custody.kind === 'acknowledged')
      return sameAcknowledgement(known, parameters)
        ? succeed(receiptOf(record.custody))
        : conflictOf(record.custody.operation, record)
    if (known !== undefined) return conflictOf(input.operation, known.record)
    const settled = settledFor(record, input.result, {
      kind: 'handoff-invalid',
      reason: 'the result version is not the settled one',
    })
    if (!('ok' in settled)) return settled
    const receipt = receiptOfHandoff(input.evidence)
    const foreign = foreignEvidence(record, receipt)
    if (foreign !== null) return fail(foreign)
    return performWrite(core, writeOf(scope, 'acknowledge', input), (): AckReceipt => {
      const custody = {
        kind: 'acknowledged' as const,
        operation: input.operation,
        receipt,
        cleanup: 'pending' as const,
        diagnostic: null,
      }
      record.custody = custody
      commit(record)
      remember(core, scope, input.operation, record, parameters)
      return receiptOf(custody)
    })
  }

  return { beginRead, readNext, closeRead, acknowledge }
}
