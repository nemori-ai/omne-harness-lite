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
import { attributeFindings, readCardAttributes } from '../delivery/attributes.ts'
import type { TaskBinding } from '../delivery/binding.ts'
import { LINES_PATH, parseDeliveryLines } from '../delivery/lines.ts'
import { conditionCardsOf } from '../delivery/observe.ts'
import type { CapturedIssue, DeliveryConfig } from '../delivery/protocol.ts'
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
export async function openIntegration({
  root,
  report = stderrSink,
}: {
  root: string
  report?: ReportSink
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
          return start(actual, command, report)
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
  const info = repository(root)
  same(info.branch, task.binding.branch, 'Task branch does not match this worktree')
  requireAncestor(root, task.binding.taskBase, info.head)
  const { ref: target, head: targetBase } = checkUpstream(root, state.policy, task.binding.route)
  confirmConditions(config, capture, task.binding, target, decision.confirmations, state.policy)
  const context = bind(root, state.context, task.binding, info, targetBase, () =>
    same(
      admissionDigest(currentAdmission(config, scope, facts?.project)),
      admissionDigest(capture),
      'Task inputs changed during dispatch readback',
    ),
  )
  reportAttributes({
    root,
    commit: state.source.commit,
    policy: state.policy,
    config,
    capture,
    task,
    report,
  })
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
): Context {
  if (existing !== null) {
    same(
      existing.ownerTask,
      binding,
      'Worktree is already bound to another task; explicit new tree required',
    )
    return existing
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
  return context
}
/**
 * Writes the attribute findings of an admitted task, one JSON line each with severity
 * `report`. The line table comes from the same commit as the policy. Any failure becomes one
 * `attribute-rules-unavailable` line: reports never refuse a start or change its result.
 */
function reportAttributes({
  root,
  commit,
  policy,
  config,
  capture,
  task,
  report,
}: {
  root: string
  commit: string
  policy: Policy
  config: DeliveryConfig
  capture: AdmissionCapture
  task: { binding: TaskBinding; issue: CapturedIssue }
  report: ReportSink
}): void {
  const line = (finding: { code: string; clause?: string; message: string }) => {
    try {
      report(JSON.stringify({ severity: 'report', issue: task.issue.url, ...finding }))
    } catch {
      // A failing report sink loses the report; it must not change the start result.
    }
  }
  try {
    const file = maybeBlob(root, commit, LINES_PATH)
    if (file === null) {
      line({ code: 'attribute-rules-unavailable', message: `Committed ${LINES_PATH} is missing` })
      return
    }
    const lines = parseDeliveryLines(json(file.text, LINES_PATH)),
      conditions = observeAdmission(config, capture, task.issue.url).cards[0]?.conditions ?? [],
      issues = new Map(capture.issues.map(issue => [issue.url, issue]))
    for (const finding of attributeFindings({
      binding: task.binding,
      card: readCardAttributes(task.issue.body, task.issue),
      conditionCards: conditionCardsOf(conditions, issues),
      lines,
      registry: policy,
    }))
      line(finding)
  } catch (error) {
    line({
      code: 'attribute-rules-unavailable',
      message: error instanceof Error ? error.message : 'Attribute findings failed',
    })
  }
}
