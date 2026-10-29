import type { SessionEntry } from './entries.ts'
import type { RunId } from './identity.ts'
import { associated, validateBinding, validateRegistration } from './call-state.ts'
import type { HistoryEntry } from './faces.ts'
import type { SessionHistoryReads } from './history-values.ts'
import type { WorkSnapshot } from './values.ts'
import {
  executionBoundary,
  historyContext,
  originalBatch,
  requirePrepared,
} from './history-validation.ts'
import {
  decimal,
  equalValue,
  evidenceFields,
  inconsistent,
  invalidAt,
  unavailableAt,
  unique,
} from './session-validation.ts'

/** Command and replay share the complete final release check. */
export function validateFrontierBatch(
  snapshot: WorkSnapshot,
  entries: readonly SessionEntry[],
  reads?: SessionHistoryReads,
): void {
  const starts = entries.filter(entry => entry.kind === 'run.started')
  for (const start of starts)
    requirePrepared(historyContext(snapshot, reads), { kind: 'selected', inputs: [start.first] })
  for (const entry of entries)
    if (entry.kind === 'intake.handed-over' && entry.result.kind === 'accepted')
      requirePrepared(historyContext(snapshot, reads), { kind: 'selected', inputs: [entry.input] })
  const releases = entries.filter(entry => entry.kind === 'intake.released')
  const freeze = entries.some(entry => entry.kind === 'session.frozen')
  const terminal = entries.some(entry => entry.kind === 'run.terminal')
  const frozen = snapshot.frozen !== null || freeze
  if (
    snapshot.frozen !== null &&
    snapshot.run.kind !== 'active' &&
    snapshot.pending.length > 0 &&
    entries.some(entry => entry.kind === 'session.archived')
  )
    inconsistent('frozen inactive snapshot retains pending inputs')
  const mustRelease = frozen && (terminal || (freeze && snapshot.run.kind !== 'active'))
  if (releases.length > 0 || mustRelease)
    requirePrepared(historyContext(snapshot, reads), { kind: 'pending', inputs: snapshot.pending })
  let pending = [...snapshot.pending]
  for (const entry of entries) {
    if (entry.kind === 'intake.handed-over' && entry.result.kind === 'rejected')
      pending = pending.filter(input => input !== entry.input)
    if (entry.kind === 'run.batch-taken')
      pending = pending.filter(input => !entry.batch.ordered.includes(input))
    if (entry.kind === 'intake.released') {
      unique(entry.inputs, item => item, 'intake.released.inputs')
      if (!mustRelease || !equalValue(entry.inputs, pending))
        inconsistent('SE38 is not the complete final pending set with its freeze or terminal')
      pending = []
    }
  }
  if (releases.length > 1 || (mustRelease && pending.length > 0))
    inconsistent('missing complete SE38 in frozen terminal batch')
}

function consequenceKind(entry: SessionEntry): string | null {
  switch (entry.kind) {
    case 'run.batch-taken':
      return 'input-taken'
    case 'call.bound':
      return 'registration' in entry
        ? entry.association === null
          ? 'call-registration'
          : 'call-association'
        : 'call'
    case 'call.execution-fact':
      return 'producer'
    case 'extension.passage':
      return 'calls' in entry ? 'registered-waiting' : 'waiting'
    case 'control.progress':
      return 'control'
    case 'run.terminal':
      return 'ended'
    case 'history.annotated':
      return 'terminal' in entry ? 'ended' : null
    default:
      return null
  }
}

function interpretationRuns(
  snapshot: WorkSnapshot,
  entries: readonly SessionEntry[],
  rows: readonly HistoryEntry[],
  reads?: SessionHistoryReads,
): ReadonlyMap<string, RunId> {
  const interpreted = entries.flatMap((entry, at) =>
    entry.kind === 'history.annotated' && 'execution' in entry ? [{ entry, row: rows[at]! }] : [],
  )
  const runs = new Map<string, RunId>()
  const sameLog = rows.filter(row => row.origin.via === 'same-log')
  if (sameLog.length === 0 && interpreted.length === 0) return runs
  const context = historyContext(snapshot, reads)
  for (const row of sameLog) {
    const originals = context.index.executions.flatMap(boundary =>
      boundary.facts
        .filter(fact => equalValue(fact.source, row.origin.source))
        .map(fact => ({ boundary, fact })),
    )
    const candidates = interpreted.filter(({ entry, row: progress }) => {
      if (progress.origin.via !== 'same-log') return false
      const boundary = executionBoundary(context, entry.execution.execution, entry.run)
      if (
        equalValue(progress.origin.source, row.origin.source) &&
        entry.execution.readThrough === boundary.readThrough &&
        (originals.length === 0 ||
          originals.some(original => original.boundary.execution === boundary.execution))
      )
        return true
      return originals.some(
        original =>
          original.boundary.execution === boundary.execution &&
          BigInt(original.fact.sequence) > BigInt(boundary.readThrough) &&
          BigInt(original.fact.sequence) <= BigInt(entry.execution.readThrough),
      )
    })
    const run = candidates[0]?.entry.run
    if (run === undefined || candidates.some(candidate => candidate.entry.run !== run))
      inconsistent('same-log consequence has no matching original execution progress')
    runs.set(row.id, run)
  }
  for (const { entry, row } of interpreted) {
    const boundary = executionBoundary(context, entry.execution.execution, entry.run)
    if (BigInt(entry.execution.readThrough) > BigInt(boundary.readThrough)) {
      const last = boundary.facts.find(fact => fact.sequence === entry.execution.readThrough)
      if (last === undefined || !equalValue(last.source, row.origin.source))
        inconsistent('interpretation progress has no matching original event')
    }
    const hasConsequence = entries.some((candidate, at) => {
      const origin = rows[at]
      return (
        origin !== undefined &&
        runs.get(origin.id) === entry.run &&
        consequenceKind(candidate) !== null &&
        (equalValue(origin.origin.source, row.origin.source) ||
          boundary.facts.some(
            fact =>
              equalValue(fact.source, origin.origin.source) &&
              BigInt(fact.sequence) > BigInt(boundary.readThrough) &&
              BigInt(fact.sequence) <= BigInt(entry.execution.readThrough),
          ))
      )
    })
    if (!hasConsequence) inconsistent('interpretation progress has no same-batch consequences')
  }
  return runs
}

/** Apply the original event's Run constraint against the evolving batch, including new registrations. */
export function validateInterpretationEntry(
  snapshot: WorkSnapshot,
  entry: SessionEntry,
  run: RunId | undefined,
): void {
  if (run === undefined) return
  if ('run' in entry && entry.run !== run)
    invalidAt('entry.run', 'differs from the original execution Run')
  if (entry.kind === 'run.terminal' && entry.terminal.run !== run)
    invalidAt('terminal.run', 'differs from the original execution Run')
  if (entry.kind === 'call.bound')
    validateRegistration(
      snapshot,
      'registration' in entry ? entry.registration : associated(entry.binding, entry.purpose),
      run,
    )
  if (entry.kind === 'call.execution-fact') {
    const consumption = snapshot.consumptions.find(item => item.id === entry.consumption)
    if (consumption === undefined) unavailableAt('producer.originalConsumption')
    validateBinding(snapshot, consumption.binding, run)
    if (
      entry.fact.kind !== 'execution' ||
      !equalValue(entry.fact.producer, consumption.binding.producer)
    )
      invalidAt('producer', 'not the original consumption producer')
  }
}

export function validateReplayHistory(
  snapshot: WorkSnapshot,
  entries: readonly SessionEntry[],
  rows: readonly HistoryEntry[],
  reads?: SessionHistoryReads,
): ReadonlyMap<string, RunId> {
  validateFrontierBatch(snapshot, entries, reads)
  const runs = interpretationRuns(snapshot, entries, rows, reads)
  for (const [at, entry] of entries.entries()) {
    const row = rows[at]
    if (row === undefined) inconsistent('missing committed entry')
    evidenceFields(row.origin.source, 'entry.origin.source')
    if (entry.kind === 'run.batch-taken') {
      const context = historyContext(snapshot, reads)
      const original = context.index.batches.find(
        item =>
          item.run === entry.run &&
          item.batch.id === entry.batch.id &&
          equalValue(item.source, row.origin.source),
      )
      if (original === undefined) unavailableAt('history.originalBatch')
      originalBatch(
        context,
        entry.run,
        original.execution,
        original.sequence,
        row.origin.source,
        entry.batch,
      )
      const prior = context.index.taken.find(
        item => item.execution === original.execution && item.sequence === original.sequence,
      )
      if (prior !== undefined) invalidAt('batch', 'original taken already committed')
    }
    if (entry.kind !== 'history.annotated' || !('execution' in entry)) continue
    const context = historyContext(snapshot, reads)
    const boundary = executionBoundary(context, entry.execution.execution, entry.run)
    if (
      entry.execution.revision !== boundary.revision ||
      !equalValue(entry.execution.evidence, boundary.executionEvidence)
    )
      invalidAt('execution', 'not the original same-root head')
    const after = decimal(boundary.readThrough, 'readThrough')
    const through = decimal(entry.execution.readThrough, 'readThrough')
    if (through < after || through > decimal(boundary.emittedThrough, 'emittedThrough'))
      invalidAt('readThrough', 'outside original event range')
    for (let sequence = after + 1n; sequence <= through; sequence++) {
      const fact = boundary.facts.find(item => item.sequence === String(sequence))
      if (fact === undefined) inconsistent('event gap in interpretation progress')
      const actual = entries.flatMap((candidate, index) => {
        const source = rows[index]?.origin.source
        const kind = consequenceKind(candidate)
        return kind !== null &&
          runs.get(rows[index]!.id) === boundary.run &&
          equalValue(source, fact.source)
          ? [kind]
          : []
      })
      const required = fact.kinds.filter(kind => kind !== 'observed')
      // The legacy forms normalize to their registration-backed equivalents.
      const normalize = (kind: string) =>
        kind === 'call' ? 'call-registration' : kind === 'waiting' ? 'registered-waiting' : kind
      if (!equalValue(actual.map(normalize), required.map(normalize)))
        inconsistent('interpretation cursor omits or replaces original consequences')
    }
  }
  return runs
}
