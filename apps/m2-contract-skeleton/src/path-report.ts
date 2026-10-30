import { CONFORMANCE_OBLIGATIONS } from '@omne-harness/model-contract/conformance'
import {
  evidenceOf,
  HOP_IDS,
  NOT_REACHED,
  type FirstPathHop,
  type FirstPathObservation,
} from './hops.ts'
import { GOVERNANCE_SCENARIOS, REQUIRED_SCENARIOS, type ScenarioResult } from './scenarios.ts'

export { HOP_IDS }
export type HopId = FirstPathHop
export type FragmentObservation = Readonly<{
  fragmentId: string
  status: 'pass' | 'fail' | 'not-applicable'
  evidence: string
}>
/**
 * What stands in a plugin-tree row of the application assembly page on this path: the member's
 * real implementation, a `./testing` double or a stand-in of this application, or nothing.
 */
export type Realization = 'real' | 'double' | 'absent'
/** A plugin-tree row of the application assembly page that some hop of this path crosses. */
export type RowId = (typeof HOP_DEFINITIONS)[number]['rows'][number]
/** The caller's declaration of the realization of each plugin-tree row it wired. */
export type RealizationTable = Readonly<Partial<Record<RowId, Realization>>>
export type RowRealization = Readonly<{ row: RowId; realization: Realization | 'undeclared' }>
export type HopObservation = Readonly<{
  hopId: HopId
  publicEntry: string
  responsibility: string
  ownerCards: readonly string[]
  reason: string
  /** The rows of the plugin tree that the hop crosses, by the row ids of the assembly page. */
  rows: readonly RowId[]
  /** The declared realization of each row on this invocation. */
  realization: readonly RowRealization[]
  state: 'verified' | 'gap' | 'failed'
  /** The blocking residual gaps that keep this hop a gap although its fragments pass. */
  blockedBy: readonly string[]
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
    rows: ['server-entry', 'identity'],
  },
  {
    hopId: 'H02',
    publicEntry: '@omne-harness/public-contract; @omne-harness/identity',
    responsibility: 'log in and recognize the tenant',
    ownerCards: [319, 659],
    reason: 'SPEC.md#h02',
    rows: ['server-entry', 'identity'],
  },
  {
    hopId: 'H03',
    publicEntry: '@omne-harness/public-contract; @omne-harness/session-contract',
    responsibility: 'create the session through the session codec, with the injected access check',
    ownerCards: [685, 536, 680],
    reason: 'SPEC.md#h03',
    rows: ['server-entry', 'authorization', 'session-storage', 'session-provider', 'session-ad10'],
  },
  {
    hopId: 'H04',
    publicEntry:
      '@omne-harness/public-contract; @omne-harness/session-contract; @omne-harness/agent',
    responsibility: 'first request through the session codec, Run start and hand-over to Agent',
    ownerCards: [685, 536, 502],
    reason: 'SPEC.md#h04',
    rows: [
      'server-entry',
      'session-provider',
      'session-ad14',
      'agent-adoptions',
      'agent-host',
      'session-handoff',
    ],
  },
  {
    hopId: 'H05',
    publicEntry:
      '@omne-harness/agent; @omne-harness/request-context-contract; @omne-harness/model-contract',
    responsibility: 'Agent assembles through Request Context and sends the Model call',
    ownerCards: [502, 676],
    reason: 'SPEC.md#h05',
    rows: [
      'agent-host',
      'session-conditions',
      'agent-model-selection',
      'session-ad04',
      'agent-context',
      'request-context',
      'model-host',
    ],
  },
  {
    hopId: 'H06',
    publicEntry: '@omne-harness/model-contract; @omne-harness/agent',
    responsibility:
      'Model result is pushed to the host receiver, written as a received entry, and the loop continues from it',
    ownerCards: [683, 787, 502],
    reason: 'SPEC.md#h06',
    rows: ['model-host', 'agent-host', 'agent-journal'],
  },
  {
    hopId: 'H07',
    publicEntry: '@omne-harness/agent-contract; @omne-harness/session-contract',
    responsibility: 'Agent reply enters the Session journal',
    ownerCards: [502, 536],
    reason: 'SPEC.md#h07',
    rows: ['session-handoff', 'session-ad01'],
  },
  {
    hopId: 'H08',
    publicEntry: '@omne-harness/public-contract; @omne-harness/session-contract',
    responsibility: 'history read through the session codec returns the pure-message replies',
    ownerCards: [685, 536],
    reason: 'SPEC.md#h08',
    rows: ['server-entry', 'session-provider'],
  },
  {
    hopId: 'H09',
    publicEntry: '@omne-harness/session-contract; @omne-harness/agent',
    responsibility: 'the later rounds of the session: a Run and a reply for each input',
    ownerCards: [536, 756, 502],
    reason: 'SPEC.md#h09',
    rows: ['session-provider', 'session-ad02', 'session-ad14', 'agent-host'],
  },
  {
    hopId: 'H10',
    publicEntry:
      '@omne-harness/agent; @omne-harness/tool-contract; @omne-harness/execution-environment-contract',
    responsibility:
      'Model requests a tool, Tool runs it in the execution environment, the result returns to the Model',
    ownerCards: [502, 791],
    reason: 'SPEC.md#h10',
    rows: [
      'agent-host',
      'tool-runtime',
      'tool-executor',
      'tool-environments',
      'execution-environment',
      'execution-files',
    ],
  },
  {
    hopId: 'H11',
    publicEntry: '@omne-harness/agent; @omne-harness/model-contract',
    responsibility:
      'the Agent instance is withdrawn during a Model call and assembled again; the call is not re-sent and the loop continues from the Journal',
    ownerCards: [502, 787, 746],
    reason: 'SPEC.md#h11',
    rows: ['agent-host', 'agent-instances', 'model-host'],
  },
  {
    hopId: 'H12',
    publicEntry: '@omne-harness/model-contract; @omne-harness/agent',
    responsibility: 'a reply with reasoning is consumed and the next request replays its state',
    ownerCards: [502, 683],
    reason: 'SPEC.md#h12',
    rows: ['model-host', 'agent-host', 'session-ad04'],
  },
  {
    hopId: 'H13',
    publicEntry: '@omne-harness/session-adapters; @omne-harness/session-contract',
    responsibility: 'the Agent records of the round are read from the Session log',
    ownerCards: [756],
    reason: 'SPEC.md#h13',
    rows: ['agent-journal', 'session-ad02'],
  },
] as const satisfies readonly Readonly<{
  hopId: HopId
  publicEntry: string
  responsibility: string
  ownerCards: readonly number[]
  reason: string
  rows: readonly string[]
}>[]

/**
 * What the connected path does not include. A blocking gap names a part that the card requires for
 * the hop, so the hop stays a gap even when every fragment passes. A non-blocking gap names a part
 * that the card lets this application call directly or leave out. `owners` lists open cards only;
 * a gap without an open implementation card names the M2 milestone card (#784).
 */
export type ResidualGap = Readonly<{
  gapId: string
  hops: readonly HopId[]
  owners: readonly string[]
  blocking: boolean
  reason: string
}>

export const RESIDUAL_GAPS = [
  {
    gapId: 'GAP-SESSION-WIRE',
    hops: ['H03', 'H04', 'H08'],
    owners: [card(784)],
    blocking: false,
    reason: 'SPEC.md#gap-session-wire',
  },
  {
    gapId: 'GAP-SESSION-COORDINATOR',
    hops: ['H04', 'H07', 'H09'],
    owners: [card(784)],
    blocking: false,
    reason: 'SPEC.md#gap-session-coordinator',
  },
  {
    gapId: 'GAP-RUN-COMPLETED',
    hops: ['H07'],
    owners: [card(784)],
    blocking: false,
    reason: 'SPEC.md#gap-run-completed',
  },
  {
    gapId: 'GAP-AGENT-CONTEXT',
    hops: ['H05'],
    owners: [card(542)],
    blocking: false,
    reason: 'SPEC.md#gap-agent-context',
  },
  {
    gapId: 'GAP-RECEIVE-SURFACE',
    hops: ['H06'],
    owners: [card(502), card(795)],
    blocking: false,
    reason: 'SPEC.md#gap-receive-surface',
  },
  {
    gapId: 'GAP-SECOND-RUN',
    hops: ['H09'],
    owners: [card(784), card(502)],
    blocking: true,
    reason: 'SPEC.md#gap-second-run',
  },
  {
    gapId: 'GAP-TOOL-LOOP',
    hops: ['H10'],
    owners: [card(520), card(524), card(525), card(526), card(528)],
    blocking: true,
    reason: 'SPEC.md#gap-tool-loop',
  },
  {
    gapId: 'GAP-AGENT-REASSEMBLY',
    hops: ['H11'],
    owners: [card(502)],
    blocking: true,
    reason: 'SPEC.md#gap-agent-reassembly',
  },
  {
    gapId: 'GAP-REASONING-REPLAY',
    hops: ['H12'],
    owners: [card(502)],
    blocking: true,
    reason: 'SPEC.md#gap-reasoning-replay',
  },
  {
    gapId: 'GAP-SESSION-LOG-TARGETS',
    hops: ['H13'],
    owners: [card(784)],
    blocking: true,
    reason: 'SPEC.md#gap-session-log-targets',
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

function blockingGaps(
  hopId: HopId,
  residual: readonly ResidualGap[] = RESIDUAL_GAPS,
): readonly string[] {
  return residual
    .filter(gap => gap.blocking && (gap.hops as readonly HopId[]).includes(hopId))
    .map(gap => gap.gapId)
}

/**
 * A hop the path did not reach, or that a blocking residual gap names, is a gap; its fragments
 * keep the evidence of what the path met there. A reached, unblocked hop with a failing fragment
 * is failed; otherwise it is verified.
 */
function stateOf(
  fragments: readonly FragmentObservation[],
  reached: boolean,
  blockedBy: readonly string[],
): HopObservation['state'] {
  if (!reached || blockedBy.length > 0) return 'gap'
  return fragments.every(fragment => fragment.status === 'pass') ? 'verified' : 'failed'
}

function realizationOf(
  rows: readonly RowId[],
  declared: RealizationTable,
): readonly RowRealization[] {
  return rows.map(row => ({ row, realization: declared[row] ?? 'undeclared' }))
}

/**
 * Builds one observation per hop from the connected path, the governance protocol scenarios and the
 * public Model obligations. A hop that the path did not reach is a gap. A reached hop with any
 * failing fragment is failed. A reached hop whose fragments pass stays a gap while a blocking
 * residual gap names it. `realization` is the caller's declaration of what stands in each row.
 */
export function observeHops(
  path: FirstPathObservation | null,
  governance: readonly ScenarioResult[],
  model: readonly FragmentObservation[],
  realization: RealizationTable = {},
): readonly HopObservation[] {
  return HOP_DEFINITIONS.map(definition => {
    const ids = requiredFragments(definition.hopId)
    const connected = path === null ? null : (path[definition.hopId] ?? NOT_REACHED)
    const reached = connected !== null && connected.kind !== 'not-reached'
    const own: FragmentObservation[] =
      connected === null
        ? []
        : [
            {
              fragmentId: CONNECTED(definition.hopId),
              status: connected.kind === 'connected' ? 'pass' : 'fail',
              evidence: evidenceOf(connected).join(' | '),
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
    const blockedBy = blockingGaps(definition.hopId)
    return {
      ...definition,
      ownerCards: definition.ownerCards.map(card),
      realization: realizationOf(definition.rows, realization),
      state: stateOf(fragments, reached, blockedBy),
      blockedBy,
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
    hop.ownerCards.length === 0 ||
    hop.rows.length === 0
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
    realization: realizationOf(definition.rows, {}),
    state: 'gap',
    blockedBy: blockingGaps(hopId),
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

function verifiedHop(hop: HopObservation, residual: readonly ResidualGap[]): boolean {
  return (
    hop.state === 'verified' &&
    blockingGaps(hop.hopId, residual).length === 0 &&
    hop.fragments.some(fragment => fragment.fragmentId === CONNECTED(hop.hopId)) &&
    hop.fragments.every(fragment => fragment.status === 'pass' && fragment.evidence.length > 0)
  )
}

export function aggregatePath(
  input: Readonly<{
    hops: readonly HopObservation[]
    scenarios: readonly ScenarioResult[]
    structureErrors?: readonly string[]
    /** The residual gap table. Default: `RESIDUAL_GAPS`. Tests replace it to reach both outcomes. */
    residualGaps?: readonly ResidualGap[]
  }>,
): PathReport {
  const residual = input.residualGaps ?? RESIDUAL_GAPS
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
    structureErrors.length === 0 && hops.every(hop => verifiedHop(hop, residual))
      ? 'complete'
      : 'incomplete'
  return {
    checksPassed,
    fullPath,
    hops,
    scenarios: input.scenarios,
    gaps: hops.filter(hop => !verifiedHop(hop, residual)).map(hop => hop.hopId),
    residualGaps: residual,
    structureErrors,
    duplicateObservations: normalized.flatMap(result => result.duplicates),
  }
}
