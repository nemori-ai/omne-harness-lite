import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import type { ToolCallPart } from '@omne-harness/message'
import type {
  AckInput,
  AckReceipt,
  Admission,
  CallState,
  ControlState,
  CustodyState,
  DurableEvidence,
  Handoff,
  Lookup,
  ModelFailure,
  ModelBlock,
  ModelFault,
  ModelFaultCause,
  OverLimitMetric,
  Reply,
  Settlement,
  Termination,
  ToolSuggestion,
} from '@omne-harness/model-contract'
import {
  block,
  call,
  cursor,
  dispatch,
  evidence,
  incompleteCall,
  instance,
  consumer,
  operation,
  reasoningState,
  result,
  revision,
  tenant,
  toolCall,
  toolResult,
  unparsedCall,
} from './values.ts'

const fault: ModelFault = { cause: 'stream-lost', diagnostic: 'd', upstreamStatus: null }
const settlement: Settlement = {
  version: result,
  termination: { kind: 'completed', reason: 'stop' },
  cursor,
  source: evidence,
}
const acknowledged: Extract<CustodyState, { kind: 'acknowledged' }> = {
  kind: 'acknowledged',
  operation,
  receipt: evidence,
  cleanup: 'pending',
  diagnostic: null,
}

it('Reply wraps an Outcome whose failure is the closed ModelFailure', () => {
  expectTypeOf<Reply<number>>().toEqualTypeOf<Promise<Outcome<number, ModelFailure>>>()
})

it('ModelFailure is a closed union that names its own facts', () => {
  const failures: ModelFailure[] = [
    { kind: 'denied', action: 'admit' },
    { kind: 'invalid', field: 'operation', reason: 'reserved' },
    { kind: 'conflict', operation, revision },
    { kind: 'unavailable', dependency: 'consumer-work-guard', diagnostic: 'd' },
    { kind: 'commit-unknown', operation },
    { kind: 'stale-instance', instance },
    { kind: 'not-settled' },
    { kind: 'handoff-invalid', reason: 'r' },
  ]
  // @ts-expect-error a conflict names the operation and the revision
  const conflict: ModelFailure = { kind: 'conflict', operation }
  // @ts-expect-error an unlisted kind
  const other: ModelFailure = { kind: 'timeout' }
  void [failures, conflict, other]
})

it('ModelFault, Termination and Settlement describe the single end of a call', () => {
  const ends: Termination[] = [
    { kind: 'completed', reason: 'tool-suggestions' },
    { kind: 'failed', fault },
    { kind: 'interrupted', control: operation },
  ]
  // @ts-expect-error an unlisted fault cause
  const cause: ModelFault = { ...fault, cause: 'timeout' }
  // @ts-expect-error an interruption names its control operation
  const noControl: Termination = { kind: 'interrupted' }
  void [ends, settlement, cause, noControl]
})

it('an input-over-limit fault reports only what the upstream gave, and no other cause carries a report', () => {
  const given: ModelFault = {
    cause: 'input-over-limit',
    diagnostic: 'd',
    upstreamStatus: '400',
    reported: { metric: 'context-tokens', limit: '1000', actual: '1200' },
  }
  const silent: ModelFault = {
    cause: 'input-over-limit',
    diagnostic: 'd',
    upstreamStatus: null,
    reported: { metric: null, limit: null, actual: null },
  }
  const carriedOverLimit: ModelFault = { ...given, replayCarried: true }
  // @ts-expect-error a send without reasoning state has no replayCarried key
  const deniedOverLimit: ModelFault = { ...given, replayCarried: false }
  const byMeter: ModelFault = {
    ...given,
    reported: { metric: 'image-bytes', limit: '1', actual: '2' },
  }
  // @ts-expect-error an input-over-limit fault must carry the report, with null for what is unknown
  const noReport: ModelFault = { cause: 'input-over-limit', diagnostic: 'd', upstreamStatus: null }
  // @ts-expect-error an unlisted metric
  const metric: ModelFault = { ...given, reported: { metric: 'gpu', limit: null, actual: null } }
  // @ts-expect-error a number is not an upstream figure: figures are decimal text
  const numeric: ModelFault = { ...given, reported: { metric: null, limit: 1000, actual: null } }
  // @ts-expect-error another cause has nothing to report
  const stray: ModelFault = { ...fault, reported: given.reported }
  expectTypeOf<ModelFaultCause>().toEqualTypeOf<ModelFault['cause']>()
  expectTypeOf<OverLimitMetric>().toExtend<string>()
  void [silent, carriedOverLimit, deniedOverLimit, byMeter, noReport, metric, numeric, stray]
})

it('CallState keeps the phase apart from control and custody', () => {
  const base = {
    call,
    revision,
    consumer,
    control: { kind: 'none' },
    custody: { kind: 'producer' },
  } as const
  const states: CallState[] = [
    { ...base, phase: 'accepted' },
    { ...base, phase: 'running', dispatch, firstContent: 'none-proven' },
    { ...base, phase: 'retry-decision', dispatch },
    { ...base, phase: 'settled', settlement },
  ]
  // @ts-expect-error a cancelled phase does not exist: control is a separate fact
  const cancelled: CallState = { ...base, phase: 'cancelled' }
  // @ts-expect-error a running call names its dispatch
  const noDispatch: CallState = { ...base, phase: 'running', firstContent: 'observed' }
  void [states, cancelled, noDispatch]
})

it('ControlState and CustodyState record intent and handover as separate states', () => {
  const none: ControlState = { kind: 'none' }
  const requested: ControlState = {
    kind: 'requested',
    operation,
    propagation: 'pending',
    upstream: 'unknown',
  }
  const custody: CustodyState[] = [{ kind: 'producer' }, acknowledged]
  // @ts-expect-error a requested control is not a bare flag
  const flag: ControlState = { kind: 'requested' }
  void [none, requested, custody, flag]
})

it('Lookup, Admission and DurableEvidence connect the lookup and the evidence', () => {
  const base: CallState = {
    call,
    revision,
    consumer,
    control: { kind: 'none' },
    custody: { kind: 'producer' },
    phase: 'accepted',
  }
  const found: Lookup = { kind: 'found', state: base }
  const absent: Lookup = { kind: 'not-accepted', operation }
  const admission: Admission = { call, revision, recovered: false }
  const durable: DurableEvidence = evidence
  void [found, absent, admission, durable]
})

it('Handoff and AckInput carry evidence, never a bare saved flag', () => {
  const processed: Handoff = { kind: 'processed', completion: evidence }
  const retained: Handoff = { kind: 'retained', custody: evidence }
  const input: AckInput<string> = {
    principal: 'p',
    tenant,
    call,
    operation,
    result,
    evidence: processed,
  }
  const saved: AckInput<string> = {
    principal: 'p',
    tenant,
    call,
    operation,
    result,
    // @ts-expect-error a boolean is not evidence
    evidence: { saved: true },
  }
  void [retained, input, saved]
  expectTypeOf<AckReceipt['custody']>().toEqualTypeOf<
    Extract<CustodyState, { kind: 'acknowledged' }>
  >()
  const receipt: AckReceipt = { call, result, custody: acknowledged }
  void receipt
})

it('ToolSuggestion is the shared whole tool call and nothing of its own', () => {
  expectTypeOf<ToolSuggestion>().toEqualTypeOf<ToolCallPart>()
})

it('replay-rejected is a fault cause that always says the send carried reasoning state', () => {
  const rejected: ModelFault = {
    cause: 'replay-rejected',
    diagnostic: 'd',
    upstreamStatus: '400',
    replayCarried: true,
  }
  // @ts-expect-error a replay-rejected send carried reasoning state, so the key is required
  const silent: ModelFault = { cause: 'replay-rejected', diagnostic: 'd', upstreamStatus: '400' }
  const cause: ModelFaultCause = 'replay-rejected'
  void [rejected, silent, cause]
})

it('replayCarried is true or absent, never false', () => {
  const carried: ModelFault = {
    cause: 'input-rejected',
    diagnostic: 'd',
    upstreamStatus: '400',
    replayCarried: true,
  }
  const plain: ModelFault = { cause: 'input-rejected', diagnostic: 'd', upstreamStatus: '400' }
  const denied: ModelFault = {
    cause: 'input-rejected',
    diagnostic: 'd',
    upstreamStatus: '400',
    // @ts-expect-error a send without reasoning state has no replayCarried key
    replayCarried: false,
  }
  void [carried, plain, denied]
})

it('ModelBlock holds a content block or a whole call, never a call without whole arguments', () => {
  const blocks: ModelBlock[] = [block, toolCall, reasoningState]
  // @ts-expect-error a call whose arguments did not all arrive is not a suggestion
  const incomplete: ModelBlock = incompleteCall
  // @ts-expect-error a call whose arguments do not decode is not a suggestion
  const unparsed: ModelBlock = unparsedCall
  // @ts-expect-error the result marker belongs to a tool message, not to model output
  const marker: ModelBlock = toolResult
  void [blocks, incomplete, unparsed, marker]
})
