import {
  type DurableEvidence,
  type SessionAttemptRecord,
  type SessionTakenRecord,
  type RunId,
  type HistoryEntry,
} from '@omne-harness/session-contract'
import type { SessionState } from './root.ts'
import { digestOf, rowData, canonical } from './session-values.ts'
export type RunSource = Readonly<{
  run: RunId
  execution: string
  source: DurableEvidence
  row: HistoryEntry
}>
export type SessionSources = Readonly<{
  rows: number
  rowsById: ReadonlyMap<string, HistoryEntry>
  controls: ReadonlyMap<
    string,
    Readonly<{
      progress: import('@omne-harness/session-contract').ControlProgress
      execution: string | null
    }>
  >
  releasedAttempts: ReadonlySet<string>
  runs: ReadonlyMap<string, RunSource>
  attempts: ReadonlyMap<string, SessionAttemptRecord>
  attemptsByExecution: ReadonlyMap<string, readonly SessionAttemptRecord[]>
  runsByRun: ReadonlyMap<string, RunSource>
  grants: ReadonlyMap<string, SessionAttemptRecord>
  grantByAttempt: ReadonlyMap<string, DurableEvidence>
  takenByExecution: ReadonlyMap<string, readonly SessionTakenRecord[]>
  cursors: ReadonlyMap<string, Readonly<{ through: string; commit: DurableEvidence }>>
  taken: readonly SessionTakenRecord[]
}>
export const emptySessionSources = (): SessionSources => ({
  rows: 0,
  rowsById: new Map(),
  controls: new Map(),
  releasedAttempts: new Set(),
  runs: new Map(),
  attempts: new Map(),
  attemptsByExecution: new Map(),
  runsByRun: new Map(),
  grants: new Map(),
  grantByAttempt: new Map(),
  takenByExecution: new Map(),
  cursors: new Map(),
  taken: [],
})
export function entryEvidence(namespace: string, row: HistoryEntry): DurableEvidence {
  return {
    owner: 'session-memory-journal',
    record: `${namespace}/session/${row.id}`,
    revision: row.revision,
    digest: `sha256:${digestOf(row)}`,
  }
}
export function indexSession(
  previous: SessionSources,
  state: SessionState,
  namespace: string,
  previousState: SessionState | null,
): SessionSources {
  const runs = new Map(previous.runs),
    attempts = new Map(previous.attempts),
    cursors = new Map(previous.cursors),
    taken = [...previous.taken]
  const attemptsByExecution = new Map(previous.attemptsByExecution),
    runsByRun = new Map(previous.runsByRun),
    grants = new Map(previous.grants),
    grantByAttempt = new Map(previous.grantByAttempt),
    takenByExecution = new Map(previous.takenByExecution)
  const rowsById = new Map(previous.rowsById),
    controls = new Map(previous.controls),
    releasedAttempts = new Set(previous.releasedAttempts)
  let active =
    previousState?.snapshot.run.kind === 'active'
      ? previousState.snapshot.run.execution.execution
      : null
  const added = state.entries.slice(previous.rows)
  for (const row of added) {
    rowsById.set(row.id, row)
    const value = rowData(row)
    if (row.kind === 'run.started') active = String(value['execution'])
    if (row.kind === 'control.requested') {
      const progress = value['progress'] as import('@omne-harness/session-contract').ControlProgress
      controls.set(progress.operation, { progress, execution: active })
    }
    if (row.kind === 'run.attempt-released') releasedAttempts.add(String(value['attempt']))
    if (row.kind === 'run.terminal') active = null
    const entry = { ...value, kind: row.kind } as unknown as
      | { kind: 'run.started'; run: RunId; execution: string }
      | {
          kind: 'run.attempt-started'
          run: RunId
          attempt: import('@omne-harness/session-contract').AttemptId
          ordinal: string
        }
      | {
          kind: 'history.annotated'
          execution: import('@omne-harness/session-contract').ExecutionRef
        }
    if (entry.kind === 'run.started') {
      const value = {
        run: entry.run,
        execution: entry.execution,
        source: entryEvidence(namespace, row),
        row,
      }
      runs.set(entry.execution, value)
      runsByRun.set(entry.run, value)
    }
    if (entry.kind === 'run.attempt-started') {
      const run = runsByRun.get(entry.run)
      if (!run) throw new Error('SE15 has no original SE13')
      const attempt = {
        run: entry.run,
        execution: run.execution,
        attempt: entry.attempt,
        ordinal: entry.ordinal,
        started: entryEvidence(namespace, row),
      }
      attempts.set(entry.attempt, attempt)
      attemptsByExecution.set(run.execution, [
        ...(attemptsByExecution.get(run.execution) ?? []),
        attempt,
      ])
      const grant =
        state.lastCommit?.revision === row.revision ? state.lastCommit.source : attempt.started
      grants.set(canonical(attempt.started), attempt)
      grants.set(canonical(grant), attempt)
      grantByAttempt.set(entry.attempt, grant)
    }
    if (entry.kind === 'history.annotated' && 'execution' in entry) {
      const commit =
        state.lastCommit?.revision === row.revision
          ? state.lastCommit.source
          : entryEvidence(namespace, row)
      cursors.set(entry.execution.execution, { through: entry.execution.readThrough, commit })
      for (const original of added.filter(
        item => item.kind === 'run.batch-taken' && item.revision === row.revision,
      )) {
        const value = rowData(original) as unknown as {
          run: RunId
          batch: import('@omne-harness/session-contract').InputBatch
        }
        const record = {
          run: value.run,
          execution: entry.execution.execution,
          sequence: entry.execution.readThrough,
          source: original.origin.source,
          batch: value.batch,
          commit,
        }
        taken.push(record)
        takenByExecution.set(record.execution, [
          ...(takenByExecution.get(record.execution) ?? []),
          record,
        ])
      }
    }
  }
  return {
    rows: state.entries.length,
    rowsById,
    controls,
    releasedAttempts,
    runs,
    attempts,
    attemptsByExecution,
    runsByRun,
    grants,
    grantByAttempt,
    takenByExecution,
    cursors,
    taken,
  }
}
