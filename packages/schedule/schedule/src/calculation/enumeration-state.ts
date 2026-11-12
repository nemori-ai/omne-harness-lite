import { Temporal } from '@js-temporal/polyfill'
import { ScheduleCivilSchema } from '@omne-harness/schedule-contract'
import type { ScheduleCivil } from '@omne-harness/schedule-contract'
import type {
  ScheduleEnumerationInput,
  ScheduleEnumerationPage,
  ScheduleRawCandidate,
} from './types.ts'
import { civilFromPlain } from './civil.ts'

export class EnumerationState {
  readonly page: ScheduleEnumerationPage = {
    kind: 'ok',
    candidates: [],
    exhausted: false,
    observedThrough: null,
    resumeAfter: null,
    scannedCandidates: 0,
    scannedPeriods: 0,
    limitReason: null,
  }
  readonly lower: ScheduleCivil
  readonly through: ScheduleCivil
  readonly finite: boolean
  readonly input: ScheduleEnumerationInput
  readonly begin: ScheduleCivil
  constructor(input: ScheduleEnumerationInput, begin: ScheduleCivil, until: ScheduleCivil | null) {
    this.input = input
    this.begin = begin
    this.lower = input.after !== null && input.after > begin ? input.after : begin
    const start = Temporal.PlainDateTime.from(this.lower)
    const horizon =
      start.year + input.budget.maxYears > 9999
        ? ScheduleCivilSchema.parse('9999-12-31T23:59:59')
        : civilFromPlain(start.add({ years: input.budget.maxYears }).subtract({ seconds: 1 }))
    this.through = until !== null && until < horizon ? until : horizon
    this.finite = (until !== null && until <= horizon) || horizon === '9999-12-31T23:59:59'
  }
  get stopped(): boolean {
    return this.page.limitReason !== null || this.page.candidates.length >= this.input.take
  }
  charge(): boolean {
    if (this.page.scannedCandidates >= this.input.budget.maxCandidates) {
      this.page.limitReason = 'candidateBudget'
      return false
    }
    this.page.scannedCandidates++
    return true
  }
  accepts(local: ScheduleCivil): boolean {
    return (
      local >= this.begin &&
      local <= this.through &&
      (this.input.after === null ||
        local > this.input.after ||
        (this.input.inclusive && local === this.input.after))
    )
  }
  emit(candidate: ScheduleRawCandidate, cursor: ScheduleCivil): void {
    this.page.candidates.push(candidate)
    this.page.resumeAfter = cursor
  }
  observe(local: ScheduleCivil): void {
    this.page.observedThrough = local
  }
  finish(): ScheduleEnumerationPage {
    if (!this.stopped) {
      this.page.exhausted = this.finite
      this.page.limitReason = this.finite ? null : 'yearBudget'
      this.observe(this.through)
      this.page.resumeAfter = this.through
    }
    return this.page
  }
}
