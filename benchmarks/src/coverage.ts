import type { Gate } from '@omne-harness/perf-harness'

const ALL = 'every session suite'

type Covered = Readonly<{ by: string; seen: boolean }>

const seen = (by: string): Covered => ({ by, seen: true })
const declared = (by: string): Covered => ({ by, seen: false })

export const COVERED: Readonly<Record<string, Covered>> = {
  'session.created': declared(ALL),
  'session.initialization-item': declared(ALL),
  'session.adoption': declared(ALL),
  'session.adoption-noted': declared(ALL),
  'session.model-projected': declared(ALL),
  'message.user': seen(ALL),
  'message.assistant': seen(ALL),
  'message.tool': seen(ALL),
  'message.system_reminder': seen(ALL),
  'intake.routed': declared(ALL),
  'intake.handed-over': declared(ALL),
  'intake.released': declared(ALL),
  'run.started': seen(ALL),
  'run.attempt-started': declared(ALL),
  'run.attempt-released': declared(ALL),
  'run.attempt-exited': declared(ALL),
  'run.batch-taken': declared(ALL),
  'run.terminal': seen(ALL),
  'call.bound': declared(ALL),
  'call.execution-fact': declared(ALL),
  'call.result-processed': declared(ALL),
  'account.linked': declared(ALL),
  'entries.interpreted': declared(ALL),
  'message.compaction': declared('compaction'),
  'history.annotated': declared('compaction'),
  'call.backgrounded': declared('background-calls'),
}

const BETWEEN_ROUNDS =
  'an operation a client makes between rounds; no workload makes it yet, the full ladder of the sixth run of #1667 adds it'
const LIFECYCLE =
  'a turn of the life of a session (cancel, archive, freeze, recovery); no workload makes it yet, the sixth run of #1667 adds it'

export const NOT_COVERED: Readonly<Record<string, string>> = {
  'session.permission-assigned': BETWEEN_ROUNDS,
  'session.authorization-expressed': BETWEEN_ROUNDS,
  'session.todo-added': BETWEEN_ROUNDS,
  'session.todo-completed': BETWEEN_ROUNDS,
  'session.todo-removed': BETWEEN_ROUNDS,
  'session.tool-resident-admitted': BETWEEN_ROUNDS,
  'session.prompt-segment-admitted': BETWEEN_ROUNDS,
  'session.mode-changed': BETWEEN_ROUNDS,
  'session.model-selected': BETWEEN_ROUNDS,
  'session.declaration-adopted': BETWEEN_ROUNDS,
  'session.context-registration-changed': BETWEEN_ROUNDS,
  'session.workspace-changed': BETWEEN_ROUNDS,
  'session.resident': BETWEEN_ROUNDS,
  'session.command-recorded': BETWEEN_ROUNDS,
  'session.recovery-input-adopted': LIFECYCLE,
  'session.idle-evidence': LIFECYCLE,
  'session.frozen': LIFECYCLE,
  'session.archived': LIFECYCLE,
  'session.unarchived': LIFECYCLE,
  'control.requested': LIFECYCLE,
  'control.progress': LIFECYCLE,
  'session.child-recorded': 'a child session; no workload hands work over or delegates',
  'message.tool_internal': 'a call that waits for a person; every workload runs without asking',
  'hitl.decision': 'a call that waits for a person; every workload runs without asking',
  'message.delivered':
    'an input that arrives while a round runs; every workload sends between rounds',
  'call.result-preserved':
    'a result the product keeps apart from the log; the tool-result suite stays under that size',
  'call.background-settled':
    'a background command that ends; those of the background-calls suite sleep to the end',
  'extension.passage': 'a loop extension of the tenant; no workload installs one',
}

export type Accounted = Readonly<{ unlisted: readonly string[]; gone: readonly string[] }>

export function accountedFor(kinds: readonly string[]): Accounted {
  const listed = new Set([...Object.keys(COVERED), ...Object.keys(NOT_COVERED)])
  const known = new Set(kinds)
  return {
    unlisted: kinds.filter(kind => !listed.has(kind)).sort(),
    gone: [...listed].filter(kind => !known.has(kind)).sort(),
  }
}

export const COVERAGE_GATE =
  'every entry kind of the product is in a workload or on the list of those that are not'

export function coverageGate(kinds: readonly string[], visible: readonly string[]): Gate {
  const { unlisted, gone } = accountedFor(kinds)
  const unseen = visible.filter(kind => COVERED[kind]?.seen !== true).sort()
  const faults = [
    ...(unlisted.length === 0
      ? []
      : [`the product has kinds the list does not: ${unlisted.join(', ')}`]),
    ...(gone.length === 0 ? [] : [`the list has kinds the product does not: ${gone.join(', ')}`]),
    ...(unseen.length === 0
      ? []
      : [`the run showed kinds the list does not mark as seen: ${unseen.join(', ')}`]),
  ]
  const covered = Object.keys(COVERED).length
  return {
    name: COVERAGE_GATE,
    from: 'the entry kinds of the session contract, as the lab tells them',
    state: faults.length === 0 ? 'pass' : 'blocked',
    detail:
      faults.length === 0
        ? `${String(kinds.length)} kinds: ${String(covered)} in a workload, ${String(kinds.length - covered)} listed as not covered with the reason`
        : faults.join('; '),
  }
}
