import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { ScheduleCivilSchema, ScheduleLocalDateSchema } from '@omne-harness/schedule-contract'
import type {
  ScheduleCivil,
  ScheduleDateExplanation,
  ScheduleRecurrence,
} from '@omne-harness/schedule-contract'
import type { ScheduleRawCandidate } from '../calculation/types.ts'
import { FixedCalendar } from './calendar.ts'
import { PredictionBudget, PredictionFailure } from './budget.ts'

export type PredictionSource = {
  key: string
  local: ScheduleCivil
  explanation: ScheduleDateExplanation[]
  absent: boolean
}
function sourceKey(recurrence: ScheduleRecurrence, identity: object): string {
  const bytes = canonicalize(['omne.schedule.source/1', recurrence, identity])
  if (bytes === undefined)
    throw new PredictionFailure('invalid_input', 'Source cannot be canonicalized')
  return `schedule-source/1:${createHash('sha256').update(bytes).digest('hex')}`
}
export async function expandSources(
  raw: ScheduleRawCandidate,
  recurrence: ScheduleRecurrence,
  calendar: FixedCalendar | null,
  budget: PredictionBudget,
): Promise<PredictionSource[]> {
  if (raw.kind === 'civil')
    return [{ key: sourceKey(recurrence, raw), local: raw.local, explanation: [], absent: false }]
  if (calendar === null)
    throw new PredictionFailure('missing_environment', 'Working-day position needs a calendar')
  budget.chargeCandidates(raw.times.length - 1)
  const selected = await calendar.position(raw.periodStart, raw.periodEnd, raw.ordinal)
  const explanation: ScheduleDateExplanation = {
    kind: 'workingDayPosition',
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    ordinal: raw.ordinal,
    selectedDate: selected.date === null ? null : ScheduleLocalDateSchema.parse(selected.date),
    basis: selected.basis,
  }
  return raw.times.map(time => ({
    key: sourceKey(recurrence, {
      kind: 'workingDayPosition',
      periodStart: raw.periodStart,
      periodEnd: raw.periodEnd,
      ordinal: raw.ordinal,
      time,
    }),
    local: ScheduleCivilSchema.parse(`${selected.date ?? raw.periodStart}T${time}`),
    explanation: [explanation],
    absent: selected.date === null,
  }))
}
