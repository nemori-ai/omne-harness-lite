import { enumerateScheduleRecurrence } from '@omne-harness/schedule'
import type { ScheduleEnumerationInput, ScheduleEnumerationResult } from '@omne-harness/schedule'

export default function calculate(input: ScheduleEnumerationInput): ScheduleEnumerationResult {
  return enumerateScheduleRecurrence(input)
}
