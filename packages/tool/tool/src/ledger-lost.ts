import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, Reply, ToolFailure, ToolState } from '@omne-harness/tool-contract'
import type { ToolTask } from '@omne-harness/tool-contract/provider'
import { invalid, judgeEvidenceField, judgeMutationInput, type MutationInput } from './boundary.ts'
import { digestOf } from './evidence.ts'
import { invalidationOperation } from './ledger-control.ts'
import {
  operationRecord,
  put,
  queueTask,
  recall,
  reply,
  settlementWrites,
  syntheticChannels,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import type { ToolLedgerAction } from './ledger-guards.ts'
import type {
  PreparedSynthetic,
  SyntheticDecider,
  SyntheticDecision,
} from './ledger-result-preparation.ts'
import { commonOf, dropSuspensionContent, nextState, type StateBody } from './ledger-start.ts'
import { taskKey, type LedgerWrite } from './ledger-store.ts'

type LostCommand = MutationInput<unknown> &
  Readonly<{ inputDigest: string; continuity: DurableEvidence }>

const LOSABLE: ReadonlySet<string> = new Set(['starting', 'live', 'unknown'])

const SUPERSEDED: ReadonlySet<ToolTask['kind']> = new Set([
  'queue',
  'prepare',
  'start',
  'answer',
  'stop',
  'suspend',
  'settle',
  'facts',
  'fact-ack',
])

const LOST_TERMINAL = {
  kind: 'failed',
  cause: 'runtime-lost',
  diagnostic: 'the execution continuity is lost; the call was not run again',
} as const

const LOST_EFFECT = {
  kind: 'unknown',
  diagnostic: 'lost-execution-effect-unreported',
} as const

function lostTiming(timing: ToolState['timing']): ToolState['timing'] {
  if (timing.kind === 'running')
    return { ...timing, kind: 'unknown', diagnostic: 'execution-end-clock-marker-unavailable' }
  if (timing.kind === 'unknown') return timing
  return { kind: 'closed', accumulatedMs: timing.accumulatedMs }
}

function supersededWrites(snapshot: Snapshot): LedgerWrite[] {
  return snapshot.tasks.flatMap(task =>
    SUPERSEDED.has(task.kind) || (task.kind === 'wait-registration' && task.action === 'ensure')
      ? [{ kind: 'delete', key: taskKey(task) } as const]
      : [],
  )
}

function waitWrites(
  snapshot: Snapshot,
  terminal: DurableEvidence,
): Outcome<LedgerWrite[], ToolFailure> {
  const writes: LedgerWrite[] = []
  for (const wait of snapshot.waits.values()) {
    if (wait.record.phase === 'closed') continue
    const operation = invalidationOperation(wait.record.intent.wait)
    if (operation === null) return invalid('wait', 'no-invalidation-operation')
    writes.push(
      put({
        kind: 'wait',
        wait: {
          ...wait,
          record: {
            intent: wait.record.intent,
            phase: 'closed',
            cause: 'terminal',
            evidence: terminal,
          },
        },
      }),
      put({
        kind: 'task',
        task: {
          kind: 'wait-registration',
          operation,
          state: 'pending',
          diagnostic: null,
          wait: wait.record.intent.wait,
          action: 'invalidate',
          evidence: terminal,
        },
      }),
    )
  }
  return succeed(writes)
}

export function decideSettleLost(
  snapshot: Snapshot,
  command: LostCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ToolState> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'settle-lost')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'settle-lost') return reply(succeed(known.ok.receipt.state))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  if (call.state.phase === 'settled') {
    const settledBy = snapshot.results.get(call.state.result)?.settledBy
    return reply(fail({ kind: 'conflict', operation: settledBy ?? command.operation }))
  }
  if (call.start === null || !LOSABLE.has(call.state.execution.kind))
    return reply(invalid('execution', 'started-execution-required'))
  const { consumer } = call.request
  const made = syntheticChannels(command, { terminal: LOST_TERMINAL, consumer }, prepared)
  if ('kind' in made) return made
  if ('failure' in made) return reply(made)
  const settled = settlementWrites(
    snapshot,
    command,
    consumer,
    LOST_TERMINAL,
    made.ok,
    mint,
    LOST_EFFECT,
  )
  if ('failure' in settled) return reply(settled)
  const { version, delivery } = settled.ok.version
  const current = commonOf(call.state)
  const queue: ToolState['queue'] =
    current.queue.kind === 'held' || current.queue.kind === 'waiting'
      ? { ...current.queue, kind: 'released', evidence: command.continuity }
      : current.queue
  const shared = {
    ...current,
    phase: 'settled',
    wait: { kind: 'none' },
    result: version,
    terminal: LOST_TERMINAL,
    effect: LOST_EFFECT,
    execution: { kind: 'lost', evidence: command.continuity },
    timing: lostTiming(current.timing),
    queue,
    delivery,
  } as const
  const body: StateBody =
    call.state.relation === 'background'
      ? { ...shared, relation: 'background' }
      : { ...shared, relation: 'foreground', foreground: { kind: 'final', result: version } }
  const state = nextState(call, body, mint.revision)
  const waits = waitWrites(snapshot, state.source)
  if ('failure' in waits) return reply(waits)
  const release: LedgerWrite[] =
    call.request.availability.kind === 'available'
      ? [put({ kind: 'task', task: queueTask(command.operation, state.source) })]
      : []
  const clock: LedgerWrite[] =
    state.timing.kind === 'unknown'
      ? [
          put({
            kind: 'task',
            task: {
              kind: 'clock',
              operation: command.operation,
              state: 'blocked',
              diagnostic: state.timing.diagnostic,
              basis: state.source,
            },
          }),
        ]
      : []
  return {
    kind: 'commit',
    value: state,
    writes: [
      put({ kind: 'call', call: { ...call, state } }),
      ...settled.ok.writes,
      ...dropSuspensionContent(snapshot),
      ...supersededWrites(snapshot),
      ...waits.ok,
      put(operationRecord(command, { kind: 'settle-lost', state }, mint)),
      ...release,
      ...clock,
    ],
  }
}

export function settleLostWith<P>(
  ports: Readonly<{
    access(
      context: MutationInput<P>,
      action: ToolLedgerAction,
    ): Promise<Outcome<unknown, ToolFailure>>
    settle(
      context: MutationInput<P>,
      action: ToolLedgerAction,
      inputDigest: string,
      decide: SyntheticDecider<ToolState>,
    ): Reply<ToolState>
  }>,
): (input: unknown) => Reply<ToolState> {
  return async input => {
    const checked = judgeMutationInput<P>(input, 'write')
    if ('failure' in checked) return checked
    const continuity = judgeEvidenceField(Reflect.get(input as object, 'continuity'), 'continuity')
    if ('failure' in continuity) return continuity
    const allowed = await ports.access(checked.ok, 'write')
    if ('failure' in allowed) return allowed
    const fields = { continuity: continuity.ok }
    const command = { ...checked.ok, ...fields, inputDigest: digestOf(fields) }
    return ports.settle(checked.ok, 'write', command.inputDigest, (snapshot, mint, prepared) =>
      decideSettleLost(snapshot, command, prepared, mint),
    )
  }
}
