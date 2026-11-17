import { tenantEquals } from '@omne-harness/legal-identity'
import { judgeCompaction, judgeMessage } from '@omne-harness/message'
import { entries, invalid, originOf, rejected, sourceOf } from './decision-support.ts'
import { decodeEntries, encodeEntry, SESSION_INTERPRETER } from './entries.ts'
import { sameInitializationValue } from './initialization-plan.ts'
import { judgeAdvance, type CommittedBatch, type DecideReads, type Decision } from './judgments.ts'
import type { SessionCommand } from './ports.ts'
import { applyParticipation } from './result-state.ts'
import { batchEvidence } from './reduce.ts'
import {
  annotationTargets,
  evidenceFields,
  SessionValidationFailure,
} from './session-validation.ts'
import type { RunExecution, WorkSnapshot } from './values.ts'

export type CompactionCommitState = Pick<
  WorkSnapshot,
  'tenant' | 'session' | 'lifecycle' | 'run' | 'revision' | 'source' | 'interpreter'
>

export function decideCompactionCommit(
  state: CompactionCommitState,
  command: Extract<SessionCommand, { kind: 'commitDerived' }>,
  reads: Pick<DecideReads, 'compaction' | 'compactionEpoch'>,
  protectedEntries: readonly string[],
): Decision {
  const { input } = command
  if (state.session !== input.session || !tenantEquals(state.tenant, input.tenant))
    return rejected({ kind: 'denied', action: command.kind })
  if (input.value.kind !== 'compaction') return invalid('value', 'not a compaction')
  if (input.participation === undefined || input.judgment === undefined)
    return invalid('participation', 'context transition materials are required')
  const judgment = judgeAdvance(state, {
    kind: 'participation',
    execution: input.participation.execution,
    joint: input.participation.joint,
  })
  if (judgment.kind !== 'ok') return rejected(judgment)
  if (input.participation.joint !== 'context-transition')
    return invalid('participation', 'not a context transition')
  if (reads.compactionEpoch === undefined)
    return rejected({
      kind: 'unavailable',
      owner: 'session-history',
      diagnostic: 'the current compaction epoch is missing',
    })
  if (input.value.epoch !== reads.compactionEpoch)
    return rejected({ kind: 'changed', revision: state.revision })
  if (reads.compaction === null)
    return rejected({
      kind: 'unavailable',
      owner: 'session-history',
      diagnostic: 'compaction transaction reads are missing',
    })
  if (protectedEntries.some(ref => !reads.compaction?.open.some(entry => String(entry) === ref)))
    return invalid('reads.compaction.open', 'missing original unclosed work reference')
  const compact = judgeCompaction(input.value.message, reads.compaction)
  if ('rejected' in compact) return invalid('value.message', compact.rejected)
  const origin = originOf(sourceOf(input.operation, 'derived'))
  return entries([
    encodeEntry(
      {
        kind: 'message.compaction',
        message: input.value.message,
        source: input.judgment,
        admission: input.judgment,
        consumption: null,
        participation: input.participation,
      },
      origin,
    ),
    encodeEntry(
      {
        kind: 'history.annotated',
        targets: reads.compaction.covered.map(item => item.ref),
        source: input.judgment,
      },
      origin,
    ),
  ])
}

/** Projects only the members changed by an accepted compaction batch. */
export function projectCompactionCommit(
  state: CompactionCommitState,
  execution: RunExecution,
  batch: CommittedBatch,
): Readonly<{ state: CompactionCommitState; execution: RunExecution }> | string {
  if (!sameInitializationValue(state.interpreter, SESSION_INTERPRETER))
    return 'unsupported snapshot interpreter adoption'
  if (
    batch.entries.length !== 2 ||
    batch.entries.some(
      row =>
        !sameInitializationValue(row.schema, SESSION_INTERPRETER) ||
        row.revision !== batch.revision ||
        !/^[1-9]\d*$/.test(row.id),
    ) ||
    batch.entries[0]?.id === batch.entries[1]?.id
  )
    return 'invalid compaction batch identity or interpreter'
  const decoded = decodeEntries(batch.entries, null)
  const first = decoded[0]
  const second = decoded[1]
  if (
    first === undefined ||
    !('ok' in first) ||
    first.ok.kind !== 'message.compaction' ||
    first.ok.participation === null ||
    second === undefined ||
    !('ok' in second) ||
    second.ok.kind !== 'history.annotated' ||
    !('targets' in second.ok)
  )
    return 'malformed compaction message or annotation'
  const message = judgeMessage(first.ok.message)
  if (!('ok' in message) || message.ok.role !== 'compaction') return 'malformed compaction message'
  const participation = first.ok.participation
  if (
    state.run.kind !== 'active' ||
    execution.run !== state.run.run ||
    execution.execution.execution !== state.run.execution.execution ||
    participation.execution !== state.run.execution.execution ||
    execution.terminal !== null ||
    participation.joint !== 'context-transition'
  )
    return 'compaction participation is not for the current execution'
  const { revision } = batch
  if (!/^(0|[1-9]\d*)$/.test(revision) || BigInt(revision) !== BigInt(state.revision) + 1n)
    return 'compaction revision does not follow the current state'
  const draft = { run: state.run as WorkSnapshot['run'], executions: [execution] }
  try {
    annotationTargets(second.ok.targets)
    evidenceFields(second.ok.source, 'history.source')
    const diagnostic = applyParticipation(draft, participation)
    if (diagnostic !== null) return diagnostic
  } catch (error) {
    if (error instanceof SessionValidationFailure) return JSON.stringify(error.failure)
    throw error
  }
  return {
    state: { ...state, run: draft.run, revision, source: batchEvidence(batch, state.session) },
    execution: draft.executions[0]!,
  }
}
