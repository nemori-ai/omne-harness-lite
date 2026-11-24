import type { ScheduleCandidate, SchedulePurpose } from '@omne-harness/schedule-contract'
import type { WatchCause } from './types.ts'

/** Why nobody watched a stretch: the host was off (a broken heartbeat), the schedule was paused, or a dependency was out. */
export type MissCause = 'stopped' | 'paused' | 'recovered' | 'incompatible'

export type Classification = Readonly<{
  /** The missed slots to accept, in order; the rest of the stretch is missed. */
  selected: readonly ScheduleCandidate[]
  reason:
    | 'catch-up-none'
    | 'catch-up-latest'
    | 'environment-incompatible'
    | 'reminder-not-resent'
    | 'lapsed'
    | 'paused-across'
    | 'awaiting-recovery'
}>

/** The cause of a stretch before the watch start: a heartbeat gap wins over the schedule's own reason. */
export function missCause(
  heartbeatFrom: string,
  watchedFrom: string,
  watchedCause: WatchCause,
): MissCause {
  if (heartbeatFrom > watchedFrom) return 'stopped'
  if (watchedCause === 'resumed') return 'paused'
  return watchedCause === 'recovered' ? 'recovered' : 'stopped'
}

/** The disposition of one missed stretch, by the kind of schedule and why it was missed. */
export function classifyMissed(
  purpose: SchedulePurpose,
  once: boolean,
  cause: MissCause,
  missed: readonly ScheduleCandidate[],
): Classification {
  if (purpose.kind === 'reminder') return { selected: [], reason: 'reminder-not-resent' }
  if (once) {
    if (cause === 'paused') return { selected: [], reason: 'paused-across' }
    return purpose.misfire?.kind === 'awaitRecovery'
      ? { selected: missed, reason: 'awaiting-recovery' }
      : { selected: [], reason: 'lapsed' }
  }
  if (cause === 'incompatible') return { selected: [], reason: 'environment-incompatible' }
  if (purpose.catchUp.kind === 'none') return { selected: [], reason: 'catch-up-none' }
  return { selected: missed.slice(-purpose.catchUp.maximum), reason: 'catch-up-latest' }
}
