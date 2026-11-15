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

export type ConnectedObservation =
  | Readonly<{ kind: 'not-reached' }>
  | Readonly<{ kind: 'refused' | 'disconnected' | 'connected'; evidence: readonly string[] }>
export const NOT_REACHED: ConnectedObservation = { kind: 'not-reached' }

export type FirstPathObservation = Readonly<Partial<Record<FirstPathHop, ConnectedObservation>>>

export function evidenceOf(observation: ConnectedObservation): readonly string[] {
  return observation.kind === 'not-reached' ? ['not-reached'] : observation.evidence
}
