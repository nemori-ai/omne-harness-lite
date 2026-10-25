import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  DurableEvidence,
  RawOutput,
  ToolOperationId,
  ToolFailure,
  ToolResult,
} from '@omne-harness/tool-contract'
import type {
  PreparationRecord,
  ReleaseRecord,
  ReleaseProgress,
  ToolTask,
} from '@omne-harness/tool-contract/provider'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { invalid, type MutationInput } from './boundary.ts'
import { digestOf, mintEvidence } from './evidence.ts'
import {
  operationRecord,
  put,
  recall,
  reply,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import { taskKey, type CallRecord, type LedgerWrite } from './ledger-store.ts'
import { releaseBasisOf } from './ledger-start.ts'

/** Domain-separated digests fit even when a provider's original operation is at its size limit. */
export function settlementOperation(
  purpose: 'retain-result' | 'release-environment',
  place: unknown,
): ToolOperationId {
  const decoded = decodeToolOperationId(`${purpose}:${digestOf(place)}`)
  if ('failure' in decoded) throw new Error('invalid internal settlement operation')
  return decoded.ok
}

/** Immutable event history includes references replaced in the current process projection. */
export function processCustodyCovered<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  raw: RawOutput,
  value: ToolResult<B>,
): boolean {
  const retained = [raw.content, ...value.attachments]
  return [...snapshot.facts.values()].every(
    saved =>
      saved.fact.kind !== 'process' ||
      saved.fact.blocks.every(({ content }) => {
        if ('ref' in content) return retained.some(ref => sameFactValue(ref, content.ref))
        return content.kind !== 'file'
      }),
  )
}

export function releaseIntent(preparation: PreparationRecord, custody: DurableEvidence) {
  return { preparation, custody }
}

/** Both automatic and public planning use this canonical record and write set. */
export function planEnvironmentRelease<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  call: CallRecord,
  final: DurableEvidence,
  custody: DurableEvidence,
  mint: Mint,
): Outcome<
  Readonly<{ release: ReleaseRecord; writes: readonly LedgerWrite<B>[] }> | null,
  ToolFailure
> {
  const environment = call.environment
  if (environment === null) return succeed(null)
  const preparation = call.preparations.find(item => item.operation === environment.preparation)
  if (preparation === undefined) return succeed(null)
  const known = snapshot.releases.get(preparation.operation)
  if (known !== undefined) return succeed({ release: known.release, writes: [] })
  const operation = settlementOperation('release-environment', {
    tenant: call.tenant,
    call: call.call,
    preparation: preparation.operation,
    final,
  })
  const inputDigest = digestOf(releaseIntent(preparation, custody))
  const operationReceipt = recall(snapshot, operation, inputDigest, 'plan-release')
  if ('failure' in operationReceipt) return operationReceipt
  const release: ReleaseRecord = {
    tenant: call.tenant,
    call: call.call,
    operation,
    adoption: preparation.adoption,
    inputDigest,
    preparation: preparation.operation,
    resource: environment.resources,
    custody,
  }
  return succeed({
    release,
    writes: [
      put({
        kind: 'environment-release',
        environmentRelease: {
          release,
          progress: { kind: 'pending', diagnostic: 'environment-release-pending' },
        },
      }),
      put({
        kind: 'task',
        task: {
          kind: 'release',
          operation,
          state: 'pending',
          diagnostic: null,
          release,
        },
      }),
      put(operationRecord({ ...release, inputDigest }, { kind: 'plan-release', release }, mint)),
    ],
  })
}

type CleanupCommand = MutationInput<unknown> & Readonly<{ inputDigest: string }>
export type PlanReleaseCommand = CleanupCommand &
  Readonly<{ preparation: unknown; custody: DurableEvidence }>
export type RecordReleaseCommand = CleanupCommand &
  Readonly<{ release: unknown; outcome: ReleaseProgress }>
export type RecordTaskCommand = CleanupCommand & Readonly<{ task: unknown; resolution: unknown }>

function revisedCall<B extends ContentBlock>(call: CallRecord, mint: Mint): LedgerWrite<B> {
  const { source: _source, ...body } = call.state
  const state = { ...body, revision: mint.revision }
  return put({
    kind: 'call',
    call: {
      ...call,
      state: {
        ...state,
        source: mintEvidence(
          'state',
          { tenant: call.tenant, call: call.call },
          mint.revision,
          state,
        ),
      },
    },
  })
}

export function decidePlanRelease<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: PlanReleaseCommand,
  mint: Mint,
  unsupported: Outcome<never, ToolFailure>,
): Decision<ReleaseRecord, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'plan-release')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'plan-release') return reply(succeed(known.ok.receipt.release))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  const preparation = call.preparations.find(item => sameFactValue(item, command.preparation))
  if (preparation === undefined || call.environment?.preparation !== preparation.operation)
    return reply(invalid('preparation', 'not-original-preparation'))
  const basis = releaseBasisOf(snapshot)
  if (basis?.kind !== 'physical-end' || call.state.phase !== 'settled')
    return reply(invalid('execution', 'original-ended-execution-required'))
  const result = snapshot.results.get(call.state.result)
  if (
    result?.custody.kind !== 'execution' ||
    !sameFactValue(result.custody.retained, command.custody)
  )
    return reply(invalid('custody', 'not-original-result-custody'))
  if (
    result.terminal.kind !== 'completed' ||
    !processCustodyCovered(snapshot, result.custody.raw, result.value)
  )
    return reply(unsupported)
  const planned = planEnvironmentRelease(snapshot, call, basis.proof, command.custody, mint)
  if ('failure' in planned) return reply(planned)
  if (planned.ok === null) return reply(invalid('preparation', 'not-original-preparation'))
  const { release, writes } = planned.ok
  if (
    !sameFactValue(release.resource, call.environment.resources) ||
    !sameFactValue(release.custody, command.custody)
  )
    return reply(invalid('release', 'not-original-release'))
  return {
    kind: 'commit',
    value: release,
    writes: [
      ...writes,
      ...(release.operation === command.operation
        ? []
        : [put<B>(operationRecord(command, { kind: 'plan-release', release }, mint))]),
      revisedCall(call, mint),
    ],
  }
}

export function checkRelease<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: RecordReleaseCommand,
): Outcome<
  | Readonly<{ kind: 'recalled'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'fresh'; release: ReleaseRecord; progress: ReleaseProgress }>,
  ToolFailure
> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'record-release')
  if ('failure' in known) return known
  if (known.ok?.receipt.kind === 'record-release')
    return succeed({ kind: 'recalled', evidence: known.ok.receipt.evidence })
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  const original = [...snapshot.releases.values()].find(item =>
    sameFactValue(item.release, command.release),
  )
  if (original === undefined) return invalid('release', 'not-original-release')
  if (
    original.progress.kind === 'released' &&
    command.outcome.kind === 'released' &&
    !sameFactValue(original.progress.evidence, command.outcome.evidence)
  )
    return fail({ kind: 'conflict', operation: original.release.operation })
  return succeed({ kind: 'fresh', ...original })
}

export function decideRecordRelease<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: RecordReleaseCommand,
  mint: Mint,
): Decision<DurableEvidence, B> {
  const checked = checkRelease(snapshot, command)
  if ('failure' in checked) return reply(checked)
  if (checked.ok.kind === 'recalled') return reply(succeed(checked.ok.evidence))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  const { release } = checked.ok
  const progress = checked.ok.progress.kind === 'released' ? checked.ok.progress : command.outcome
  const evidence = mintEvidence(
    'operation',
    { tenant: call.tenant, call: call.call, operation: command.operation },
    mint.revision,
    { release, progress },
  )
  const task: ToolTask = {
    kind: 'release',
    operation: release.operation,
    release,
    state: progress.kind === 'rejected' ? 'blocked' : 'pending',
    diagnostic: progress.kind === 'released' ? null : progress.diagnostic,
  }
  return {
    kind: 'commit',
    value: evidence,
    writes: [
      put({ kind: 'environment-release', environmentRelease: { release, progress } }),
      progress.kind === 'released'
        ? { kind: 'delete', key: taskKey(task) }
        : put({ kind: 'task', task }),
      put(operationRecord(command, { kind: 'record-release', evidence }, mint)),
      revisedCall(call, mint),
    ],
  }
}

export function decideRecordFactsTask<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: RecordTaskCommand,
  mint: Mint,
  unsupported: Outcome<never, ToolFailure>,
): Decision<DurableEvidence, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'record-task')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'record-task') return reply(succeed(known.ok.receipt.evidence))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  const task = snapshot.tasks.find(item => sameFactValue(item, command.task))
  const resolution = command.resolution
  if (
    task?.kind !== 'facts' ||
    typeof resolution !== 'object' ||
    resolution === null ||
    !('kind' in resolution) ||
    resolution.kind !== 'blocked'
  )
    return reply(unsupported)
  if (
    !('reason' in resolution) ||
    (resolution.reason !== 'settled-facts-source-ended' &&
      resolution.reason !== 'settled-facts-source-unavailable') ||
    Object.keys(resolution).length !== 2
  )
    return reply(invalid('resolution', 'settled-facts-diagnostic-required'))
  if (
    call.state.phase !== 'settled' ||
    call.state.terminal.kind === 'completed' ||
    releaseBasisOf(snapshot)?.kind !== 'physical-end'
  )
    return reply(invalid('task', 'non-completed-settled-facts-required'))
  const evidence = mintEvidence(
    'operation',
    { tenant: call.tenant, call: call.call, operation: command.operation },
    mint.revision,
    { task, resolution },
  )
  return {
    kind: 'commit',
    value: evidence,
    writes: [
      put({ kind: 'task', task: { ...task, state: 'blocked', diagnostic: resolution.reason } }),
      put(operationRecord(command, { kind: 'record-task', evidence }, mint)),
      revisedCall(call, mint),
    ],
  }
}
