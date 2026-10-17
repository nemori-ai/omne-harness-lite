import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { TASK_CONTEXT_FILE } from '@omne-harness/repo-toolchain/core/task-context'
import { parseTaskBinding, type TaskBinding } from '../delivery/binding.ts'
import { maybeBlob, repository } from './git.ts'
import { POLICY_PATH, parsePolicy, type Policy } from './policy.ts'
import {
  array,
  fields,
  json,
  literal,
  object,
  sha,
  string,
  digest,
  same,
  IntegrationError,
} from './parse.ts'

export type PolicySource = { commit: string; path: string; blob: string; digest: string }
export type TaskAudit = { binding: TaskBinding; taskSource: string }
export type Context = {
  schemaVersion: 1
  root: string
  gitDir: string
  branch: string
  targetBase: string
  tasks: TaskAudit[]
  ownerTask: TaskBinding | null
  /** Always null; kept because the shared context reader requires the field. */
  operation: string | null
}

function parseAudit(value: unknown): TaskAudit {
  const v = fields(value, ['binding', 'taskSource'], 'audit')
  return { binding: parseTaskBinding(v.binding), taskSource: sha(v.taskSource, 'taskSource') }
}
/**
 * Contexts written before the adoption path was retired also carry `anchor`.
 * The key is accepted and ignored so that existing worktrees keep reading their context.
 */
export function parseContext(value: unknown): Context {
  const v = fields(
    value,
    [
      'schemaVersion',
      'root',
      'gitDir',
      'branch',
      'anchor',
      'targetBase',
      'tasks',
      'ownerTask',
      'operation',
    ],
    'context',
  )
  if (v.anchor !== undefined && v.anchor !== null) sha(v.anchor, 'anchor')
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    root: string(v.root, 'root'),
    gitDir: string(v.gitDir, 'gitDir'),
    branch: typeof v.branch === 'string' ? v.branch : string(v.branch, 'branch'),
    targetBase: sha(v.targetBase, 'targetBase'),
    tasks: array(v.tasks, 'tasks').map(parseAudit),
    ownerTask: v.ownerTask === null ? null : parseTaskBinding(v.ownerTask),
    operation: v.operation === null ? null : string(v.operation, 'operation'),
  }
}
export function contextPath(root: string): string {
  return join(repository(root).gitDir, TASK_CONTEXT_FILE)
}
/** The parsed context of this tree with the exact bytes it was read from. */
export type ContextFile = {
  path: string
  bytes: string
  raw: Record<string, unknown>
  context: Context
}
export function readContextFile(root: string): ContextFile {
  const info = repository(root),
    path = contextPath(root),
    bytes = readFileSync(path, 'utf8'),
    raw = object(json(bytes, path), 'context'),
    context = parseContext(raw)
  same(
    [context.root, context.gitDir, context.branch],
    [info.root, info.gitDir, info.branch],
    'Context belongs to another tree or branch',
  )
  return { path, bytes, raw, context }
}
/** Reads this tree's task context and checks that it belongs to this tree and branch. */
function readContext(root: string): Context {
  return readContextFile(root).context
}
export type Workspace = {
  policy: Policy
  source: PolicySource
  context: Context | null
}
/**
 * Task admission reads the policy committed at this tree's HEAD.
 * Trunk publication is enforced by the platform; this check only keeps local work on its task.
 */
export function taskWorkspace(root: string): Workspace {
  const info = repository(root)
  const file = maybeBlob(root, info.head, POLICY_PATH)
  if (file === null) throw new IntegrationError('unknown', `Committed ${POLICY_PATH} is missing`)
  return {
    policy: parsePolicy(json(file.text, 'policy')),
    source: { commit: info.head, path: POLICY_PATH, blob: file.oid, digest: digest(file.text) },
    context: existsSync(contextPath(root)) ? readContext(root) : null,
  }
}
/** Creates the context of a newly bound tree; never overwrites an existing one. */
export function writeContext(root: string, context: Context): void {
  writeFileSync(contextPath(root), `${JSON.stringify(context, null, 2)}\n`, { flag: 'wx' })
}
/**
 * Replaces only `targetBase` of a context that was read as `read`. All other keys keep their
 * values and order. The new bytes go to a temporary file in the same directory that is then
 * renamed over the context, so a reader sees either the old or the new file.
 */
export function replaceTargetBase(read: ContextFile, targetBase: string): Context {
  const next = { ...read.raw, targetBase: sha(targetBase, 'targetBase') }
  const context = parseContext(next)
  const temporary = `${read.path}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  try {
    if (readFileSync(read.path, 'utf8') !== read.bytes)
      throw new IntegrationError('stale', 'Task context changed during task-sync')
    renameSync(temporary, read.path)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
  return context
}
