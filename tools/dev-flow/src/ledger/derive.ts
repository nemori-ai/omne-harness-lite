/**
 * The ledger definitions: one pure derivation from parsed input files to the card, wave,
 * milestone and line tables of the delivery ledger. Field definitions come from
 * .meta_harness/human/map-reduce-delivery/research/synthesis.md「度量账本」. A change to any rule
 * here raises LEDGER_VERSION, and earlier milestones are derived again with the new version.
 */
import { section, IntegrationError } from '../integration/parse.ts'
import { readCardAttributes } from '../delivery/attributes.ts'
import { readTaskBinding } from '../delivery/binding.ts'
import { singleLabel, type CapturedIssue, type DeliveryCapture } from '../delivery/protocol.ts'

export const LEDGER_VERSION = '1'

/** The four roles of session usage (synthesis.md「卡级」: worker, review, coordinator, reduce). */
type Role = 'worker' | 'review' | 'coordinator' | 'reduce'
type UsageColumn = `tokens_in_${Role}` | `tokens_out_${Role}` | `cost_usd_${Role}`
/** The same value in every usage column. */
function usageCells<T>(value: T): Record<UsageColumn, T> {
  return {
    tokens_in_worker: value,
    tokens_out_worker: value,
    cost_usd_worker: value,
    tokens_in_review: value,
    tokens_out_review: value,
    cost_usd_review: value,
    tokens_in_coordinator: value,
    tokens_out_coordinator: value,
    cost_usd_coordinator: value,
    tokens_in_reduce: value,
    tokens_out_reduce: value,
    cost_usd_reduce: value,
  }
}

export const CARD_COLUMNS = [
  'card',
  'attempts',
  'line',
  'kind',
  'wave',
  'milestone',
  'plan_version',
  'change_ids',
  't_dispatch',
  't_deliver',
  't_integrating',
  't_accept',
  'cycle_days',
  't_in_line_h',
  't_in_reduce_h',
  't_sync',
  'S_sync_min',
  'S_admit_min',
  'S_gate_min',
  'S_accept_min',
  'a',
  'admit_fail',
  'first_pass',
  'map_a',
  'map_admit_fail',
  'map_S_admit_min',
  'map_admission_evidence',
  'map_fix_rounds',
  'reduce_fix_rounds',
  'rework_cause',
  'findings_by_severity',
  'review_density',
  'decomp_errors',
  'decision_requested_at',
  'decided_at',
  'tokens_in_worker',
  'tokens_out_worker',
  'cost_usd_worker',
  'tokens_in_review',
  'tokens_out_review',
  'cost_usd_review',
  'tokens_in_coordinator',
  'tokens_out_coordinator',
  'cost_usd_coordinator',
  'tokens_in_reduce',
  'tokens_out_reduce',
  'cost_usd_reduce',
  'session_restarts',
  'named_exceptions',
  'contract_change_declared',
  'contract_change_measured',
  'host_checks',
] as const satisfies readonly string[]
export const WAVE_COLUMNS = [
  'wave',
  'n',
  'P',
  'T_freeze',
  'T_wave',
  'L_max_h',
  'L_med_h',
  'L_min_h',
  'sum_S_min',
  'f',
  'lambda',
  'W',
  'L_q',
  'Q_over',
  'idle_seat_time_h',
  'skeleton_hops_real',
  'skeleton_hops_total',
  'decomp_pre',
  'decomp_post',
  'attempts_extra',
  'redispatches',
  'signals_triggered',
] as const
export const MILESTONE_COLUMNS = [
  'milestone',
  'plan_version',
  'co_interventions',
  'cycle_days_median',
  'cycle_days_p85',
  't_in_line_median_h',
  't_in_line_p85_h',
  't_in_reduce_median_h',
  't_in_reduce_p85_h',
  'p',
  'first_pass_rate',
  'fix_rounds_distribution',
  'rework_cause_shares',
  'review_density_median',
  'decomp_ratio',
  'decision_wait_median_h',
  'decision_wait_share',
  'cost_per_accepted_card',
  'first_e2e_ratio',
  'late_integration_defects',
  'forecast_percentile',
  'flaky_rate',
  'map_flaky_rate',
  'gate_median_min',
] as const
export const LINE_COLUMNS = ['line', 'cards', 'coordinator_tokens'] as const
export type CardColumn = (typeof CARD_COLUMNS)[number]
export type WaveColumn = (typeof WAVE_COLUMNS)[number]
export type MilestoneColumn = (typeof MILESTONE_COLUMNS)[number]
export type LineColumn = (typeof LINE_COLUMNS)[number]
/** One table row: every column holds its formatted cell; a missing value is the empty string. */
export type Row<C extends string> = Record<C, string>
/** Whether a column carries derived values in this run, or why it stays empty. */
export type FieldStatus = 'derived' | `missing:${string}`

/** The group of cards without a wave, and of cards without a line. */
export const MISSING_GROUP = '(missing)'

/** One test runner run: one run directory, or a fast directory with the slow one after it. */
export type AdmissionRun = {
  /** `<head>[-dirty]/<time>` of the run's first directory. */
  key: string
  /** The branch the run records (`meta.branch`), or null when its ledger.json records none. */
  branch: string | null
  wallSeconds: number
  /** True when any ledger of the run lists failures. */
  failed: boolean
}
export type AdmissionInput = {
  runs: readonly AdmissionRun[]
  /** Run directories that hold no ledger.json, such as an interrupted run. */
  directoriesWithoutLedger: number
}
/** One line of the test slot ledger, reduced to the fields the ledger reads. */
export type SlotRow = {
  event: 'ran' | 'gave-up'
  command: string
  cwd: string
  /** The card number of the task context, or null when the line has none or it is null. */
  issue: number | null
  exitCode: number | null
  endedAt: string
}
/** The Project fields of one card, from the board export file. */
export type BoardEntry = {
  wave?: string
  dispatchedAt?: string
  deliveredAt?: string
  acceptedAt?: string
  cycleDays?: number
}
export type LedgerInputs = {
  capture: DeliveryCapture
  /** Only cards whose milestone title equals this value; undefined takes every card. */
  milestone: string | undefined
  admission: AdmissionInput | undefined
  slots: readonly SlotRow[] | undefined
  board: ReadonlyMap<number, BoardEntry> | undefined
  /** The input files as given on the command line, for the meta file. */
  files: { capture: string; admission?: string; slots?: string; board?: string }
  generatedAt: string
}
export type LedgerMeta = {
  kind: 'delivery-ledger-meta'
  version: typeof LEDGER_VERSION
  generatedAt: string
  inputs: {
    capture: string
    admission: string | null
    slots: string | null
    board: string | null
    milestone: string | null
  }
  capture: {
    repository: string
    startedAt: string
    finishedAt: string
    issues: DeliveryCapture['collection']['issues']
    errors: number
    cards: number
  }
  timestamps: string
  /** Which input supplies `map_a` and `map_admit_fail`; `--admission` wins when both are given. */
  mapAdmissionSource: 'admission' | 'slots' | null
  /** Admission runs whose branch names no card; null without `--admission`. */
  unmappedAdmissionRuns: number | null
  admission: { runs: number; directoriesWithoutLedger: number } | null
  slots: { checkRows: number; unmappedCheckRows: number } | null
  fields: {
    cards: Record<CardColumn, FieldStatus>
    waves: Record<WaveColumn, FieldStatus>
    milestone: Record<MilestoneColumn, FieldStatus>
    lines: Record<LineColumn, FieldStatus>
  }
  notes: string[]
  /** Card-level input problems that left cells empty, such as a binding that does not parse. */
  warnings: string[]
}
export type Ledger = {
  cards: Row<CardColumn>[]
  waves: Row<WaveColumn>[]
  milestone: Row<MilestoneColumn>
  lines: Row<LineColumn>[]
  meta: LedgerMeta
}

/**
 * The fence marker of a dispatch decision. The owner of this marker is
 * tools/dev-flow/src/integration/authority.ts; this is a copy, and a new marker version there
 * must be copied here.
 */
const AUTHORITY_MARKER = 'omne-integration-authority:v1'
/** A handoff report: a comment with a line that starts with this heading. */
const HANDOFF = /^## 交接报告/m
/**
 * An acceptance decision: a line that starts with the decision field of
 * docs/engineering/delivery.md and the value accept, followed by the line end or a character
 * that is not an ASCII letter, such as `- 决定：accept（完整接受）`.
 */
const ACCEPT = /^[ \t]*-[ \t]*决定[：:][ \t]*accept(?![A-Za-z])/m
const LINE_STATE = '<!-- line-state -->'
/** A card number in a branch name or a directory path. */
const ISSUE_IN_PATH = /issue-([1-9]\d*)/
/** Slot ledger commands that count as an admission run. */
const CHECK_COMMAND = /^\.\/scripts\/check\.sh(?:\s|$)|pnpm run check(?:\s|$)/

const MISSING = {
  noPlanChanges: 'missing:no plan-changes record of the plan version in the inputs',
  noGateRuns: 'missing:gate runs are not in the inputs',
  noSyncRecord: 'missing:the integration node leaves no machine-readable sync record',
  noAcceptMarks: 'missing:acceptance start and end marks are not in the inputs',
  noFixRounds: 'missing:fix rounds have no machine-readable record',
  noReviews: 'missing:review reports and PR diffs are not in the inputs',
  noDecomp: 'missing:decomposition error records are not in the inputs',
  noDecisionMarkers: 'missing:no decision-requested and decision comment markers are adopted',
  noUsage: 'missing:the host does not export session usage',
  noExceptions: 'missing:acceptance records carry no machine-readable named exceptions',
  noSnapshot: 'missing:API snapshot comparisons are not in the inputs',
  noHostChecks: 'missing:host check results are not in the inputs',
  noReduceAdmission:
    'missing:reduce-side admission runs per batch; the test ledger and the slot ledger record no card number',
  noRedispatchReason:
    'missing:attempt records carry no redispatch reason; lost-session and admission-failure redispatches must be counted apart',
  noBoard: 'missing:no --board input',
  noAdmission: 'missing:no --admission input',
  noAdmissionOrSlots: 'missing:no --admission or --slots input',
  noMappedRun:
    'missing:no admission run maps to a card of the table (no meta.branch contains issue-<N>)',
  noSlots: 'missing:no --slots input',
  noSeats: 'missing:seat counts are not in the inputs',
  noFreeze: 'missing:freeze start times are not in the inputs',
  noQueue: 'missing:queue samples are not in the inputs',
  noSkeleton: 'missing:skeleton scenario reports are not in the inputs',
  noSignals: 'missing:assumption signals are not in the inputs',
  noForecast: 'missing:no archived forecast in the inputs',
} as const satisfies Record<string, FieldStatus>

/** The value at `percent` by the nearest-rank method; undefined for an empty sample. */
export function nearestRank(values: readonly number[], percent: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(1, Math.ceil((percent / 100) * sorted.length)) - 1]
}
const fixed1 = (value: number | undefined) => (value === undefined ? '' : value.toFixed(1))
const ratio = (value: number | undefined) => (value === undefined ? '' : value.toFixed(3))
const days = (value: number | undefined) =>
  value === undefined ? '' : Number.isInteger(value) ? String(value) : value.toFixed(1)
const flag = (value: boolean | undefined) => (value === undefined ? '' : String(value))
const count = (value: number | undefined) => (value === undefined ? '' : String(value))
const hoursBetween = (from: string | undefined, to: string | undefined) =>
  from === undefined || to === undefined
    ? undefined
    : (Date.parse(to) - Date.parse(from)) / 3_600_000
const daysBetweenDates = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const defined = <T>(values: readonly (T | undefined)[]): T[] =>
  values.flatMap(value => (value === undefined ? [] : [value]))
/** Group names in name order, with the missing group last. */
const groupOrder = (left: string, right: string) =>
  left === MISSING_GROUP ? 1 : right === MISSING_GROUP ? -1 : left.localeCompare(right)

/** The earliest `updatedAt` among the comments that match; undefined when none matches. */
function earliest(issue: CapturedIssue, matches: (body: string) => boolean): string | undefined {
  return issue.comments
    .filter(comment => matches(comment.body))
    .map(comment => comment.updatedAt)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0]
}
/**
 * The attempt of an authority block in a comment; undefined when the comment carries none.
 * It does not use the strict decision parser of integration/authority.ts: the ledger counts
 * every dispatch that was posted, so a block that `start` would refuse still counts when it
 * names an attempt, and a block that does not parse is skipped instead of failing the ledger.
 */
function authorityAttempt(body: string): string | undefined {
  let raw: unknown
  try {
    raw = section(body, AUTHORITY_MARKER)
  } catch (error) {
    if (error instanceof IntegrationError) return undefined
    throw error
  }
  if (typeof raw !== 'object' || raw === null || !('task' in raw)) return undefined
  const task: unknown = raw.task
  return typeof task === 'object' &&
    task !== null &&
    'attempt' in task &&
    typeof task.attempt === 'string'
    ? task.attempt
    : undefined
}

/** Line-side admission counts of one card. */
type MapAdmission = { a: number; fail: number; minutes: number | undefined }
type MapAdmissions = {
  source: LedgerMeta['mapAdmissionSource']
  byCard: Map<number, MapAdmission>
  unmapped: number
}

/** Line-side admission runs by card: `--admission` runs by branch, else `--slots` rows. */
function mapAdmissions(inputs: LedgerInputs): MapAdmissions {
  const byCard = new Map<number, MapAdmission>()
  const add = (card: number, failed: boolean, minutes: number | undefined) => {
    const entry = byCard.get(card) ?? { a: 0, fail: 0, minutes: undefined }
    entry.a += 1
    if (failed) entry.fail += 1
    if (minutes !== undefined) entry.minutes = (entry.minutes ?? 0) + minutes
    byCard.set(card, entry)
  }
  if (inputs.admission !== undefined) {
    let unmapped = 0
    for (const run of inputs.admission.runs) {
      const card = run.branch === null ? undefined : ISSUE_IN_PATH.exec(run.branch)?.[1]
      if (card === undefined) unmapped += 1
      else add(Number(card), run.failed, run.wallSeconds / 60)
    }
    return { source: 'admission', byCard, unmapped }
  }
  if (inputs.slots !== undefined) {
    for (const row of checkRows(inputs.slots)) {
      const card = slotCard(row)
      if (card !== undefined) add(card, row.exitCode !== 0, undefined)
    }
    return { source: 'slots', byCard, unmapped: 0 }
  }
  return { source: null, byCard, unmapped: 0 }
}
/** Slot rows of admission commands that ran. */
function checkRows(rows: readonly SlotRow[]): SlotRow[] {
  return rows.filter(row => row.event === 'ran' && CHECK_COMMAND.test(row.command))
}
/** The card of a slot row: its `issue` when a number, else `issue-<N>` in its directory. */
function slotCard(row: SlotRow): number | undefined {
  if (row.issue !== null) return row.issue
  const match = ISSUE_IN_PATH.exec(row.cwd)?.[1]
  return match === undefined ? undefined : Number(match)
}

/** What the comments of one card show, by the comment rules of SPEC.md. */
type CommentFacts = {
  attempts: number
  dispatched: string | undefined
  delivered: string | undefined
  accepted: string | undefined
  evidence: boolean | undefined
  restarts: number | undefined
}
function commentFacts(issue: CapturedIssue, bindingAttempt: string | undefined): CommentFacts {
  const attempts = new Set<string>(bindingAttempt === undefined ? [] : [bindingAttempt])
  for (const comment of issue.comments) {
    const attempt = authorityAttempt(comment.body)
    if (attempt !== undefined) attempts.add(attempt)
  }
  const handoffs = issue.comments.filter(comment => HANDOFF.test(comment.body))
  const lineStates = issue.comments.filter(comment => comment.body.includes(LINE_STATE)).length
  return {
    attempts: attempts.size,
    dispatched: earliest(issue, body => authorityAttempt(body) !== undefined),
    delivered: earliest(issue, body => HANDOFF.test(body)),
    accepted: earliest(issue, body => ACCEPT.test(body)),
    evidence:
      handoffs.length === 0
        ? undefined
        : handoffs.some(
            comment =>
              comment.body.includes('准入') &&
              (comment.body.includes('exit=0') || comment.body.includes('退出 0')),
          ),
    restarts:
      issue.labels.includes('level:delivery') && lineStates > 0 ? lineStates - 1 : undefined,
  }
}

/** The facts of one card that the aggregates read. */
type CardFacts = {
  number: number
  line: string
  wave: string
  attempts: number
  inLine: number | undefined
  inReduce: number | undefined
  cycleDays: number | undefined
  map: MapAdmission | undefined
}

function deriveCard({
  issue,
  inputs,
  admissions,
  warnings,
}: {
  issue: CapturedIssue
  inputs: LedgerInputs
  admissions: MapAdmissions
  warnings: string[]
}): { row: Row<CardColumn>; facts: CardFacts } {
  let binding: ReturnType<typeof readTaskBinding>
  try {
    binding = readTaskBinding(issue.body, {
      repository: inputs.capture.repository,
      id: issue.id,
      url: issue.url,
      number: issue.number,
    })
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error
    warnings.push(`#${issue.number}: the body binding does not parse (${error.message})`)
    binding = undefined
  }
  const attributes = readCardAttributes(issue.body, issue)
  const single = (values: readonly string[]) =>
    values.length === 1 && values[0] !== '' ? values[0] : undefined
  const line = binding?.schemaVersion === 2 ? binding.line : single(attributes.fields.line)
  const comments = commentFacts(issue, binding?.attempt)
  const board = inputs.board?.get(issue.number)
  const cycleDays =
    board?.cycleDays ??
    (board?.dispatchedAt !== undefined && board.acceptedAt !== undefined
      ? daysBetweenDates(board.dispatchedAt, board.acceptedAt)
      : undefined)
  const map = admissions.byCard.get(issue.number)
  const inLine = hoursBetween(comments.dispatched, comments.delivered),
    inReduce = hoursBetween(comments.delivered, comments.accepted)
  const row: Row<CardColumn> = {
    card: String(issue.number),
    attempts: String(comments.attempts),
    line: line ?? '',
    kind: singleLabel(issue.labels, 'kind:') ?? '',
    wave: board?.wave ?? '',
    milestone: issue.milestone ?? '',
    plan_version: '',
    change_ids: '',
    t_dispatch: comments.dispatched ?? '',
    t_deliver: comments.delivered ?? '',
    t_integrating: '',
    t_accept: comments.accepted ?? '',
    cycle_days: days(cycleDays),
    t_in_line_h: fixed1(inLine),
    t_in_reduce_h: fixed1(inReduce),
    t_sync: '',
    S_sync_min: '',
    S_admit_min: '',
    S_gate_min: '',
    S_accept_min: '',
    a: '',
    admit_fail: '',
    first_pass: '',
    map_a: count(map?.a),
    map_admit_fail: count(map?.fail),
    map_S_admit_min: fixed1(map?.minutes),
    map_admission_evidence: flag(comments.evidence),
    map_fix_rounds: '',
    reduce_fix_rounds: '',
    rework_cause: '',
    findings_by_severity: '',
    review_density: '',
    decomp_errors: '',
    decision_requested_at: '',
    decided_at: '',
    ...usageCells(''),
    session_restarts: count(comments.restarts),
    named_exceptions: '',
    contract_change_declared: single(attributes.fields.contractChange) ?? '',
    contract_change_measured: '',
    host_checks: '',
  }
  return {
    row,
    facts: {
      number: issue.number,
      line: line ?? MISSING_GROUP,
      wave: board?.wave ?? MISSING_GROUP,
      attempts: comments.attempts,
      inLine,
      inReduce,
      cycleDays,
      map,
    },
  }
}

function deriveWave(wave: string, cards: readonly CardFacts[]): Row<WaveColumn> {
  const lines = defined(cards.map(card => card.inLine))
  const max = lines.length === 0 ? undefined : Math.max(...lines)
  return {
    wave,
    n: String(cards.length),
    P: '',
    T_freeze: '',
    T_wave: '',
    L_max_h: fixed1(max),
    L_med_h: fixed1(nearestRank(lines, 50)),
    L_min_h: fixed1(lines.length === 0 ? undefined : Math.min(...lines)),
    sum_S_min: '',
    f: '',
    lambda: '',
    W: '',
    L_q: '',
    Q_over: '',
    idle_seat_time_h: max === undefined ? '' : fixed1(sum(lines.map(value => max - value))),
    skeleton_hops_real: '',
    skeleton_hops_total: '',
    decomp_pre: '',
    decomp_post: '',
    attempts_extra: String(sum(cards.map(card => Math.max(0, card.attempts - 1)))),
    redispatches: '',
    signals_triggered: '',
  }
}

/**
 * Among the cards of the table with a failed admission row in the slot ledger, the share whose
 * rows, in `endedAt` order, show a pass after the first failure.
 */
function mapFlakyRate(rows: readonly SlotRow[], cards: ReadonlySet<number>): number | undefined {
  const byCard = new Map<number, SlotRow[]>()
  for (const row of checkRows(rows)) {
    const card = slotCard(row)
    if (card !== undefined && cards.has(card)) byCard.set(card, [...(byCard.get(card) ?? []), row])
  }
  let failed = 0,
    recovered = 0
  for (const list of byCard.values()) {
    const ordered = [...list].sort(
      (left, right) => Date.parse(left.endedAt) - Date.parse(right.endedAt),
    )
    const first = ordered.findIndex(row => row.exitCode !== 0)
    if (first === -1) continue
    failed += 1
    if (ordered.slice(first + 1).some(row => row.exitCode === 0)) recovered += 1
  }
  return failed === 0 ? undefined : recovered / failed
}

function deriveMilestone(
  inputs: LedgerInputs,
  issues: readonly CapturedIssue[],
  facts: readonly CardFacts[],
): Row<MilestoneColumn> {
  const cycle = defined(facts.map(card => card.cycleDays)),
    inLine = defined(facts.map(card => card.inLine)),
    inReduce = defined(facts.map(card => card.inReduce))
  const titles = new Set(issues.map(issue => issue.milestone ?? ''))
  return {
    milestone: inputs.milestone ?? (titles.size === 1 ? ([...titles][0] ?? '') : ''),
    plan_version: '',
    co_interventions: '',
    cycle_days_median: days(nearestRank(cycle, 50)),
    cycle_days_p85: days(nearestRank(cycle, 85)),
    t_in_line_median_h: fixed1(nearestRank(inLine, 50)),
    t_in_line_p85_h: fixed1(nearestRank(inLine, 85)),
    t_in_reduce_median_h: fixed1(nearestRank(inReduce, 50)),
    t_in_reduce_p85_h: fixed1(nearestRank(inReduce, 85)),
    p: '',
    first_pass_rate: '',
    fix_rounds_distribution: '',
    rework_cause_shares: '',
    review_density_median: '',
    decomp_ratio: '',
    decision_wait_median_h: '',
    decision_wait_share: '',
    cost_per_accepted_card: '',
    first_e2e_ratio: '',
    late_integration_defects: '',
    forecast_percentile: '',
    flaky_rate: '',
    map_flaky_rate:
      inputs.slots === undefined
        ? ''
        : ratio(mapFlakyRate(inputs.slots, new Set(facts.map(card => card.number)))),
    gate_median_min: '',
  }
}

function deriveLines(facts: readonly CardFacts[]): Row<LineColumn>[] {
  const counts = new Map<string, number>()
  for (const card of facts) counts.set(card.line, (counts.get(card.line) ?? 0) + 1)
  return [...counts.keys()]
    .sort(groupOrder)
    .map(line => ({ line, cards: String(counts.get(line) ?? 0), coordinator_tokens: '' }))
}

function cardStatus(inputs: LedgerInputs, admissions: MapAdmissions, mapped: boolean) {
  const board: FieldStatus = inputs.board === undefined ? MISSING.noBoard : 'derived'
  const mapCounts: FieldStatus =
    admissions.source === null
      ? MISSING.noAdmissionOrSlots
      : admissions.source === 'slots' || mapped
        ? 'derived'
        : MISSING.noMappedRun
  return {
    card: 'derived',
    attempts: 'derived',
    line: 'derived',
    kind: 'derived',
    wave: board,
    milestone: 'derived',
    plan_version: MISSING.noPlanChanges,
    change_ids: MISSING.noPlanChanges,
    t_dispatch: 'derived',
    t_deliver: 'derived',
    t_integrating: MISSING.noGateRuns,
    t_accept: 'derived',
    cycle_days: board,
    t_in_line_h: 'derived',
    t_in_reduce_h: 'derived',
    t_sync: MISSING.noSyncRecord,
    S_sync_min: MISSING.noSyncRecord,
    S_admit_min: MISSING.noReduceAdmission,
    S_gate_min: MISSING.noGateRuns,
    S_accept_min: MISSING.noAcceptMarks,
    a: MISSING.noReduceAdmission,
    admit_fail: MISSING.noReduceAdmission,
    first_pass: MISSING.noReduceAdmission,
    map_a: mapCounts,
    map_admit_fail: mapCounts,
    map_S_admit_min:
      inputs.admission === undefined
        ? MISSING.noAdmission
        : mapped
          ? 'derived'
          : MISSING.noMappedRun,
    map_admission_evidence: 'derived',
    map_fix_rounds: MISSING.noFixRounds,
    reduce_fix_rounds: MISSING.noFixRounds,
    rework_cause: MISSING.noFixRounds,
    findings_by_severity: MISSING.noReviews,
    review_density: MISSING.noReviews,
    decomp_errors: MISSING.noDecomp,
    decision_requested_at: MISSING.noDecisionMarkers,
    decided_at: MISSING.noDecisionMarkers,
    ...usageCells<FieldStatus>(MISSING.noUsage),
    session_restarts: 'derived',
    named_exceptions: MISSING.noExceptions,
    contract_change_declared: 'derived',
    contract_change_measured: MISSING.noSnapshot,
    host_checks: MISSING.noHostChecks,
  } satisfies Record<CardColumn, FieldStatus>
}
function waveStatus(): Record<WaveColumn, FieldStatus> {
  return {
    wave: 'derived',
    n: 'derived',
    P: MISSING.noSeats,
    T_freeze: MISSING.noFreeze,
    T_wave: MISSING.noFreeze,
    L_max_h: 'derived',
    L_med_h: 'derived',
    L_min_h: 'derived',
    sum_S_min: MISSING.noReduceAdmission,
    f: MISSING.noFreeze,
    lambda: MISSING.noQueue,
    W: MISSING.noQueue,
    L_q: MISSING.noQueue,
    Q_over: MISSING.noQueue,
    idle_seat_time_h: 'derived',
    skeleton_hops_real: MISSING.noSkeleton,
    skeleton_hops_total: MISSING.noSkeleton,
    decomp_pre: MISSING.noDecomp,
    decomp_post: MISSING.noDecomp,
    attempts_extra: 'derived',
    redispatches: MISSING.noRedispatchReason,
    signals_triggered: MISSING.noSignals,
  }
}
function milestoneStatus(
  inputs: LedgerInputs,
  cards: Record<CardColumn, FieldStatus>,
): Record<MilestoneColumn, FieldStatus> {
  return {
    milestone: 'derived',
    plan_version: MISSING.noPlanChanges,
    co_interventions: MISSING.noPlanChanges,
    cycle_days_median: cards.cycle_days,
    cycle_days_p85: cards.cycle_days,
    t_in_line_median_h: 'derived',
    t_in_line_p85_h: 'derived',
    t_in_reduce_median_h: 'derived',
    t_in_reduce_p85_h: 'derived',
    p: MISSING.noReduceAdmission,
    first_pass_rate: MISSING.noReduceAdmission,
    fix_rounds_distribution: MISSING.noFixRounds,
    rework_cause_shares: MISSING.noFixRounds,
    review_density_median: MISSING.noReviews,
    decomp_ratio: MISSING.noDecomp,
    decision_wait_median_h: MISSING.noDecisionMarkers,
    decision_wait_share: MISSING.noDecisionMarkers,
    cost_per_accepted_card: MISSING.noUsage,
    first_e2e_ratio: MISSING.noSkeleton,
    late_integration_defects: MISSING.noDecomp,
    forecast_percentile: MISSING.noForecast,
    flaky_rate: MISSING.noReduceAdmission,
    map_flaky_rate: inputs.slots === undefined ? MISSING.noSlots : 'derived',
    gate_median_min: MISSING.noGateRuns,
  }
}

/** Derives the four tables and their meta from parsed inputs. Pure: it reads no file or clock. */
export function deriveLedger(inputs: LedgerInputs): Ledger {
  const issues = inputs.capture.issues
    .filter(issue => inputs.milestone === undefined || issue.milestone === inputs.milestone)
    .sort((left, right) => left.number - right.number)
  const admissions = mapAdmissions(inputs)
  const warnings: string[] = []
  const derived = issues.map(issue => deriveCard({ issue, inputs, admissions, warnings }))
  const facts = derived.map(item => item.facts)
  const waves = new Map<string, CardFacts[]>()
  for (const card of facts) waves.set(card.wave, [...(waves.get(card.wave) ?? []), card])
  const cardFields = cardStatus(
    inputs,
    admissions,
    facts.some(card => card.map !== undefined),
  )
  const slotChecks = inputs.slots === undefined ? undefined : checkRows(inputs.slots)
  return {
    cards: derived.map(item => item.row),
    waves: [...waves.keys()].sort(groupOrder).map(name => deriveWave(name, waves.get(name) ?? [])),
    milestone: deriveMilestone(inputs, issues, facts),
    lines: deriveLines(facts),
    meta: {
      kind: 'delivery-ledger-meta',
      version: LEDGER_VERSION,
      generatedAt: inputs.generatedAt,
      inputs: {
        capture: inputs.files.capture,
        admission: inputs.files.admission ?? null,
        slots: inputs.files.slots ?? null,
        board: inputs.files.board ?? null,
        milestone: inputs.milestone ?? null,
      },
      capture: {
        repository: inputs.capture.repository,
        startedAt: inputs.capture.startedAt,
        finishedAt: inputs.capture.finishedAt,
        issues: inputs.capture.collection.issues,
        errors: inputs.capture.collection.errors.length,
        cards: issues.length,
      },
      timestamps:
        'Event times are comment updatedAt values: the capture has no createdAt, so an edited comment reads later than it was posted.',
      mapAdmissionSource: admissions.source,
      unmappedAdmissionRuns: inputs.admission === undefined ? null : admissions.unmapped,
      admission:
        inputs.admission === undefined
          ? null
          : {
              runs: inputs.admission.runs.length,
              directoriesWithoutLedger: inputs.admission.directoriesWithoutLedger,
            },
      slots:
        slotChecks === undefined
          ? null
          : {
              checkRows: slotChecks.length,
              unmappedCheckRows: slotChecks.filter(row => slotCard(row) === undefined).length,
            },
      fields: {
        cards: cardFields,
        waves: waveStatus(),
        milestone: milestoneStatus(inputs, cardFields),
        lines: { line: 'derived', cards: 'derived', coordinator_tokens: MISSING.noUsage },
      },
      notes: [
        'map_* columns count line-side admission runs, mapped to cards by branch or slot ledger; they are not the reduce-side a, admit_fail and first_pass.',
        'attempts_extra counts attempts beyond the first, without the redispatch reason.',
        ...(inputs.admission !== undefined && inputs.slots !== undefined
          ? [
              'Both --admission and --slots were given: map_a and map_admit_fail come from --admission.',
            ]
          : []),
      ],
      warnings,
    },
  }
}
