// task context 的只读视图：检查与测量从这里取基线和逐任务审计范围。
// 文件由流程工具的 start 写在 git 目录下；这里只解析检查用到的字段，写入与完整校验归流程工具。
// 字段缺失或类型不对时报错，不当作没有 context。
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { repositoryEnv } from './git-environment.ts'
import { git } from './git.ts'

export const TASK_CONTEXT_FILE = 'omne-integration-context.json'

export class TaskContextError extends Error {
  override name = 'TaskContextError'
  readonly code: 'input-error' | 'stale'
  constructor(code: 'input-error' | 'stale', message: string) {
    super(message)
    this.code = code
  }
}

/** 审计用到的任务绑定字段。 */
export type TaskContextBinding = {
  issue: { url: string }
  revision: number
  attempt: string
  taskBase: string
  writeScope: string[]
}
export type TaskContextAudit = { binding: TaskContextBinding; taskSource: string }
export type TaskContext = {
  root: string
  gitDir: string
  branch: string
  targetBase: string
  tasks: TaskContextAudit[]
  ownerTask: TaskContextBinding | null
  operation: string | null
}
export type Baselines = {
  state: 'pending' | 'bound'
  targetBase: string | undefined
  audits: TaskContextAudit[]
}

type Fields = Record<string, unknown>

function record(value: unknown, path: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TaskContextError('input-error', `${path} must be an object`)
  return value as Fields
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0'))
    throw new TaskContextError('input-error', `${path} must be a nonempty string`)
  return value
}
function sha(value: unknown, path: string): string {
  const result = text(value, path)
  if (!/^[0-9a-f]{40}$/.test(result))
    throw new TaskContextError('input-error', `${path} must be a full SHA-1`)
  return result
}
function binding(value: unknown, path: string): TaskContextBinding {
  const v = record(value, path)
  const revision = v['revision']
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1)
    throw new TaskContextError('input-error', `${path}.revision must be a positive integer`)
  const writeScope = v['writeScope']
  if (!Array.isArray(writeScope) || writeScope.length === 0)
    throw new TaskContextError('input-error', `${path}.writeScope must be a nonempty array`)
  return {
    issue: { url: text(record(v['issue'], `${path}.issue`)['url'], `${path}.issue.url`) },
    revision,
    attempt: text(v['attempt'], `${path}.attempt`),
    taskBase: sha(v['taskBase'], `${path}.taskBase`),
    writeScope: writeScope.map(item => text(item, `${path}.writeScope`)),
  }
}

export function parseTaskContext(value: unknown): TaskContext {
  const v = record(value, 'context')
  if (v['schemaVersion'] !== 1)
    throw new TaskContextError('input-error', 'context.schemaVersion must be 1')
  const tasks = v['tasks']
  if (!Array.isArray(tasks))
    throw new TaskContextError('input-error', 'context.tasks must be an array')
  return {
    root: text(v['root'], 'context.root'),
    gitDir: text(v['gitDir'], 'context.gitDir'),
    branch: typeof v['branch'] === 'string' ? v['branch'] : text(v['branch'], 'context.branch'),
    targetBase: sha(v['targetBase'], 'context.targetBase'),
    tasks: tasks.map((item, index) => {
      const audit = record(item, `context.tasks[${index}]`)
      return {
        binding: binding(audit['binding'], `context.tasks[${index}].binding`),
        taskSource: sha(audit['taskSource'], `context.tasks[${index}].taskSource`),
      }
    }),
    ownerTask: v['ownerTask'] === null ? null : binding(v['ownerTask'], 'context.ownerTask'),
    operation: v['operation'] === null ? null : text(v['operation'], 'context.operation'),
  }
}

function repository(root: string): { root: string; gitDir: string; branch: string; head: string } {
  const actual = realpathSync(git(root, ['rev-parse', '--show-toplevel']))
  return {
    root: actual,
    gitDir: realpathSync(resolve(actual, git(actual, ['rev-parse', '--git-dir']))),
    branch: git(actual, ['branch', '--show-current']),
    head: git(actual, ['rev-parse', 'HEAD']),
  }
}

function commitOf(root: string, ref: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      env: repositoryEnv(process.env),
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    if ((error as { status?: unknown }).status === 1) return null
    throw error
  }
}

export function taskContextPath(root: string): string {
  return join(repository(root).gitDir, TASK_CONTEXT_FILE)
}

/** Reads this tree's task context and checks that it belongs to this tree and branch. */
export function readTaskContext(root: string): TaskContext {
  const info = repository(root),
    path = join(info.gitDir, TASK_CONTEXT_FILE)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new TaskContextError('input-error', `${path} contains invalid JSON`)
    throw error
  }
  const context = parseTaskContext(raw)
  if (
    context.root !== info.root ||
    context.gitDir !== info.gitDir ||
    context.branch !== info.branch
  )
    throw new TaskContextError('stale', 'Context belongs to another tree or branch')
  return context
}

/**
 * Without a task context a tree checks against the explicit base, or the caller's default.
 * With one, the fixed targetBase and the task audits apply.
 */
export function baselines(root: string, explicitBase?: string): Baselines {
  if (!existsSync(taskContextPath(root)))
    return { state: 'pending', targetBase: explicitBase, audits: [] }
  const context = readTaskContext(root)
  if (explicitBase !== undefined && commitOf(root, explicitBase) !== context.targetBase)
    throw new TaskContextError('stale', 'Explicit base differs from fixed targetBase')
  return {
    state: 'bound',
    targetBase: context.targetBase,
    audits:
      context.operation === null && context.ownerTask !== null
        ? [{ binding: context.ownerTask, taskSource: repository(root).head }]
        : context.tasks,
  }
}

/** One audit range per task, plus the target's own edits since the fixed base. */
export function auditRanges(
  root: string,
  explicitBase?: string,
): { label: string; base: string; head: string }[] {
  const resolved = baselines(root, explicitBase)
  const ranges = resolved.audits.map(task => ({
    label: `${task.binding.issue.url}@${task.binding.revision}/${task.binding.attempt}`,
    base: task.binding.taskBase,
    head: task.taskSource,
  }))
  if (resolved.targetBase !== undefined)
    ranges.push({ label: 'target integration edits', base: resolved.targetBase, head: 'HEAD' })
  return ranges
}
