import { existsSync } from 'node:fs'
import type { Route, TaskBinding } from '../delivery/binding.ts'
import {
  contextPath,
  readContextFile,
  replaceTargetBase,
  taskWorkspace,
  type Context,
  type ContextFile,
} from './context.ts'
import { ancestor, clean, maybeRef, repository } from './git.ts'
import { IntegrationError } from './parse.ts'
import { registeredTrack, type Policy } from './policy.ts'
import { targetHead } from './transport.ts'

/** The remote branch a task route integrates into. */
export function routeTarget(policy: Policy, route: Route): string {
  return route.kind === 'track'
    ? `refs/heads/${registeredTrack(policy, route.track).branch}`
    : 'refs/heads/main'
}
/** Reads the current commit of the route target; an unreadable or missing branch is an error. */
export function remoteTarget(root: string, policy: Policy, ref: string): string {
  const head = targetHead(root, policy, ref)
  if (head === null)
    throw new IntegrationError('unknown', `Remote target branch ${ref} cannot be read`)
  return head
}

/** Where the fixed targetBase stands against the current remote target. */
export type TargetRelation = 'current' | 'behind' | 'diverged'
export type TaskStatus =
  | { bound: false; root: string; branch: string; head: string }
  | {
      bound: true
      root: string
      branch: string
      head: string
      issue: string
      revision: number
      attempt: string
      taskBase: string
      targetBase: string
      target: { ref: string; head: string }
      relation: TargetRelation
    }

function boundContext(root: string): { read: ContextFile; task: TaskBinding } {
  if (!existsSync(contextPath(root)))
    throw new IntegrationError('refused', 'This worktree is not bound to a task')
  const read = readContextFile(root),
    task = read.context.ownerTask
  if (task === null) throw new IntegrationError('unknown', 'Task context has no owner task')
  return { read, task }
}

/**
 * Reports this worktree's task context and the remote target branch.
 * An unbound tree reads nothing remote; a bound tree fails when the remote target cannot be read.
 */
export function taskStatus(root: string): TaskStatus {
  const info = repository(root),
    tree = { root: info.root, branch: info.branch, head: info.head }
  if (!existsSync(contextPath(root))) return { bound: false, ...tree }
  const { read, task } = boundContext(root),
    context = read.context,
    { policy } = taskWorkspace(root),
    ref = routeTarget(policy, task.route),
    head = remoteTarget(root, policy, ref)
  const relation: TargetRelation =
    context.targetBase === head
      ? 'current'
      : ancestor(root, context.targetBase, head)
        ? 'behind'
        : 'diverged'
  return {
    bound: true,
    ...tree,
    issue: task.issue.url,
    revision: task.revision,
    attempt: task.attempt,
    taskBase: task.taskBase,
    targetBase: context.targetBase,
    target: { ref, head },
    relation,
  }
}

/**
 * Moves this tree's targetBase forward to a target commit that the worktree has already merged.
 * Every refusal leaves the context file untouched. Syncing to the current targetBase is a no-op.
 */
export function taskSync(root: string, target: string): Context {
  const { read, task } = boundContext(root),
    { policy } = taskWorkspace(root),
    ref = routeTarget(policy, task.route),
    remote = remoteTarget(root, policy, ref)
  if (maybeRef(root, `${target}^{commit}`) === null)
    throw new IntegrationError('refused', `${target} is not a local commit; merge it first`)
  if (!ancestor(root, target, remote))
    throw new IntegrationError('refused', `${target} is not in the history of remote ${ref}`)
  const head = repository(root).head
  if (!ancestor(root, target, head))
    throw new IntegrationError('refused', `${target} is not merged into HEAD ${head}`)
  if (!ancestor(root, read.context.targetBase, target))
    throw new IntegrationError(
      'refused',
      `targetBase ${read.context.targetBase} is not an ancestor of ${target}; it can only move forward`,
    )
  clean(root)
  if (read.context.targetBase === target) return read.context
  return replaceTargetBase(read, target)
}
