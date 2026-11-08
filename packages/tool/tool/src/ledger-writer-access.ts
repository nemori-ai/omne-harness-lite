import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Reply, ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import type {
  ToolBodyWriteFailure,
  ToolBodyWriteReply,
  ToolBodyFrame,
} from '@omne-harness/tool-contract/provider'
import { judgeEvidenceField, judgeMutationInput, invalid, type CallInput } from './boundary.ts'
import { fixCleanupFields } from './cleanup-boundary.ts'
import type { ToolLedgerConfiguration, ToolLedgerPorts } from './construction.ts'
import { reply, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import type { LedgerDomain } from './ledger-store.ts'
import {
  originalStart,
  reject,
  type WriterAnswer,
  type WriterDecision,
  type WriterInput,
} from './ledger-writer-decisions.ts'

export type WriterPorts<P> = Readonly<{
  materials: ToolLedgerPorts<P>['materials']
  configuration: ToolLedgerConfiguration
  entry(input: unknown, action: 'write'): Reply<CallInput<P>>
  load(input: CallInput<P>): Reply<Snapshot>
  transact<T>(
    domain: LedgerDomain,
    operation: ToolOperationId,
    decide: (snapshot: Snapshot, mint: Mint) => Promise<Decision<T>> | Decision<T>,
    unknown: Outcome<T, ToolFailure>,
  ): Reply<T>
}>

function primitive(failure: ToolFailure, operation: string): ToolBodyWriteFailure {
  switch (failure.kind) {
    case 'denied':
      return failure
    case 'invalid':
      return { kind: 'invalid', reason: `${failure.field}: ${failure.reason}` }
    case 'conflict':
      return { kind: 'conflict', reason: 'operation conflicts with retained input' }
    case 'commit-unknown':
      return {
        kind: 'unknown',
        operation: failure.operation,
        reason: 'writer commit outcome is unknown',
      }
    case 'unavailable':
      return {
        kind: 'unavailable',
        operation,
        reason: `${failure.dependency}: ${failure.diagnostic}`,
      }
    case 'unsupported':
      return { kind: 'unsupported', reason: failure.reason }
    case 'not-found':
      return { kind: 'invalid', reason: `${failure.target}: ${failure.reason}` }
    case 'invalid-cursor':
      return { kind: 'invalid', reason: failure.reason }
    case 'not-settled':
      return { kind: 'busy', reason: 'operation has not settled' }
    case 'stale-instance':
    case 'stale-revision':
      return { kind: 'closed', reason: 'writer execution is stale' }
  }
}
export function fromReply(
  answer: Readonly<{ failure: ToolFailure }>,
  operation: string,
): Readonly<{ failure: ToolBodyWriteFailure }>
export function fromReply<T>(
  answer: Outcome<T, ToolFailure>,
  operation: string,
): Outcome<T, ToolBodyWriteFailure>
export function fromReply<T>(
  answer: Outcome<T, ToolFailure>,
  operation: string,
): Outcome<T, ToolBodyWriteFailure> {
  return 'failure' in answer ? fail(primitive(answer.failure, operation)) : answer
}
export function textFrame(
  value: unknown,
): Outcome<Extract<ToolBodyFrame, { kind: 'text' }>, ToolFailure> {
  const fixed = fixCleanupFields(value, ['kind', 'block', 'text', 'end'])
  if ('failure' in fixed) return fixed
  const f = fixed.ok
  if (
    f.kind !== 'text' ||
    typeof f.block !== 'string' ||
    f.block.length === 0 ||
    typeof f.text !== 'string' ||
    !f.text.isWellFormed() ||
    typeof f.end !== 'boolean'
  )
    return invalid('frame', 'valid text frame required')
  return succeed({ kind: 'text', block: f.block, text: f.text, end: f.end })
}
export function sequence(value: unknown, empty: boolean): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && (empty || value !== '0')
}

export function createWriterAccess<P>(ports: WriterPorts<P>) {
  const bind = async (
    supplied: unknown,
    fields: readonly string[],
    keyed = true,
  ): ToolBodyWriteReply<
    Readonly<{ input: WriterInput<P>; fields: Readonly<Record<string, unknown>> }>
  > => {
    const context = judgeMutationInput<P>(supplied, 'write')
    if ('failure' in context) return fromReply(context, 'unadmitted')
    const fixed = fixCleanupFields(supplied, [
      'start',
      'source',
      ...(keyed ? ['key'] : []),
      ...fields,
    ])
    if ('failure' in fixed) return fromReply(fixed, context.ok.operation)
    const source = judgeEvidenceField(fixed.ok.source, 'source')
    if ('failure' in source) return fromReply(source, context.ok.operation)
    if (keyed && (typeof fixed.ok.key !== 'string' || fixed.ok.key.length === 0))
      return fail({ kind: 'invalid', reason: 'nonempty writer key required' } as const)
    const allowed = await ports.entry(context.ok, 'write')
    if ('failure' in allowed) return fromReply(allowed, context.ok.operation)
    const loaded = await ports.load(context.ok)
    if ('failure' in loaded) return fromReply(loaded, context.ok.operation)
    const start = originalStart(loaded.ok, fixed.ok.start)
    if (start === null) return fail({ kind: 'invalid', reason: 'original start required' } as const)
    const input: WriterInput<P> = {
      ...context.ok,
      source: source.ok,
      start,
      key: typeof fixed.ok.key === 'string' ? fixed.ok.key : '',
    }
    return succeed({ input, fields: fixed.ok })
  }
  const transact = async <T>(
    input: WriterInput<P>,
    decide: (snapshot: Snapshot, mint: Mint) => WriterDecision<T>,
  ): ToolBodyWriteReply<T> => {
    const answer = await ports.transact<WriterAnswer<T>>(
      { kind: 'call', tenant: input.tenant, call: input.call },
      input.operation,
      async (snapshot, mint) => {
        const allowed = await ports.entry(input, 'write')
        if ('failure' in allowed) return reply(allowed)
        if (originalStart(snapshot, input.start) === null)
          return reject('invalid', 'original start required')
        return decide(snapshot, mint)
      },
      fail({ kind: 'commit-unknown', operation: input.operation }),
    )
    if ('failure' in answer) return fail(primitive(answer.failure, input.operation))
    const current = await ports.entry(input, 'write')
    return 'failure' in current ? fail(primitive(current.failure, input.operation)) : answer.ok
  }
  return { bind, transact }
}

export type WriterMutation<P> = ReturnType<typeof createWriterAccess<P>>['transact']
