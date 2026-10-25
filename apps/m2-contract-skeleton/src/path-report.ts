import { CONFORMANCE_OBLIGATIONS } from '@omne-harness/model-contract/testing'
import { GOVERNANCE_SCENARIOS, REQUIRED_SCENARIOS, type ScenarioResult } from './scenarios.ts'

export const HOP_IDS = ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08'] as const
export type HopId = (typeof HOP_IDS)[number]
export type FragmentObservation = Readonly<{
  fragmentId: string
  status: 'pass' | 'fail' | 'not-applicable'
  evidence: string
}>
export type HopObservation = Readonly<{
  hopId: HopId
  publicEntry: string
  responsibility: string
  ownerCards: readonly string[]
  reason: string
  state: 'verified' | 'gap' | 'failed'
  fragments: readonly FragmentObservation[]
}>
const card = (id: number) => `https://github.com/nemori-ai/omne-harness-lite/issues/${id}`
export const HOP_DEFINITIONS = [
  {
    hopId: 'H01',
    publicEntry: '@omne-harness/public-contract',
    responsibility: 'identity creation and recognition',
    ownerCards: [319, 659],
    reason: 'SPEC.md#h01',
  },
  {
    hopId: 'H02',
    publicEntry: '@omne-harness/public-contract; @omne-harness/identity',
    responsibility: 'identity login and current standing',
    ownerCards: [659],
    reason: 'SPEC.md#h02',
  },
  {
    hopId: 'H03',
    publicEntry: '@omne-harness/public-contract; @omne-harness/session-contract',
    responsibility: 'access to Session creation',
    ownerCards: [318, 685, 536, 680, 677],
    reason: 'SPEC.md#h03',
  },
  {
    hopId: 'H04',
    publicEntry: '@omne-harness/session-contract; @omne-harness/agent-contract',
    responsibility: 'Session coordination and Agent execution',
    ownerCards: [536, 680, 672, 673],
    reason: 'SPEC.md#h04',
  },
  {
    hopId: 'H05',
    publicEntry:
      '@omne-harness/agent-contract; @omne-harness/request-context; @omne-harness/model-contract',
    responsibility: 'RQ assembly and Agent Model selection',
    ownerCards: [676, 672, 673, 682, 683],
    reason: 'SPEC.md#h05',
  },
  {
    hopId: 'H06',
    publicEntry: '@omne-harness/model-contract/testing',
    responsibility: 'Model result and account handoff to Agent',
    ownerCards: [682, 683, 672],
    reason: 'SPEC.md#h06',
  },
  {
    hopId: 'H07',
    publicEntry: '@omne-harness/agent-contract; @omne-harness/session-contract',
    responsibility: 'Agent handoff and Session durable journal',
    ownerCards: [672, 673, 536, 680],
    reason: 'SPEC.md#h07',
  },
  {
    hopId: 'H08',
    publicEntry: '@omne-harness/session-contract',
    responsibility: 'Session history projection and recovery',
    ownerCards: [536, 680, 685],
    reason: 'SPEC.md#h08',
  },
] as const satisfies readonly Readonly<{
  hopId: HopId
  publicEntry: string
  responsibility: string
  ownerCards: readonly number[]
  reason: string
}>[]

function requiredFragments(hopId: HopId): readonly string[] {
  if (hopId === 'H01') return ['G1-register', 'G1-create']
  if (hopId === 'H02')
    return GOVERNANCE_SCENARIOS.filter(id => id !== 'G1-register' && id !== 'G1-create')
  return hopId === 'H06' ? CONFORMANCE_OBLIGATIONS : []
}

export function observeHops(
  governance: readonly ScenarioResult[],
  model: readonly FragmentObservation[],
): readonly HopObservation[] {
  return HOP_DEFINITIONS.map(definition => {
    const fragmentIds = requiredFragments(definition.hopId)
    const fragments =
      definition.hopId === 'H06'
        ? model
        : governance
            .filter(result => fragmentIds.includes(result.scenarioId))
            .map(result => ({
              fragmentId: result.scenarioId,
              status:
                result.status === 'executed' && result.matchesExpected
                  ? ('pass' as const)
                  : ('fail' as const),
              evidence: `${result.scenarioId}:${result.evidence}`,
            }))
    return {
      ...definition,
      ownerCards: definition.ownerCards.map(card),
      state: fragments.some(fragment => fragment.status === 'fail') ? 'failed' : 'gap',
      fragments,
    }
  })
}

export type PathReport = Readonly<{
  checksPassed: boolean
  fullPath: 'complete' | 'incomplete'
  hops: readonly HopObservation[]
  scenarios: readonly ScenarioResult[]
  gaps: readonly HopId[]
  structureErrors: readonly string[]
  duplicateObservations: readonly HopObservation[]
}>

type NormalizedHop = Readonly<{
  hop: HopObservation
  errors: readonly string[]
  duplicates: readonly HopObservation[]
}>

function hopErrors(hop: HopObservation): readonly string[] {
  const errors: string[] = []
  if (
    [hop.publicEntry, hop.reason, hop.responsibility].some(text => text.length === 0) ||
    hop.ownerCards.length === 0
  )
    errors.push(`incomplete-hop-metadata:${hop.hopId}`)
  if (
    hop.fragments.some(
      fragment => fragment.fragmentId.length === 0 || fragment.evidence.length === 0,
    )
  )
    errors.push(`incomplete-fragment-metadata:${hop.hopId}`)
  for (const fragmentId of requiredFragments(hop.hopId)) {
    const count = hop.fragments.filter(fragment => fragment.fragmentId === fragmentId).length
    if (count !== 1) errors.push(`fragment-count:${hop.hopId}:${fragmentId}:${count}`)
  }
  return errors
}

function normalizeHop(gap: HopObservation, observations: readonly HopObservation[]): NormalizedHop {
  const found = observations.filter(hop => hop.hopId === gap.hopId)
  const first = found[0]
  if (first === undefined) return { hop: gap, errors: [`missing-hop:${gap.hopId}`], duplicates: [] }
  if (found.length > 1)
    return {
      hop: { ...first, state: 'failed' },
      errors: [`duplicate-hop:${gap.hopId}:${found.length}`],
      duplicates: found,
    }
  return { hop: first, errors: hopErrors(first), duplicates: [] }
}

function verifiedHop(hop: HopObservation): boolean {
  return (
    hop.state === 'verified' &&
    hop.fragments.length > 0 &&
    hop.fragments.every(fragment => fragment.status === 'pass' && fragment.evidence.length > 0)
  )
}

export function aggregatePath(
  input: Readonly<{
    hops: readonly HopObservation[]
    scenarios: readonly ScenarioResult[]
    structureErrors?: readonly string[]
  }>,
): PathReport {
  const normalized = observeHops([], []).map(gap => normalizeHop(gap, input.hops))
  const hops = normalized.map(result => result.hop)
  const structureErrors = [
    ...(input.structureErrors ?? []),
    ...normalized.flatMap(result => result.errors),
  ]
  for (const id of REQUIRED_SCENARIOS) {
    const count = input.scenarios.filter(result => result.scenarioId === id).length
    if (count !== 1) structureErrors.push(`scenario-count:${id}:${count}`)
  }
  const checksPassed =
    structureErrors.length === 0 &&
    input.scenarios.every(result => result.status === 'executed' && result.matchesExpected) &&
    hops.every(
      hop => hop.state !== 'failed' && hop.fragments.every(fragment => fragment.status === 'pass'),
    )
  const fullPath =
    structureErrors.length === 0 && hops.every(verifiedHop) ? 'complete' : 'incomplete'
  return {
    checksPassed,
    fullPath,
    hops,
    scenarios: input.scenarios,
    gaps: hops.filter(hop => hop.state !== 'verified').map(hop => hop.hopId),
    structureErrors,
    duplicateObservations: normalized.flatMap(result => result.duplicates),
  }
}
