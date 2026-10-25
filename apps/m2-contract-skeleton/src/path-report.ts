import { CONFORMANCE_OBLIGATIONS } from '@omne-harness/model-contract/conformance'
import type { FirstPathObservation } from './path.ts'
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
    publicEntry: '@omne-harness/public-contract; @omne-harness/identity',
    responsibility: 'create the organization and tenant',
    ownerCards: [319, 659],
    reason: 'SPEC.md#h01',
  },
  {
    hopId: 'H02',
    publicEntry: '@omne-harness/public-contract; @omne-harness/identity',
    responsibility: 'log in and recognize the tenant',
    ownerCards: [319, 659],
    reason: 'SPEC.md#h02',
  },
  {
    hopId: 'H03',
    publicEntry: '@omne-harness/session-contract',
    responsibility: 'create the session',
    ownerCards: [536],
    reason: 'SPEC.md#h03',
  },
  {
    hopId: 'H04',
    publicEntry: '@omne-harness/session-contract; @omne-harness/agent',
    responsibility: 'first request, Run start and hand-over to Agent',
    ownerCards: [536, 502],
    reason: 'SPEC.md#h04',
  },
  {
    hopId: 'H05',
    publicEntry:
      '@omne-harness/agent; @omne-harness/request-context-contract; @omne-harness/model-contract',
    responsibility: 'Agent assembles through Request Context and sends the Model call',
    ownerCards: [502, 676],
    reason: 'SPEC.md#h05',
  },
  {
    hopId: 'H06',
    publicEntry: '@omne-harness/model-contract; @omne-harness/agent',
    responsibility: 'Model result reaches the Agent receiver and journal',
    ownerCards: [502, 672],
    reason: 'SPEC.md#h06',
  },
  {
    hopId: 'H07',
    publicEntry: '@omne-harness/agent-contract; @omne-harness/session-contract',
    responsibility: 'Agent reply enters the Session journal',
    ownerCards: [502, 536],
    reason: 'SPEC.md#h07',
  },
  {
    hopId: 'H08',
    publicEntry: '@omne-harness/session-contract',
    responsibility: 'history read returns the pure-message reply',
    ownerCards: [536],
    reason: 'SPEC.md#h08',
  },
] as const satisfies readonly Readonly<{
  hopId: HopId
  publicEntry: string
  responsibility: string
  ownerCards: readonly number[]
  reason: string
}>[]

/** What the connected path does not include. A residual gap does not stop a hop from being verified. */
export type ResidualGap = Readonly<{
  gapId: string
  hops: readonly HopId[]
  owners: readonly string[]
  reason: string
}>

export const RESIDUAL_GAPS = [
  {
    gapId: 'GAP-SESSION-WIRE',
    hops: ['H03', 'H04', 'H08'],
    owners: [card(685)],
    reason: 'SPEC.md#gap-session-wire',
  },
  {
    gapId: 'GAP-SESSION-COORDINATOR',
    hops: ['H04', 'H07'],
    owners: [card(536), card(756)],
    reason: 'SPEC.md#gap-session-coordinator',
  },
  {
    gapId: 'GAP-RUN-COMPLETED',
    hops: ['H07'],
    owners: [card(756)],
    reason: 'SPEC.md#gap-run-completed',
  },
  {
    gapId: 'GAP-AGENT-CONTEXT',
    hops: ['H05'],
    owners: [card(542), card(676)],
    reason: 'SPEC.md#gap-agent-context',
  },
  {
    gapId: 'GAP-RECEIVE-SURFACE',
    hops: ['H06'],
    owners: [card(672), card(502)],
    reason: 'SPEC.md#gap-receive-surface',
  },
] as const satisfies readonly ResidualGap[]

const CONNECTED = (hopId: HopId) => `${hopId}-connected`

function requiredFragments(hopId: HopId): readonly string[] {
  const own = [CONNECTED(hopId)]
  if (hopId === 'H01') return [...own, 'G1-register', 'G1-create']
  if (hopId === 'H02')
    return [
      ...own,
      ...GOVERNANCE_SCENARIOS.filter(id => id !== 'G1-register' && id !== 'G1-create'),
    ]
  return hopId === 'H06' ? [...own, ...CONFORMANCE_OBLIGATIONS] : own
}

function stateOf(
  fragments: readonly FragmentObservation[],
  reached: boolean,
): HopObservation['state'] {
  if (!reached) return 'gap'
  return fragments.every(fragment => fragment.status === 'pass') ? 'verified' : 'failed'
}

/**
 * Builds one observation per hop from the connected path, the governance protocol scenarios and the
 * public Model obligations. A hop that the path did not reach is a gap; a reached hop with any
 * failing fragment is failed.
 */
export function observeHops(
  path: FirstPathObservation | null,
  governance: readonly ScenarioResult[],
  model: readonly FragmentObservation[],
): readonly HopObservation[] {
  return HOP_DEFINITIONS.map(definition => {
    const ids = requiredFragments(definition.hopId)
    const connected = path?.[definition.hopId] ?? null
    const reached = connected !== null && !connected.evidence.includes('not-reached')
    const own: FragmentObservation[] =
      connected === null
        ? []
        : [
            {
              fragmentId: CONNECTED(definition.hopId),
              status: connected.connected ? 'pass' : 'fail',
              evidence: connected.evidence.join(' | '),
            },
          ]
    const extra: readonly FragmentObservation[] =
      definition.hopId === 'H06'
        ? model
        : governance
            .filter(result => ids.includes(result.scenarioId))
            .map(result => ({
              fragmentId: result.scenarioId,
              status:
                result.status === 'executed' && result.matchesExpected
                  ? ('pass' as const)
                  : ('fail' as const),
              evidence: `${result.scenarioId}:${result.evidence}`,
            }))
    const fragments = [...own, ...extra]
    return {
      ...definition,
      ownerCards: definition.ownerCards.map(card),
      state: stateOf(fragments, reached),
      fragments,
    }
  })
}

export type PathReport = Readonly<{
  checksPassed: boolean
  fullPath: 'complete' | 'incomplete'
  hops: readonly HopObservation[]
  scenarios: readonly ScenarioResult[]
  /** Hops that are not verified. */
  gaps: readonly HopId[]
  /** What the connected path does not include, with owners. */
  residualGaps: readonly ResidualGap[]
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

function missingHop(hopId: HopId): HopObservation {
  const definition = HOP_DEFINITIONS.find(item => item.hopId === hopId)
  if (definition === undefined) throw new Error(`unknown hop ${hopId}`)
  return {
    ...definition,
    ownerCards: definition.ownerCards.map(card),
    state: 'gap',
    fragments: [],
  }
}

function normalizeHop(hopId: HopId, observations: readonly HopObservation[]): NormalizedHop {
  const found = observations.filter(hop => hop.hopId === hopId)
  const first = found[0]
  if (first === undefined)
    return { hop: missingHop(hopId), errors: [`missing-hop:${hopId}`], duplicates: [] }
  if (found.length > 1)
    return {
      hop: { ...first, state: 'failed' },
      errors: [`duplicate-hop:${hopId}:${found.length}`],
      duplicates: found,
    }
  return { hop: first, errors: hopErrors(first), duplicates: [] }
}

function verifiedHop(hop: HopObservation): boolean {
  return (
    hop.state === 'verified' &&
    hop.fragments.some(fragment => fragment.fragmentId === CONNECTED(hop.hopId)) &&
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
  const normalized = HOP_IDS.map(hopId => normalizeHop(hopId, input.hops))
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
    gaps: hops.filter(hop => !verifiedHop(hop)).map(hop => hop.hopId),
    residualGaps: RESIDUAL_GAPS,
    structureErrors,
    duplicateObservations: normalized.flatMap(result => result.duplicates),
  }
}
