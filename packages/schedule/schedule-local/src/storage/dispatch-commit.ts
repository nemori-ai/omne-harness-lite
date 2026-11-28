import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import type { StorageScope } from '@omne-harness/sql-contract'
import { canonical, digest, equal, json, ownerMatches } from './encoding.ts'
import {
  dispatchFactSchema,
  dispatchRequirementSchema,
  type DispatchCommandInput,
  type DispatchRequirement,
} from './dispatch-schema.ts'
import {
  decideAdmission,
  lockedFacts,
  lockedWatchStart,
  writeClassification,
  readRecord,
  readState,
  releasedHolding,
  saveState,
  writeAdmission,
  writeShownNext,
} from './dispatch-records.ts'
import { GUARD_FACT, RESULT_FACT } from './schema.ts'
import { stepJob, writeDirect } from './dispatch-jobs.ts'

const exhausting = (command: DispatchCommandInput) =>
  (command.kind === 'classify' && command.exhausts) ||
  (command.kind === 'admit' &&
    (command.decision.kind === 'exhaust' ||
      ('exhausts' in command.decision && command.decision.exhausts)))

/** The guard requirement of a dispatch commit: the command itself, and the quota it frees when it exhausts. */
export function scheduleDispatchRequirement(
  scope: StorageScope,
  command: DispatchCommandInput,
): DispatchRequirement {
  const release =
    (command.kind === 'admit' || command.kind === 'classify') &&
    exhausting(command) &&
    command.holding.kind === 'held'
      ? command.holding
      : null
  return dispatchRequirementSchema.parse({
    dispatch: {
      scope,
      commandDigest: digest(['omne.schedule.dispatch.sql-command/1', command]),
      command,
    },
    quotaEffect:
      release === null || (command.kind !== 'admit' && command.kind !== 'classify')
        ? { kind: 'none' }
        : {
            kind: 'release',
            reservationRef: release.reservationRef,
            scheduleId: command.scheduleId,
          },
    resultingHolding: release === null ? null : releasedHolding(release),
  })
}

const stale = { kind: 'conflict', basis: { stale: true } } as const

function beat(port: ParticipantPort, command: Extract<DispatchCommandInput, { kind: 'beat' }>) {
  const owner = canonical(command.owner)
  const active = port.execute(
    "SELECT 1 FROM sc_schedules WHERE owner = ? AND control = 'active' LIMIT 1",
    [owner],
  ).rows[0]
  if (active === undefined) return
  const row = port.execute('SELECT beat_at, watch_from FROM sc_watch WHERE owner = ? LIMIT 1', [
    owner,
  ]).rows[0]
  const last = typeof row?.[0] === 'string' ? Date.parse(row[0]) : null
  const broken = last === null || Date.parse(command.at) - last > command.gapMs
  const from = broken ? command.at : String(row?.[1])
  port.execute(
    'INSERT INTO sc_watch (owner, beat_at, watch_from) VALUES (?, ?, ?) ON CONFLICT(owner) DO UPDATE SET beat_at=excluded.beat_at, watch_from=excluded.watch_from',
    [owner, last !== null && Date.parse(command.at) < last ? String(row?.[0]) : command.at, from],
  )
}

/** Executes one dispatch command under the lock; a decision the lock no longer gives rolls back as stale. */
export function executeDispatch(requirement: DispatchRequirement, port: ParticipantPort) {
  const { dispatch: binding } = requirement
  const { command } = binding
  if (
    !ownerMatches(binding.scope, command.owner) ||
    !equal(requirement, scheduleDispatchRequirement(binding.scope, command))
  )
    return { kind: 'conflict', basis: { forbidden: true } } as const
  const fact = dispatchFactSchema.safeParse(port.requireFact(GUARD_FACT))
  if (
    !fact.success ||
    !equal(fact.data.dispatch, binding) ||
    !equal(fact.data.quotaEffect, requirement.quotaEffect)
  )
    return { kind: 'conflict', basis: { forbidden: true } } as const
  const at = fact.data.decisionAt
  if (command.kind === 'beat') beat(port, command)
  else if (command.kind === 'direct') {
    if (!writeDirect(port, command)) return stale
  } else if (command.kind === 'step') {
    if (!stepJob(port, command.owner, { ...command, at })) return stale
  } else {
    const record = readRecord(port, command.owner, command.scheduleId)
    if (record === null || record.view.revision !== command.revision) return stale
    if (command.kind === 'refresh') {
      if (command.state !== null) {
        saveState(port, command.owner, command.scheduleId, command.state)
        writeShownNext(port, command.owner, record, command.state)
      }
      port.execute('DELETE FROM sc_outbox WHERE owner = ? AND schedule_id = ? AND revision <= ?', [
        canonical(command.owner),
        command.scheduleId,
        command.revision,
      ])
    } else if (command.kind === 'classify') {
      const state = readState(port, command.owner, command.scheduleId)
      if (
        state === null ||
        state.selected.length > 0 ||
        !equal(record.quota, command.holding) ||
        state.disposedThrough !== command.from ||
        command.through !==
          (state.counting?.through ?? lockedWatchStart(port, command.owner, state))
      )
        return stale
      writeClassification(port, command, record, state, at)
    } else {
      const state = readState(port, command.owner, command.scheduleId)
      if (state === null || !equal(record.quota, command.holding)) return stale
      if (!equal(decideAdmission(lockedFacts(port, command, record, state)), command.decision))
        return stale
      writeAdmission(port, command, record, state, at)
    }
  }
  const response = json({ committed: command.kind })
  port.provideFact(RESULT_FACT, response)
  return { kind: 'participated', response } as const
}
