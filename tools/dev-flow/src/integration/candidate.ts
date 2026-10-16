import { join } from 'node:path'
import { existsSync } from 'node:fs'
import {
  type TaskAudit,
  requireCurrentAdoption,
  writeContext,
  firstAdoptionCommit,
} from './context.ts'
import { activeTrack, type Mode } from './policy.ts'
import { same, sha, IntegrationError } from './parse.ts'
import { clean, git, GitError, parents, repository, requireAncestor } from './git.ts'
import {
  newOperation,
  operationHome,
  parseCandidate,
  readRecord,
  writeRecord,
  type Candidate,
} from './records.ts'
import { targetHead } from './transport.ts'
import { combineTasks, pendingPrefix, completePrefix } from './units.ts'

export type Source =
  | { kind: 'work' | 'main'; source: string }
  | { kind: 'track'; track: string; source: string }
export type Prepare = {
  kind: 'prepare'
  mode: Mode
  sources: Source[]
  track?: string
  checkpoint?: string
  declaredTasks?: TaskAudit[]
  initialAudit?: string
  title?: string
  provenance?: { harness: string; role: string }
}
export type Prepared =
  | { kind: 'candidate'; operation: string; candidate: Candidate }
  | { kind: 'conflict'; operation: string; subject: string }
export function validatePrepare(command: Prepare): Prepare {
  if (
    command.mode !== 'checkpoint' &&
    (command.checkpoint !== undefined || command.initialAudit !== undefined)
  )
    throw new IntegrationError(
      'input-error',
      'Only checkpoint mode accepts checkpoint or initialAudit',
    )
  if (command.mode !== 'fi' && command.track !== undefined)
    throw new IntegrationError('input-error', 'Only FI accepts a target track')
  if (command.sources.some(source => source.kind !== 'track' && 'track' in source))
    throw new IntegrationError('input-error', 'Only track sources accept track')
  if (command.title !== undefined && !/^[a-z]+(?:\([^()\r\n]+\))?!?: [^\r\n]+$/.test(command.title))
    throw new IntegrationError(
      'input-error',
      'Title must be type(scope): concrete result on one line',
    )
  if (
    command.provenance !== undefined &&
    Object.values(command.provenance).some(value => !/^[a-z][a-z0-9-]*$/.test(value))
  )
    throw new IntegrationError(
      'input-error',
      'Provenance requires actual host and role identifiers',
    )
  return command
}
function targetFor(state: ReturnType<typeof requireCurrentAdoption>, command: Prepare): string {
  const policy = state.policy
  switch (command.mode) {
    case 'fi':
      return `refs/heads/${activeTrack(policy, command.track ?? '').branch}`
    case 'ri':
    case 'joint':
      return 'refs/heads/main'
    case 'checkpoint':
      return 'refs/heads/stable'
    case 'work': {
      const task = state.context?.ownerTask
      if (task === undefined || task === null)
        throw new IntegrationError(
          'unknown',
          'Work publication requires one registered current task',
        )
      return task.route.kind === 'track'
        ? `refs/heads/${activeTrack(policy, task.route.track).branch}`
        : 'refs/heads/main'
    }
    case 'task-sync': {
      const task = state.context?.ownerTask
      if (task === undefined || task === null)
        throw new IntegrationError('unknown', 'Task sync requires a registered task')
      return `refs/heads/${task.branch}`
    }
  }
}
function sourceAudits(
  root: string,
  state: ReturnType<typeof requireCurrentAdoption>,
  command: Prepare,
  auditBase: string,
  currentMain: string,
  sources: string[],
): { tasks: TaskAudit[]; units: string[] } {
  const policy = state.policy
  const tasks: TaskAudit[] = [],
    units: string[] = []
  for (const source of command.sources) {
    if (source.kind === 'main') {
      if (!['fi', 'task-sync', 'checkpoint'].includes(command.mode))
        throw new IntegrationError('input-error', 'Mode does not accept a main source')
      requireAncestor(root, source.source, currentMain)
      if (command.mode === 'checkpoint') {
        const prefix = completePrefix(
          root,
          policy,
          'refs/heads/main',
          firstAdoptionCommit(root, state.anchor),
          source.source,
          auditBase,
          false,
        )
        tasks.push(...prefix.tasks)
        units.push(...prefix.units)
      }
    } else if (source.kind === 'track') {
      if (!['ri', 'joint', 'task-sync'].includes(command.mode))
        throw new IntegrationError('input-error', 'Mode does not accept a track source')
      const track = activeTrack(policy, source.track),
        tip = targetHead(root, policy, `refs/heads/${track.branch}`)
      if (tip === null) throw new IntegrationError('unknown', 'Track does not exist')
      requireAncestor(root, source.source, tip)
      const prefix = pendingPrefix(root, policy, source.track, source.source, auditBase)
      tasks.push(...prefix.tasks)
      units.push(...prefix.units)
    } else {
      if (
        command.mode !== 'work' ||
        state.context?.ownerTask === undefined ||
        state.context.ownerTask === null
      )
        throw new IntegrationError(
          'input-error',
          'Work source requires work mode and one registered task',
        )
      const task = { binding: state.context.ownerTask }
      requireAncestor(root, task.binding.taskBase, source.source)
      requireAncestor(root, source.source, repository(root).head)
      tasks.push({ binding: task.binding, taskSource: source.source })
    }
  }
  if (['fi', 'checkpoint', 'work', 'ri'].includes(command.mode) && sources.length !== 1)
    throw new IntegrationError('input-error', 'Mode requires exactly one source')
  if (
    command.mode === 'task-sync' &&
    state.context?.ownerTask !== null &&
    state.context?.ownerTask !== undefined
  ) {
    tasks.push({ binding: state.context.ownerTask, taskSource: auditBase })
    if (!sources.includes(auditBase)) sources.push(auditBase)
  }
  const taskSet = combineTasks(root, tasks)
  if (command.declaredTasks !== undefined)
    same(
      command.declaredTasks,
      taskSet,
      'Declared task set omits or changes a complete source task',
    )
  return { tasks: taskSet, units }
}
export function prepare(root: string, command: Prepare): Prepared {
  validatePrepare(command)
  const state = requireCurrentAdoption(root),
    policy = state.policy
  if (command.sources.length === 0)
    throw new IntegrationError('input-error', 'Candidate requires fixed sources')
  const sources = command.sources.map(source => sha(source.source))
  if (new Set(sources).size !== sources.length)
    throw new IntegrationError('input-error', 'Duplicate sources')
  const currentMain = targetHead(root, policy, 'refs/heads/main')
  if (currentMain === null) throw new IntegrationError('unknown', 'Authoritative main is missing')
  const target = targetFor(state, command)
  const expectedBase = targetHead(root, policy, target)
  if (expectedBase === null && command.mode !== 'checkpoint')
    throw new IntegrationError('unknown', 'Target requires explicit bootstrap')
  const auditBase =
    expectedBase ?? (command.initialAudit === undefined ? null : sha(command.initialAudit))
  if (auditBase === null)
    throw new IntegrationError('input-error', 'First stable checkpoint requires initialAudit')
  const { tasks: taskSet, units } = sourceAudits(
    root,
    state,
    command,
    auditBase,
    currentMain,
    sources,
  )
  const { operation, home } = newOperation(root),
    subject = join(home, 'subject')
  const draft: Candidate = {
    schemaVersion: 1,
    operation,
    mode: command.mode,
    target,
    expectedBase,
    auditBase,
    sources,
    candidate: auditBase,
    tree: auditBase,
    parents: [],
    tasks: taskSet,
    policy: state.source,
    anchor: state.anchor,
    subject,
    units,
    checkpoint: command.checkpoint ?? null,
    ownerTask:
      command.mode === 'work' || command.mode === 'task-sync'
        ? (state.context?.ownerTask ?? null)
        : null,
  }
  if (command.mode === 'checkpoint' && draft.checkpoint === null)
    throw new IntegrationError('input-error', 'Checkpoint requires an immutable checkpoint name')
  writeRecord(home, 'draft.json', draft)
  const selected = command.mode === 'checkpoint' ? sources[0] : auditBase
  if (selected === undefined) throw new IntegrationError('input-error', 'No selected commit')
  git(root, ['worktree', 'add', '--detach', subject, selected])
  if (command.mode !== 'checkpoint') {
    try {
      git(subject, ['merge', '--no-ff', '--no-commit', ...sources])
    } catch (error) {
      if (!(error instanceof GitError)) throw error
      if (git(subject, ['diff', '--name-only', '--diff-filter=U']) !== '')
        return { kind: 'conflict', operation, subject }
      throw error
    }
    git(subject, [
      'commit',
      '--allow-empty',
      '-m',
      `${command.title ?? `chore(integration): integrate ${operation}`}${command.provenance === undefined ? '' : `\n\nHarness: ${command.provenance.harness}\nAgent-Role: ${command.provenance.role}`}`,
    ])
  }
  return seal(root, operation)
}
export function seal(root: string, operation: string): Prepared {
  const home = operationHome(root, operation),
    draft = parseCandidate(readRecord(home, 'draft.json').value)
  if (existsSync(join(home, 'candidate.json')))
    return {
      kind: 'candidate',
      operation,
      candidate: parseCandidate(readRecord(home, 'candidate.json').value),
    }
  const measured = clean(draft.subject),
    parentList = parents(root, measured.head)
  requireAncestor(root, draft.auditBase, measured.head)
  for (const source of draft.sources) requireAncestor(root, source, measured.head)
  if (draft.mode !== 'checkpoint' && parentList[0] !== draft.auditBase)
    throw new IntegrationError('refused', 'Candidate first parent differs from fixed target base')
  if (draft.mode === 'checkpoint' && draft.sources[0] !== measured.head)
    throw new IntegrationError('refused', 'Stable cannot create an independent development commit')
  const candidate = { ...draft, candidate: measured.head, tree: measured.tree, parents: parentList }
  const info = repository(draft.subject)
  writeContext(draft.subject, {
    schemaVersion: 1,
    root: info.root,
    gitDir: info.gitDir,
    branch: info.branch,
    anchor: candidate.anchor,
    targetBase: candidate.auditBase,
    tasks: candidate.tasks,
    ownerTask: candidate.ownerTask,
    operation,
  })
  writeRecord(home, 'candidate.json', candidate)
  return { kind: 'candidate', operation, candidate }
}
