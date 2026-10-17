import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
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
  ModelFault,
  Reply,
  Settlement,
  Termination,
} from '@omne-harness/model-contract'
import {
  call,
  cursor,
  dispatch,
  evidence,
  instance,
  consumer,
  operation,
  result,
  revision,
  tenant,
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
