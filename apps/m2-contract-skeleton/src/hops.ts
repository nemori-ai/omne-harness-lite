// The hops of the connected path and the observation of one hop. The path and the report
// aggregator share these; neither owns the other's logic.

/** The hops of the path, in report order. */
export const HOP_IDS = [
  'H01',
  'H02',
  'H03',
  'H04',
  'H05',
  'H06',
  'H07',
  'H08',
  'H09',
  'H10',
  'H11',
  'H12',
  'H13',
] as const
export type FirstPathHop = (typeof HOP_IDS)[number]

/**
 * What the path observed at one hop. `not-reached`: the path stopped before the hop. `refused`: an
 * upstream public entry refused a call with a named failure, or the Agent journal shows the loop at
 * a named refusal point (I4, M6); the evidence names it. `disconnected`: the calls answered, but
 * what they returned does not meet the connection criterion of the hop; this includes a pending
 * hop that the path could not call. `connected`: the public calls succeeded in order and met it.
 */
export type ConnectedObservation =
  | Readonly<{ kind: 'not-reached' }>
  | Readonly<{ kind: 'refused' | 'disconnected' | 'connected'; evidence: readonly string[] }>
export const NOT_REACHED: ConnectedObservation = { kind: 'not-reached' }

/** The observations of one run. A hop the path did not reach has no entry. */
export type FirstPathObservation = Readonly<Partial<Record<FirstPathHop, ConnectedObservation>>>

/** The evidence labels of an observation; a hop the path did not reach carries `not-reached`. */
export function evidenceOf(observation: ConnectedObservation): readonly string[] {
  return observation.kind === 'not-reached' ? ['not-reached'] : observation.evidence
}
