import type { ControlReceipt, DurableEvidence, ToolControl } from '@omne-harness/tool-contract'
import { decideControl } from '../src/ledger-control.ts'
import type { Decision } from '../src/ledger-decider.ts'
import type { PreparedSynthetic } from '../src/ledger-result-preparation.ts'
import {
  askingAuthor,
  checkpointBinding,
  scriptedBridge,
  type Segment,
} from './checkpoint-values.ts'
import {
  CALL,
  mintOf,
  settle,
  snapshotOfCall,
  type CallSnapshot,
  type Record_,
} from './resumption-decider-values.ts'
import { evidence, operationId, principalA, tenantA, textFactory } from './runtime-values.ts'
import { admitCall, startHarness, testAuthority } from './start-values.ts'

export const STOP_OPERATION = operationId('stop-c1')
export const SUBJECT: DurableEvidence = evidence('control-subject')
export const STOP: ToolControl = { kind: 'stop' }

export function controlCommand(intent: ToolControl, changes: Record_ = {}) {
  return {
    principal: principalA,
    tenant: tenantA,
    call: CALL,
    operation: STOP_OPERATION,
    inputDigest: 'digest-control',
    intent,
    subject: SUBJECT,
    ...changes,
  } as never
}

export function decideStop(
  snapshot: CallSnapshot,
  intent: ToolControl = STOP,
  changes: Record_ = {},
): Decision<ControlReceipt> {
  const command = controlCommand(intent, changes)
  const first = decideControl(snapshot, command, null, mintOf(snapshot))
  if (first.kind !== 'prepare-synthetic') return first
  const { need } = first
  if (!('closedResult' in need)) throw new Error('a stop of a suspended call closes its wait')
  const made = textFactory().text(need.closedResult)
  if ('failure' in made) throw new Error('the text factory of the tests does not fail')
  const { operation, inputDigest } = command as { operation: never; inputDigest: string }
  const prepared = {
    id: operationId('prepared-stop-c1'),
    operation,
    inputDigest,
    need,
    basis: evidence('prepared-stop'),
    policy: null as never,
    state: { kind: 'prepared', value: { ...made.ok, original: { kind: 'none' } } },
  } satisfies PreparedSynthetic
  const second = decideControl(snapshot, command, prepared, mintOf(snapshot))
  if (second.kind === 'prepare-synthetic') throw new Error('the decider asked to prepare twice')
  return second
}

export async function runningCallSnapshot(): Promise<CallSnapshot> {
  const authority = testAuthority()
  const initial = (): Promise<Segment> => new Promise<Segment>(() => {})
  const binding = checkpointBinding(authority, askingAuthor(initial))
  const harness = startHarness({
    authority,
    bindingsPort: () => binding.bindings,
    decisions: scriptedBridge('registers'),
    driverRetryDelayMs: 5,
  })
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  await settle(harness)
  return snapshotOfCall(harness)
}

export async function admittedCallSnapshot(): Promise<CallSnapshot> {
  const authority = testAuthority()
  const binding = checkpointBinding(authority, askingAuthor())
  const harness = startHarness({
    authority,
    bindingsPort: () => binding.bindings,
    decisions: scriptedBridge('registers'),
    driverRetryDelayMs: 5,
  })
  await admitCall(harness, 'c1')
  return snapshotOfCall(harness)
}
