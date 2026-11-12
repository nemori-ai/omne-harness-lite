import type { CalendarSupplyApplication } from '@omne-harness/calendar'

export type CalendarRunnerPhase =
  | 'importSeed'
  | 'initialize'
  | 'recover'
  | 'runDue'
  | 'deliverReactions'
type ResultEvents = {
  [P in CalendarRunnerPhase]: Readonly<{
    kind: 'result'
    phase: P
    result: Awaited<ReturnType<CalendarSupplyApplication[P]>>
  }>
}
export type CalendarRunnerStop = Readonly<{
  kind: 'stopped'
  timer: 'cleared'
  inFlight: 'settled' | 'retained'
  durableRuns: 'retained'
  supplyStop:
    | Readonly<{ kind: 'returned'; value: ReturnType<CalendarSupplyApplication['stop']> }>
    | Readonly<{ kind: 'failed'; message: string }>
  observerFailure: string | null
}>
export type CalendarRunnerEvent =
  | ResultEvents[CalendarRunnerPhase]
  | Readonly<{ kind: 'seedSkipped'; reason: 'notConfigured' }>
  | Readonly<{ kind: 'failure'; phase: CalendarRunnerPhase | 'context'; message: string }>
  | CalendarRunnerStop
export type CalendarRunnerCycle = Readonly<{
  kind: 'settled' | 'stopped'
  events: readonly CalendarRunnerEvent[]
  observerFailure: string | null
}>
