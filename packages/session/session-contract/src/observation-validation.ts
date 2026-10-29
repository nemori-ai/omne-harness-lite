import type { WorkSnapshot } from './values.ts'
import type { SessionLogObservation } from './projection.ts'
import type { SessionHistoryReads } from './history-values.ts'
import {
  executionBoundary,
  historyContext,
  originalBatch,
  requirePrepared,
} from './history-validation.ts'
import {
  SessionValidationFailure,
  decimal,
  evidenceFields,
  equalValue,
  invalidAt,
  unavailableAt,
  inconsistent,
} from './session-validation.ts'

export function validateObservation(
  snapshot: WorkSnapshot,
  observation: SessionLogObservation,
  reads?: SessionHistoryReads,
) {
  if (
    !snapshot.executions?.some(
      item => item.run === observation.run && item.execution.execution === observation.execution,
    ) &&
    !(
      snapshot.run.kind === 'active' &&
      snapshot.run.run === observation.run &&
      snapshot.run.execution.execution === observation.execution
    )
  )
    throw new SessionValidationFailure({ kind: 'denied', action: 'projectSessionLog' })
  const context = historyContext(snapshot, reads)
  const boundary = executionBoundary(context, observation.execution, observation.run)
  evidenceFields(observation.source, 'source')
  decimal(observation.revision, 'revision')
  if (observation.revision !== boundary.revision)
    invalidAt('revision', 'not the same-root execution head')
  const head =
    observation.executionEvidence ??
    (equalValue(observation.source, boundary.executionEvidence) ? observation.source : undefined)
  if (head === undefined) unavailableAt('executionEvidence')
  evidenceFields(head, 'executionEvidence')
  if (!equalValue(head, boundary.executionEvidence))
    invalidAt('executionEvidence', 'not the original head receipt')
  if (observation.sequence !== null) {
    const sequence = decimal(observation.sequence, 'sequence')
    if (sequence === 0n || sequence > BigInt(boundary.emittedThrough))
      invalidAt('sequence', 'outside the emitted event range')
    const fact = boundary.facts.find(item => item.sequence === observation.sequence)
    if (fact === undefined) unavailableAt('history.execution.fact')
    if (!equalValue(fact.source, observation.source))
      invalidAt('source', 'not the original event source')
    if (
      !equalValue(
        fact.kinds,
        observation.consequences.map(item => item.kind),
      )
    )
      invalidAt('consequences', 'not the complete original consequence order')
    const before = BigInt(boundary.readThrough)
    if (sequence > before + 1n) {
      const skipped = boundary.facts.filter(
        item => BigInt(item.sequence) > before && BigInt(item.sequence) < sequence,
      )
      if (BigInt(skipped.length) !== sequence - before - 1n)
        inconsistent('history.prefix: event gap')
      if (skipped.some(item => !equalValue(item.kinds, ['observed'])))
        unavailableAt('history.prefix.committedConsequences')
    }
  }
  for (const consequence of observation.consequences) {
    if (consequence.kind === 'input-taken') {
      if (observation.sequence === null)
        invalidAt('sequence', 'taken requires its original event sequence')
      originalBatch(
        context,
        observation.run,
        observation.execution,
        observation.sequence,
        observation.source,
        consequence.batch,
      )
      if (
        reads !== undefined &&
        !equalValue(reads.scope, { kind: 'selected', inputs: consequence.batch.ordered })
      )
        invalidAt('history.scope', 'not the complete original batch')
    }
    if (consequence.kind === 'ended') {
      if (
        boundary.ended === null ||
        (observation.sequence !== null && boundary.ended.sequence !== observation.sequence) ||
        !equalValue(boundary.ended.source, observation.source)
      )
        invalidAt('ended', 'not the original ended event')
      if (
        snapshot.frozen !== null &&
        snapshot.run.kind === 'active' &&
        snapshot.run.run === observation.run
      )
        requirePrepared(context, { kind: 'pending', inputs: snapshot.pending })
    }
  }
  return {
    context,
    boundary,
    head,
    repeated:
      observation.sequence !== null && BigInt(observation.sequence) <= BigInt(boundary.readThrough),
  }
}
