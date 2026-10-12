export interface RetirementPolicy {
  readonly waitMilliseconds: number
  readonly force: boolean
  readonly schedule: (milliseconds: number, callback: () => void) => () => void
}
