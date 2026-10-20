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
import { repository, requireAncestor } from './git.ts'
import { same, IntegrationError } from './parse.ts'
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

export async function openIntegration({ root }: { root: string }): Promise<IntegrationEngine> {
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
          return start(actual, command)
        case 'task-sync':
          return taskSync(actual, command.target)
      }
    },
  }
}
async function start(
  root: string,
  command: Extract<Command, { kind: 'register' | 'start' }>,
): Promise<Context> {
  const state = taskWorkspace(root),
    config = deliveryConfig(root, state.policy, state.source),
    scope = { task: command.issue, authority: command.authority }
  // A cloud session cannot read the publish environment or the Project; the delivery-facts
  // workflow reads them once, before both admission captures, and both captures use that snapshot.
  const facts =
    factsSource(process.env) === 'workflow'
      ? await fetchDeliveryFacts(state.policy, config, scope)
      : undefined
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
  if (state.context !== null) {
    same(
      state.context.ownerTask,
      task.binding,
      'Worktree is already bound to another task; explicit new tree required',
    )
    return state.context
  }
  same(
    admissionDigest(currentAdmission(config, scope, facts?.project)),
    admissionDigest(capture),
    'Task inputs changed during dispatch readback',
  )
  const context: Context = {
    schemaVersion: 1,
    root: info.root,
    gitDir: info.gitDir,
    branch: info.branch,
    targetBase,
    tasks: [{ binding: task.binding, taskSource: info.head }],
    ownerTask: task.binding,
    operation: null,
  }
  writeContext(root, context)
  return context
}
