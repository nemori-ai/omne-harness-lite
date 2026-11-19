/** The adaptation facts every model record states, each with where it was measured. */
export type RecordFact =
  | 'engine'
  | 'efforts'
  | 'reasoning-off'
  | 'forced-tool-choice'
  | 'ends-with-assistant'
  | 'replay-shape'
  | 'replay-binding'
  | 'cache'
  | 'system-placement'
  | 'usage-fields'

export type FactSource = Readonly<{ measuredAt: string; evidence: string; note?: string }>

/** A record without the source of one of its facts does not compile. */
export type RecordProvenance = Readonly<Record<RecordFact, FactSource>>

export const RECORD_FACTS: readonly RecordFact[] = [
  'engine',
  'efforts',
  'reasoning-off',
  'forced-tool-choice',
  'ends-with-assistant',
  'replay-shape',
  'replay-binding',
  'cache',
  'system-placement',
  'usage-fields',
]
