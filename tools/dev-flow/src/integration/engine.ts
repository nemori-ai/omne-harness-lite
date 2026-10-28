import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { taskWorkspace, writeContext, type Context } from './context.ts'
import {
  currentAdmission,
  deliveryConfig,
  readAuthority,
  currentTask,
  confirmConditions,
  admissionDigest,
} from './authority.ts'
import { factsSource, fetchDeliveryFacts } from './delivery-facts.ts'
import { maybeBlob, repository, requireAncestor } from './git.ts'
import { json, same, IntegrationError } from './parse.ts'
import type { Policy } from './policy.ts'
import { observeAdmission, type AdmissionCapture } from '../delivery/admission.ts'
import {
  attributeFindings,
  attributeRefusals,
  judgeAttributes,
  readCardAttributes,
  refusalLine,
  type AttributeFinding,
} from '../delivery/attributes.ts'
import { cardKind, cardLine, recordDispatch } from '../delivery/board.ts'
import { runGhCommand, type GhCommand } from '../delivery/github-read.ts'
import type { TaskBinding } from '../delivery/binding.ts'
import { LINES_PATH, parseDeliveryLines } from '../delivery/lines.ts'
import { conditionCardsOf } from '../delivery/observe.ts'
import { dispatchFieldGaps, type CapturedIssue, type DeliveryConfig } from '../delivery/protocol.ts'
import { taskStatus, taskSync } from './sync.ts'
import { checkUpstream } from './upstream.ts'

export type Command =
  | {
      kind: 'register' | 'start'
      authority: string
      issue: string
      revision: number
      attempt: string
    }
  | { kind: 'task-sync'; target: string }
export type Query =
  | { kind: 'status' }
  | { kind: 'baselines'; purpose: 'task-check' | 'audit' | 'sensor'; explicitBase?: string }
export type IntegrationEngine = {
  inspect(query: Query): Promise<unknown>
  execute(command: Command): Promise<unknown>
}

/** Receives one report line; reports never change a command result. */
export type ReportSink = (line: string) => void
const stderrSink: ReportSink = line => {
  process.stderr.write(`${line}\n`)
}
/** The Project write and clock that `start` uses for the board fields; tests replace them. */
export type BoardEffects = { call: GhCommand; now: () => Date }
const realBoard: BoardEffects = { call: runGhCommand, now: () => new Date() }
export async function openIntegration({
  root,
  report = stderrSink,
  board = realBoard,
}: {
  root: string
  report?: ReportSink
  board?: BoardEffects
}): Promise<IntegrationEngine> {
  const actual = repository(root).root
  return {
    async inspect(query) {
      switch (query.kind) {
        case 'status':
          return taskStatus(actual)
        case 'baselines':
          return baselines(actual, query.explicitBase)
      }
    },
    async execute(command) {
      switch (command.kind) {
        case 'register':
        case 'start':
          return start(actual, command, report, board)
        case 'task-sync':
          return taskSync(actual, command.target)
      }
    },
  }
}
async function start(
  root: string,
  command: Extract<Command, { kind: 'register' | 'start' }>,
  report: ReportSink,
  board: BoardEffects,
): Promise<Context> {
  const source = factsSource(process.env),
    state = taskWorkspace(root),
    config = deliveryConfig(root, state.policy, state.source),
    scope = { task: command.issue, authority: command.authority }
  // A cloud session cannot read the publish environment or the Project; the delivery-facts
  // workflow reads them once, before both admission captures, and both captures use that snapshot.
  const facts =
    source === 'workflow' ? await fetchDeliveryFacts(state.policy, config, scope) : undefined
  const capture = currentAdmission(config, scope, facts?.project)
  const decision = readAuthority(state.policy, command.authority, capture, facts?.authority)
  same(
    [
      decision.task.issue.url,
      decision.task.revision,
      decision.task.attempt,
      decision.task.dispatch,
    ],
    [command.issue, command.revision, command.attempt, command.authority],
    'Dispatch locator, revision or attempt mismatch',
  )
  const task = currentTask(capture, decision.task)
  same(task.binding, decision.task, 'Current task no longer matches dispatch')
  if (task.issue.state !== 'open')
    throw new IntegrationError('refused', 'Cannot dispatch a closed task')
  const gaps = dispatchFieldGaps(task.issue)
  if (gaps.length > 0) throw new IntegrationError('refused', `The card lacks ${gaps.join(', ')}`)
  const info = repository(root)
  same(info.branch, task.binding.branch, 'Task branch does not match this worktree')
  requireAncestor(root, task.binding.taskBase, info.head)
  const { ref: target, head: targetBase } = checkUpstream(root, state.policy, task.binding.route)
  confirmConditions(config, capture, task.binding, target, decision.confirmations, state.policy)
  const attributes = judgeCard({
    root,
    commit: state.source.commit,
    policy: state.policy,
    config,
    capture,
    task,
  })
  // Only a new context is refused; a rerun on a tree this task already bound keeps reporting.
  if (state.context === null && 'findings' in attributes) refuseAttributes(attributes)
  const { context, created } = bind(root, state.context, task.binding, info, targetBase, () =>
    same(
      admissionDigest(currentAdmission(config, scope, facts?.project)),
      admissionDigest(capture),
      'Task inputs changed during dispatch readback',
    ),
  )
  reportAttributes(attributes, task, report)
  // Only a new binding stamps Dispatched at; rerunning start on a bound tree keeps the first date.
  if (created) reportBoard({ config, cloud: source === 'workflow', task, report, board })
  return context
}
/** The context of an admitted task: the existing one for the same task, or a new one. */
function bind(
  root: string,
  existing: Context | null,
  binding: TaskBinding,
  info: ReturnType<typeof repository>,
  targetBase: string,
  readback: () => void,
): { context: Context; created: boolean } {
  if (existing !== null) {
    same(
      existing.ownerTask,
      binding,
      'Worktree is already bound to another task; explicit new tree required',
    )
    return { context: existing, created: false }
  }
  readback()
  const context: Context = {
    schemaVersion: 1,
    root: info.root,
    gitDir: info.gitDir,
    branch: info.branch,
    targetBase,
    tasks: [{ binding, taskSource: info.head }],
    ownerTask: binding,
    operation: null,
  }
  writeContext(root, context)
  return { context, created: true }
}
/** The attribute findings of an admitted task with its valid body line, or why there are none. */
type CardJudgement =
  | { findings: AttributeFinding[]; line: string | undefined }
  | { unavailable: string }
/**
 * Judges the attributes of an admitted task. The line table comes from the same commit as the
 * policy. A missing table or any failure gives `unavailable`: then nothing refuses.
 */
function judgeCard({
  root,
  commit,
  policy,
  config,
  capture,
  task,
}: {
  root: string
  commit: string
  policy: Policy
  config: DeliveryConfig
  capture: AdmissionCapture
  task: { binding: TaskBinding; issue: CapturedIssue }
}): CardJudgement {
  try {
    const file = maybeBlob(root, commit, LINES_PATH)
    if (file === null) return { unavailable: `Committed ${LINES_PATH} is missing` }
    const lines = parseDeliveryLines(json(file.text, LINES_PATH)),
      conditions = observeAdmission(config, capture, task.issue.url).cards[0]?.conditions ?? [],
      issues = new Map(capture.issues.map(issue => [issue.url, issue])),
      card = readCardAttributes(task.issue.body, task.issue)
    return {
      findings: attributeFindings({
        binding: task.binding,
        card,
        conditionCards: conditionCardsOf(conditions, issues),
        lines,
        registry: policy,
      }),
      line: judgeAttributes(card, lines).attributes.line,
    }
  } catch (error) {
    return {
      unavailable: error instanceof Error ? error.message : 'Attribute findings failed',
    }
  }
}
/**
 * Refuses a new context when `attributeRefusals` keeps any finding. The message lists each one
 * with its code, clause and remedy; nothing is written.
 */
function refuseAttributes(judgement: Extract<CardJudgement, { findings: unknown }>): void {
  const refusals = attributeRefusals(judgement.findings, judgement.line)
  if (refusals.length > 0)
    throw new IntegrationError(
      'refused',
      [
        `Attribute findings refuse a new context (${refusals.length}):`,
        ...refusals.map(refusalLine),
      ].join('\n'),
    )
}
/**
 * Writes the attribute findings of a started task, one JSON line each with severity `report`.
 * Without rules it writes one `attribute-rules-unavailable` line. Reports never change the start
 * result.
 */
function reportAttributes(
  judgement: CardJudgement,
  task: { issue: CapturedIssue },
  report: ReportSink,
): void {
  const findings =
    'findings' in judgement
      ? judgement.findings
      : [{ code: 'attribute-rules-unavailable', message: judgement.unavailable }]
  for (const finding of findings)
    try {
      report(JSON.stringify({ severity: 'report', issue: task.issue.url, ...finding }))
    } catch {
      // A failing report sink loses the report; it must not change the start result.
    }
}
/**
 * Writes the dispatched board fields (Dispatched at, Line, Kind and Wave as the config enables)
 * on the task's Project item after a new context, best effort.
 * The board entry comes from the delivery config this start already read; without it nothing
 * is written or reported. Every failure becomes a report line: a board write never refuses a
 * start or changes its result.
 */
function reportBoard({
  config,
  cloud,
  task,
  report,
  board,
}: {
  config: DeliveryConfig
  cloud: boolean
  task: { binding: TaskBinding; issue: CapturedIssue }
  report: ReportSink
  board: BoardEffects
}): void {
  const line = (finding: { code: string; message: string }) => {
    try {
      report(JSON.stringify({ severity: 'report', issue: task.issue.url, ...finding }))
    } catch {
      // A failing report sink loses the report; it must not change the start result.
    }
  }
  try {
    for (const finding of recordDispatch({
      config,
      cloud,
      issue: { id: task.binding.issue.id, url: task.binding.issue.url },
      line: cardLine(task.binding, readCardAttributes(task.issue.body, task.issue)),
      kind: cardKind(task.issue.labels),
      now: board.now(),
      call: board.call,
    }))
      line(finding)
  } catch (error) {
    line({
      code: 'board-write-failed',
      message: error instanceof Error ? error.message : 'Board write failed',
    })
  }
}
