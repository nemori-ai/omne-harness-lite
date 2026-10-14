import { policyHandoff, policyCheck, adoptPolicy } from './policy-adoption.ts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { prepare, seal, type Prepare } from './candidate.ts'
import { activationCheck, activate, bootstrap } from './adoption.ts'
import {
  baselines,
  contextPath,
  loadIntegration,
  requireCurrentAdoption,
  writeContext,
  type Legacy,
} from './context.ts'
import {
  currentAdmission,
  deliveryConfig,
  readAuthority,
  currentTask,
  confirmConditions,
  admissionDigest,
} from './authority.ts'
import { clean, repository, requireAncestor } from './git.ts'
import { activeTrack } from './policy.ts'
import { same, IntegrationError } from './parse.ts'
import { targetHead } from './transport.ts'
import { verify } from './verify.ts'
import { publish, resume } from './publish.ts'
import { registerTrack, bootstrapTrackPlan, bootstrapTrack, retireTrack } from './tracks.ts'

export type Command =
  | Prepare
  | { kind: 'bootstrap' | 'policy-handoff' | 'policy-check' }
  | {
      kind: 'register' | 'start'
      authority: string
      issue: string
      revision: number
      attempt: string
    }
  | { kind: 'seal' | 'verify' | 'resume'; operation: string }
  | {
      kind: 'publish' | 'activate' | 'track-bootstrap' | 'policy-adopt'
      operation: string
      authority: string
    }
  | { kind: 'activation-check'; legacy: Legacy[] }
  | { kind: 'track-register'; entry: unknown }
  | { kind: 'track-bootstrap-plan' | 'track-retire'; track: string }
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
          return loadIntegration(actual)
        case 'baselines':
          return baselines(actual, query.explicitBase)
      }
    },
    async execute(command) {
      switch (command.kind) {
        case 'policy-handoff':
          return policyHandoff(actual)
        case 'policy-check':
          return policyCheck(actual)
        case 'policy-adopt':
          return adoptPolicy(actual, command.operation, command.authority)
        case 'bootstrap':
          return bootstrap(actual)
        case 'register':
        case 'start':
          return start(actual, command)
        case 'prepare':
          return prepare(actual, command)
        case 'seal':
          return seal(actual, command.operation)
        case 'verify':
          return verify(actual, command.operation)
        case 'publish':
          return publish(actual, command.operation, command.authority)
        case 'resume':
          return resume(actual, command.operation)
        case 'activation-check':
          return activationCheck(actual, command.legacy)
        case 'activate':
          return activate(actual, command.operation, command.authority)
        case 'track-register':
          return registerTrack(actual, command.entry)
        case 'track-bootstrap-plan':
          return bootstrapTrackPlan(actual, command.track)
        case 'track-bootstrap':
          return bootstrapTrack(actual, command.operation, command.authority)
        case 'track-retire':
          return retireTrack(actual, command.track)
        default: {
          const exhaustive: never = command
          return exhaustive
        }
      }
    },
  }
}
function start(root: string, command: Extract<Command, { kind: 'register' | 'start' }>): unknown {
  const state = requireCurrentAdoption(root),
    config = deliveryConfig(root, state.policy, state.source),
    scope = { task: command.issue, authority: command.authority },
    capture = currentAdmission(config, scope)
  const decision = readAuthority(state.policy, command.authority, capture)
  if (decision.action !== 'dispatch')
    throw new IntegrationError('refused', 'Recorded dispatch authority required')
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
  const target =
    task.binding.route.kind === 'track'
      ? `refs/heads/${activeTrack(state.policy, task.binding.route.track).branch}`
      : 'refs/heads/main'
  const targetBase = targetHead(root, state.policy, target)
  if (targetBase === null)
    throw new IntegrationError('unknown', 'Task route target has not been bootstrapped')
  confirmConditions(
    config,
    capture,
    task.binding,
    'start',
    target,
    decision.confirmations,
    state.policy,
  )
  if (state.context !== null) {
    same(
      state.context.ownerTask,
      task.binding,
      'Worktree is already bound to another task; explicit new tree required',
    )
    return state.context
  }
  same(
    admissionDigest(currentAdmission(config, scope)),
    admissionDigest(capture),
    'Task inputs changed during dispatch readback',
  )
  const context = {
    schemaVersion: 1 as const,
    root: info.root,
    gitDir: info.gitDir,
    branch: info.branch,
    anchor: state.anchor,
    targetBase,
    tasks: [{ binding: task.binding, taskSource: info.head }],
    ownerTask: task.binding,
    operation: null,
  }
  writeContext(root, context)
  return context
}
