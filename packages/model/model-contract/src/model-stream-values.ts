import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  judgeStreamRef,
  readStreamRef,
  type StreamCallCodec,
  type StreamRef,
  type StreamReferenceFailure,
} from '@omne-harness/stream-arrival'
import type { Snapshot, VisibleBlock } from './call-surface.ts'
import {
  compareOutputCursors,
  compareRevisions,
  decodeDispatchId,
  decodeModelCallId,
  decodeOutputCursor,
  decodeRevision,
} from './identity-values.ts'
import {
  changedStreamBlocks,
  checkStreamBlocks,
  mergeStreamBlocks,
} from './model-stream-values-blocks.ts'
import { copyStreamValue, equalStreamValues } from './model-stream-values-tree.ts'
import { encodeModelInvocationRef, resolveModelInvocationRef } from './reference.ts'
import type { CallState } from './result.ts'
import type { DispatchId, ModelCallId, OutputCursor, Revision } from './root.ts'

export type ModelStreamSnapshot = Readonly<{
  ref: StreamRef
  dispatch: DispatchId
  value: Snapshot
}>
export type ModelStreamBase = Readonly<{ outputCursor: OutputCursor; revision: Revision }>
export type ModelStreamDelta = Readonly<{
  ref: StreamRef
  dispatch: DispatchId
  from: ModelStreamBase
  outputCursor: OutputCursor
  state: CallState
  blocks: readonly VisibleBlock[]
}>
export type ModelStreamProjectionFailure =
  | Readonly<{ kind: 'invalid-tenant' }>
  | Readonly<{
      kind: 'reference'
      side: 'before' | 'after' | 'delta'
      failure: Exclude<StreamReferenceFailure, { kind: 'invalid-tenant' }>
    }>
  | Readonly<{
      kind: 'identity'
      side: 'before' | 'after' | 'delta'
      field: 'dispatch' | 'call' | 'revision' | 'outputCursor'
    }>
  | Readonly<{ kind: 'call-mismatch' }>
  | Readonly<{ kind: 'stream-mismatch' }>
  | Readonly<{ kind: 'dispatch-mismatch' }>
  | Readonly<{ kind: 'base-mismatch' }>
  | Readonly<{ kind: 'revision-regression' }>
  | Readonly<{ kind: 'cursor-regression' }>
  | Readonly<{ kind: 'state-conflict' }>
  | Readonly<{ kind: 'state-transition' }>
  | Readonly<{ kind: 'block-order' }>
  | Readonly<{ kind: 'block-removal' }>
  | Readonly<{ kind: 'block-conflict' }>

type Side = 'before' | 'after' | 'delta'
type Projection = Pick<ModelStreamDelta, 'ref' | 'dispatch' | 'state' | 'outputCursor' | 'blocks'> &
  Readonly<{ call: ModelCallId }>
type Referenced = Projection & Readonly<{ invocationCall: ModelCallId }>
type Failure = ModelStreamProjectionFailure

const modelCallCodec: StreamCallCodec = {
  producer: 'model',
  resolve({ text, tenant }) {
    const resolved = resolveModelInvocationRef(text, tenant)
    if ('failure' in resolved) return { failure: { kind: resolved.failure.kind } }
    const encoded = encodeModelInvocationRef(resolved.ok)
    if ('failure' in encoded) throw new TypeError('Resolved Model invocation could not be encoded')
    return encoded
  },
}

function projection(snapshot: ModelStreamSnapshot): Projection {
  return {
    ref: snapshot.ref,
    dispatch: snapshot.dispatch,
    call: snapshot.value.call,
    outputCursor: snapshot.value.cursor,
    state: snapshot.value.state,
    blocks: snapshot.value.blocks,
  }
}

function referenceFailure(side: Side, failure: StreamReferenceFailure): { failure: Failure } {
  return {
    failure: failure.kind === 'invalid-tenant' ? failure : { kind: 'reference', side, failure },
  }
}

function resolveProjection(
  input: Projection,
  side: Side,
  tenant: TenantId,
): Outcome<Referenced, Failure> {
  const ref = judgeStreamRef({ value: input.ref, tenant }, modelCallCodec)
  if ('failure' in ref) return referenceFailure(side, ref.failure)
  const invocation = resolveModelInvocationRef(readStreamRef(ref.ok).call, tenant)
  if ('failure' in invocation) return referenceFailure(side, { kind: invocation.failure.kind })
  return { ok: { ...input, ref: ref.ok, invocationCall: invocation.ok.call } }
}

function identityFailure(
  input: Projection,
  side: Side,
  from: ModelStreamBase | null,
): Failure | null {
  const state = input.state
  const dispatches =
    state.phase === 'running' || state.phase === 'retry-decision'
      ? [input.dispatch, state.dispatch]
      : [input.dispatch]
  if (dispatches.some(value => 'failure' in decodeDispatchId(value)))
    return { kind: 'identity', side, field: 'dispatch' }
  if ([input.call, state.call].some(value => 'failure' in decodeModelCallId(value)))
    return { kind: 'identity', side, field: 'call' }
  const revisions = from === null ? [state.revision] : [state.revision, from.revision]
  if (revisions.some(value => 'failure' in decodeRevision(value)))
    return { kind: 'identity', side, field: 'revision' }
  const cursors = from === null ? [input.outputCursor] : [input.outputCursor, from.outputCursor]
  if (cursors.some(value => 'failure' in decodeOutputCursor(value)))
    return { kind: 'identity', side, field: 'outputCursor' }
  return null
}

function associationFailure(input: Referenced): Failure | null {
  const state = input.state
  if (input.call !== input.invocationCall || state.call !== input.invocationCall)
    return { kind: 'call-mismatch' }
  if (
    (state.phase === 'running' || state.phase === 'retry-decision') &&
    state.dispatch !== input.dispatch
  )
    return { kind: 'dispatch-mismatch' }
  return state.phase === 'accepted' ? { kind: 'state-transition' } : null
}

function sourceFailure(before: Referenced, after: Referenced): Failure | null {
  const association = associationFailure(before) ?? associationFailure(after)
  if (association) return association
  if (before.ref !== after.ref) return { kind: 'stream-mismatch' }
  if (before.dispatch !== after.dispatch) return { kind: 'dispatch-mismatch' }
  return null
}

function resolvePair(
  tenant: TenantId,
  before: Projection,
  after: Projection,
  side: 'after' | 'delta',
  from: ModelStreamBase | null,
): Outcome<readonly [Referenced, Referenced], Failure> {
  if (!tenantCodec.encode(tenant).ok) return { failure: { kind: 'invalid-tenant' } }
  const left = resolveProjection(before, 'before', tenant)
  if ('failure' in left) return left
  const right = resolveProjection(after, side, tenant)
  if ('failure' in right) return right
  const failure =
    identityFailure(left.ok, 'before', null) ??
    identityFailure(right.ok, side, from) ??
    sourceFailure(left.ok, right.ok)
  return failure ? { failure } : { ok: [left.ok, right.ok] }
}

function progressionFailure(before: Projection, after: Projection): Failure | null {
  const revision = compareRevisions(after.state.revision, before.state.revision)
  const cursor = compareOutputCursors(after.outputCursor, before.outputCursor)
  if (revision < 0) return { kind: 'revision-regression' }
  if (cursor < 0) return { kind: 'cursor-regression' }
  if (revision === 0 && !equalStreamValues(before.state, after.state))
    return { kind: 'state-conflict' }
  if (cursor === 0 && !equalStreamValues(before.blocks, after.blocks))
    return { kind: 'block-conflict' }
  return null
}

function stateFailure(before: CallState, after: CallState): Failure | null {
  if (before.phase === 'settled' && after.phase !== 'settled') return { kind: 'state-transition' }
  if (before.phase === 'retry-decision' && after.phase === 'running')
    return { kind: 'state-transition' }
  if (
    before.phase === 'settled' &&
    after.phase === 'settled' &&
    !equalStreamValues(before.settlement, after.settlement)
  )
    return { kind: 'state-conflict' }
  if (!equalStreamValues(before.consumer, after.consumer)) return { kind: 'state-conflict' }
  return null
}

function targetFailure(
  before: Projection,
  after: Projection,
  delta: readonly VisibleBlock[],
): Failure | null {
  const failure = progressionFailure(before, after) ?? stateFailure(before.state, after.state)
  if (failure) return failure
  const blocks = checkStreamBlocks(before.blocks, after.blocks, delta)
  return blocks === null ? null : { kind: blocks }
}

export function diffModelStream(
  input: Readonly<{
    tenant: TenantId
    before: ModelStreamSnapshot
    after: ModelStreamSnapshot
  }>,
): Outcome<ModelStreamDelta, ModelStreamProjectionFailure> {
  const pair = resolvePair(
    input.tenant,
    projection(input.before),
    projection(input.after),
    'after',
    null,
  )
  if ('failure' in pair) return pair
  const [before, after] = pair.ok
  const failure = targetFailure(before, after, [])
  if (failure) return { failure }
  return {
    ok: copyStreamValue({
      ref: after.ref,
      dispatch: after.dispatch,
      from: { outputCursor: before.outputCursor, revision: before.state.revision },
      outputCursor: after.outputCursor,
      state: after.state,
      blocks: changedStreamBlocks(before.blocks, after.blocks),
    }),
  }
}

export function applyModelStreamDelta(
  input: Readonly<{
    tenant: TenantId
    before: ModelStreamSnapshot
    delta: ModelStreamDelta
  }>,
): Outcome<ModelStreamSnapshot, ModelStreamProjectionFailure> {
  const delta = input.delta
  const pair = resolvePair(
    input.tenant,
    projection(input.before),
    { ...delta, call: delta.state.call },
    'delta',
    delta.from,
  )
  if ('failure' in pair) return pair
  const [before, target] = pair.ok
  if (
    delta.from.outputCursor !== before.outputCursor ||
    delta.from.revision !== before.state.revision
  )
    return { failure: { kind: 'base-mismatch' } }
  const after = { ...target, blocks: mergeStreamBlocks(before.blocks, delta.blocks) }
  const failure = targetFailure(before, after, delta.blocks)
  if (failure) return { failure }
  return {
    ok: copyStreamValue({
      ref: after.ref,
      dispatch: after.dispatch,
      value: {
        call: after.call,
        cursor: after.outputCursor,
        state: after.state,
        blocks: after.blocks,
      },
    }),
  }
}
