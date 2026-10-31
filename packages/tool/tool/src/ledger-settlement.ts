import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  ToolExecutionRef,
  ToolFailure,
  ToolOperationId,
  ToolState,
} from '@omne-harness/tool-contract'
import type { ToolExecutionFact, ToolTask } from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { mintEvidence, resultVersion } from './evidence.ts'
import {
  firstResultWrites,
  operationRecord,
  put,
  recall,
  reply,
  stateRevision,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import {
  planEnvironmentRelease,
  processCustodyCovered,
  settlementOperation,
} from './ledger-environment-release.ts'
import { sameFactValue } from './ledger-facts.ts'
import type { WriteCommand } from './ledger-start.ts'
import {
  taskKey,
  type CallRecord,
  type CleanupDuty,
  type LedgerWrite,
  type ResultRecord,
  type SavedFact,
} from './ledger-store.ts'

type Final<B extends ContentBlock> = Extract<ToolExecutionFact<B>, { kind: 'final' }>
export type PreserveCommand<B extends ContentBlock> = WriteCommand &
  Readonly<{
    execution: ToolExecutionRef
    final: Final<B>
  }>
type OriginalFinal<B extends ContentBlock> = SavedFact<B> & Readonly<{ fact: Final<B> }>
export type SettlementCheck<B extends ContentBlock> =
  | Readonly<{ kind: 'recalled'; state: ToolState }>
  | Readonly<{
      kind: 'fresh'
      call: CallRecord
      saved: OriginalFinal<B>
      task: Extract<ToolTask, { kind: 'queue' | 'settle' | 'account' | 'facts' | 'clock' }>
      retainOperation: ToolOperationId
    }>

export function checkSettlement<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: PreserveCommand<B>,
): Outcome<SettlementCheck<B>, ToolFailure> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'preserve-result')
  if ('failure' in known) return known
  const call = snapshot.call
  if (call === null) return invalid('call', 'unknown-call')
  if (call.execution === null || !sameFactValue(call.execution, command.execution))
    return invalid('execution', 'not-original-execution')
  if (known.ok !== undefined && known.ok.receipt.kind === 'preserve-result')
    return succeed({ kind: 'recalled', state: known.ok.receipt.state })
  if (stateRevision(snapshot) !== command.expected)
    return fail({ kind: 'stale-revision', current: stateRevision(snapshot) })
  if (call.state.phase === 'settled') {
    const result = snapshot.results.get(call.state.result)
    return fail({ kind: 'conflict', operation: result?.settledBy ?? command.operation })
  }
  if (
    call.state.phase !== 'running' ||
    call.start === null ||
    call.state.execution.kind !== 'live' ||
    !sameFactValue(call.start.execution, command.execution)
  )
    return invalid('execution', 'original-live-start-required')
  const task = snapshot.tasks.find(task => task.kind === 'settle')
  if (task === undefined || task.kind !== 'settle') return invalid('final', 'saved-final-required')
  const saved = [...snapshot.facts.values()].find(saved =>
    sameFactValue(saved.evidence, task.basis),
  )
  if (
    saved === undefined ||
    saved.fact.kind !== 'final' ||
    !sameFactValue(saved.start, call.start) ||
    !sameFactValue(saved.fact, command.final)
  )
    return invalid('final', 'not-original-final')
  if (call.state.relation === 'background' && saved.fact.terminal.kind === 'no-response')
    return invalid('terminal', 'background-no-response')
  return succeed({
    kind: 'fresh',
    call,
    task,
    saved: { ...saved, fact: saved.fact },
    retainOperation: settlementOperation('retain-result', {
      tenant: call.tenant,
      call: call.call,
      settle: task.operation,
      final: saved.evidence,
    }),
  })
}

function settledTiming(current: ToolState['timing']): ToolState['timing'] {
  if (current.kind === 'running')
    return {
      ...current,
      kind: 'unknown',
      diagnostic: 'execution-end-clock-marker-unavailable',
    }
  if (current.kind === 'unknown') return current
  return { kind: 'closed', accumulatedMs: current.accumulatedMs }
}

function settledState<B extends ContentBlock>(
  call: CallRecord,
  final: Final<B>,
  basis: DurableEvidence,
  delivery: ResultRecord<B>['delivery'],
  mint: Mint,
): Outcome<ToolState, ToolFailure> {
  const current = call.state
  const common = {
    call: call.call,
    revision: mint.revision,
    phase: 'settled',
    result: resultVersion(1),
    foreground:
      current.relation === 'foreground'
        ? ({ kind: 'final', result: resultVersion(1) } as const)
        : current.foreground,
    effect: final.effect,
    execution: { kind: 'ended', evidence: basis },
    timing: settledTiming(current.timing),
    controls: current.controls,
    delivery,
    supplements: current.supplements,
    wait: { kind: 'none' },
    queue:
      current.queue.kind === 'held' || current.queue.kind === 'waiting'
        ? ({ ...current.queue, kind: 'released', evidence: basis } as const)
        : current.queue,
  } as const
  const source = mintEvidence('state', { tenant: call.tenant, call: call.call }, mint.revision, {
    ...common,
    relation: current.relation,
    terminal: final.terminal,
  })
  if (current.relation === 'background') {
    if (final.terminal.kind === 'no-response') return invalid('terminal', 'background-no-response')
    return succeed({ ...common, relation: 'background', terminal: final.terminal, source })
  }
  return succeed({ ...common, relation: 'foreground', terminal: final.terminal, source })
}

export function decidePreserveResult<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: PreserveCommand<B>,
  retained: DurableEvidence,
  mint: Mint,
): Decision<ToolState, B> {
  const checked = checkSettlement(snapshot, command)
  if ('failure' in checked) return reply(checked)
  if (checked.ok.kind === 'recalled') return reply(succeed(checked.ok.state))
  const { call, saved, task, retainOperation } = checked.ok
  const final = saved.fact
  const completed = final.terminal.kind === 'completed'
  const covered = completed && processCustodyCovered(snapshot, final.raw, final.result)
  const planned = covered
    ? planEnvironmentRelease(snapshot, call, saved.evidence, retained, mint)
    : succeed(null)
  if ('failure' in planned) return reply(planned)
  const plan = planned.ok
  if (plan !== null && plan.release.operation === command.operation)
    return reply(fail({ kind: 'conflict', operation: command.operation }))
  if (call.environment === null)
    return reply(invalid('environment', 'original-preparation-required'))
  const diagnostic = completed
    ? 'process-output-independent-custody-required'
    : 'non-completed-output-barrier-unconfirmed'
  const cleanup: CleanupDuty =
    plan === null
      ? {
          kind: 'awaiting-independent-custody',
          preparation: call.environment.preparation,
          diagnostic,
        }
      : { kind: 'planned', operation: plan.release.operation }
  const first = firstResultWrites(
    command,
    call.request.consumer,
    final.terminal,
    final.effect,
    final.result,
    {
      kind: 'execution',
      final: saved.evidence,
      raw: final.raw,
      retainOperation,
      retained,
      cleanup,
    },
    mint,
  )
  const state = settledState(call, final, saved.evidence, first.version.delivery, mint)
  if ('failure' in state) return reply(state)
  const writes: LedgerWrite<B>[] = [
    put({ kind: 'call', call: { ...call, state: state.ok } }),
    ...first.writes,
    put(operationRecord(command, { kind: 'preserve-result', state: state.ok }, mint)),
    put({
      kind: 'task',
      task: {
        kind: 'queue',
        operation: command.operation,
        state: 'pending',
        diagnostic: null,
        basis: saved.evidence,
      },
    }),
    ...(plan?.writes ?? []),
  ]
  if (plan === null)
    writes.push(put({ kind: 'task', task: { ...task, state: 'blocked', diagnostic } }))
  else writes.push({ kind: 'delete', key: taskKey(task) })
  if (completed)
    for (const current of snapshot.tasks)
      if (current.kind === 'facts') writes.push({ kind: 'delete', key: taskKey(current) })
  if (state.ok.timing.kind === 'unknown')
    writes.push(
      put({
        kind: 'task',
        task: {
          kind: 'clock',
          operation: task.operation,
          state: 'blocked',
          diagnostic: state.ok.timing.diagnostic,
          basis: saved.evidence,
        },
      }),
    )
  return { kind: 'commit', writes, value: state.ok }
}
