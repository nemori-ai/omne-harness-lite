import { ScheduleCivilSchema, ScheduleRecurrenceSchema } from '@omne-harness/schedule-contract'
import type { ScheduleRecurrence } from '@omne-harness/schedule-contract'
import { invalid } from './civil.ts'
import { parseCron } from './cron.ts'
import { parseRrule } from './rrule.ts'
import { EnumerationState } from './enumeration-state.ts'
import { enumeratePosition } from './position.ts'
import { enumerateRrule } from './enumerate-rrule.ts'
import { enumerateCron } from './enumerate-cron.ts'
import type {
  ScheduleEnumerationInput,
  ScheduleEnumerationResult,
  ScheduleRecurrenceInvalid,
} from './types.ts'
export * from './types.ts'
export { materializeScheduleCivil } from './civil.ts'

export function validateScheduleRecurrence(
  recurrence: ScheduleRecurrence,
): { kind: 'valid' } | ScheduleRecurrenceInvalid {
  const parsed = ScheduleRecurrenceSchema.safeParse(recurrence)
  if (!parsed.success)
    return {
      kind: 'invalid',
      issues: parsed.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    }
  try {
    if (parsed.data.kind === 'rrule') parseRrule(parsed.data.rule, parsed.data.begin)
    if (parsed.data.kind === 'cron') parseCron(parsed.data.expression)
    return { kind: 'valid' }
  } catch (error) {
    return invalid(
      parsed.data.kind === 'cron' ? 'expression' : 'rule',
      error instanceof Error ? error.message : 'Invalid recurrence',
    )
  }
}
export function enumerateScheduleRecurrence(
  input: ScheduleEnumerationInput,
): ScheduleEnumerationResult {
  const validation = validateScheduleRecurrence(input.recurrence)
  if (validation.kind === 'invalid') return validation
  if (input.after !== null && !ScheduleCivilSchema.safeParse(input.after).success)
    return invalid('after', 'Expected a civil time or null')
  if (typeof input.inclusive !== 'boolean') return invalid('inclusive', 'Expected a boolean')
  for (const [field, value, maximum] of [
    ['take', input.take, 1000],
    ['maxCandidates', input.budget?.maxCandidates, 100000],
    ['maxYears', input.budget?.maxYears, 400],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
      return invalid(field, `Expected an integer from 1 to ${maximum}`)
  }
  const recurrence = ScheduleRecurrenceSchema.parse(input.recurrence)
  const begin = recurrence.kind === 'once' ? recurrence.localAt : recurrence.begin
  const state = new EnumerationState(
    input,
    begin,
    recurrence.kind === 'once' ? recurrence.localAt : recurrence.until,
  )
  if (recurrence.kind === 'once') {
    if (state.accepts(recurrence.localAt)) {
      state.charge()
      state.emit({ kind: 'civil', local: recurrence.localAt }, recurrence.localAt)
    }
    state.page.exhausted = true
    state.observe(recurrence.localAt)
    return state.page
  }
  if (state.through < state.lower) {
    state.page.exhausted = true
    return state.page
  }
  switch (recurrence.kind) {
    case 'position':
      enumeratePosition(recurrence, state)
      break
    case 'rrule':
      enumerateRrule(parseRrule(recurrence.rule, recurrence.begin), state)
      break
    case 'cron':
      enumerateCron(parseCron(recurrence.expression), state)
      break
  }
  return state.page.exhausted ? state.page : state.finish()
}
