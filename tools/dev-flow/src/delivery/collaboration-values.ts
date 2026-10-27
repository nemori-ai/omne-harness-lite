import { array, fields, integer, string, literal, choice } from '../integration/parse.ts'
import { InputError } from './protocol.ts'
import type {
  ActiveAssignment,
  Assignment,
  CommentReference,
  Continuation,
  Evidence,
  ReduceWriter,
  TaskReference,
  WaveIdentity,
  WorkflowEvidence,
} from './collaboration-records.ts'

export function fullSha(value: unknown, at: string): string {
  const result = string(value, at).toLowerCase()
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(result))
    throw new InputError(`${at}: full Git SHA required`)
  return result
}

export function hash256(value: unknown, at: string): string {
  const result = string(value, at)
  if (!/^[0-9a-f]{64}$/.test(result)) throw new InputError(`${at}: SHA-256 required`)
  return result
}

export function uuid(value: unknown, at: string): string {
  const result = string(value, at)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result))
    throw new InputError(`${at}: UUID required`)
  return result.toLowerCase()
}

export function utcTime(value: unknown, at: string): string {
  const result = string(value, at)
  const time = Date.parse(result)
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(result) ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 19) !== result.slice(0, 19)
  )
    throw new InputError(`${at}: UTC RFC3339 time required`)
  return result
}

export function locator(value: unknown, at: string): string {
  const result = string(value, at)
  let url: URL
  try {
    url = new URL(result)
  } catch {
    throw new InputError(`${at}: HTTPS locator required`)
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new InputError(`${at}: HTTPS locator required`)
  return result
}

export function parseWave(value: unknown): WaveIdentity {
  const v = fields(value, ['repo', 'milestone', 'wave', 'reduceIssue', 'planRevision'], 'context')
  const repo = string(v.repo, 'context.repo')
  if (!/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(repo))
    throw new InputError('context.repo: owner/name required')
  return {
    repo,
    milestone: integer(v.milestone, 'milestone'),
    wave: integer(v.wave, 'wave'),
    reduceIssue: integer(v.reduceIssue, 'reduceIssue'),
    planRevision: integer(v.planRevision, 'planRevision'),
  }
}

export function parseEvidence(value: unknown): Evidence {
  const v = fields(value, ['url', 'sha256', 'description'], 'evidence')
  return {
    url: locator(v.url, 'evidence.url'),
    sha256: hash256(v.sha256, 'evidence.sha256'),
    description: string(v.description, 'evidence.description'),
  }
}
export function evidenceList(value: unknown): Evidence[] {
  return array(value, 'evidence').map(parseEvidence)
}
export function parseReference(value: unknown): CommentReference {
  const v = fields(value, ['issue', 'commentId', 'sha256'], 'comment reference')
  return {
    issue: integer(v.issue, 'reference.issue'),
    commentId: integer(v.commentId, 'reference.commentId'),
    sha256: hash256(v.sha256, 'reference.sha256'),
  }
}
export function parseTask(value: unknown): TaskReference {
  const v = fields(value, ['issue', 'revision', 'attempt', 'dispatch'], 'task')
  return {
    issue: integer(v.issue, 'task.issue'),
    revision: integer(v.revision, 'task.revision'),
    attempt: string(v.attempt, 'task.attempt'),
    dispatch: locator(v.dispatch, 'task.dispatch'),
  }
}
export function nonempty<T>(items: T[], at: string): [T, ...T[]] {
  const [first, ...rest] = items
  if (first === undefined) throw new InputError(`${at}: nonempty array required`)
  return [first, ...rest]
}
export function parseWriter(value: unknown): ReduceWriter {
  const v = fields(value, ['login', 'epoch', 'authorization'], 'writer')
  return {
    login: string(v.login, 'writer.login'),
    epoch: uuid(v.epoch, 'writer.epoch'),
    authorization: locator(v.authorization, 'writer.authorization'),
  }
}
export function parseWorkflow(value: unknown): WorkflowEvidence {
  const v = fields(value, ['path', 'ref', 'head', 'runId', 'runAttempt', 'inputDigest'], 'workflow')
  const path = string(v.path, 'workflow.path')
  if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(path))
    throw new InputError('workflow.path: workflow file required')
  return {
    path,
    ref: string(v.ref, 'workflow.ref'),
    head: fullSha(v.head, 'workflow.head'),
    runId: integer(v.runId, 'workflow.runId'),
    runAttempt: integer(v.runAttempt, 'workflow.runAttempt'),
    inputDigest: hash256(v.inputDigest, 'workflow.inputDigest'),
  }
}

export function parseAssignment(value: unknown): Assignment {
  const v = fields(
    value,
    [
      'context',
      'lineParent',
      'finalHead',
      'mode',
      'tasks',
      'inputs',
      'acceptance',
      'toolRevision',
      'rolePolicyVersion',
    ],
    'assignment',
  )
  const common = {
    context: parseWave(v.context),
    lineParent: integer(v.lineParent, 'lineParent'),
    finalHead: fullSha(v.finalHead, 'finalHead'),
    inputs: evidenceList(v.inputs),
    acceptance: evidenceList(v.acceptance),
    toolRevision: fullSha(v.toolRevision, 'toolRevision'),
    rolePolicyVersion: string(v.rolePolicyVersion, 'rolePolicyVersion'),
  }
  const tasks = array(v.tasks, 'tasks').map(parseTask)
  if (new Set(tasks.map(task => task.issue)).size !== tasks.length)
    throw new InputError('assignment: duplicate tasks')
  if (choice(v.mode, ['active', 'idle'], 'mode') === 'idle') {
    literal(tasks.length, 0, 'idle.tasks.length')
    return { ...common, mode: 'idle', tasks: [] }
  }
  nonempty(common.inputs, 'active.inputs')
  nonempty(common.acceptance, 'active.acceptance')
  return { ...common, mode: 'active', tasks: nonempty(tasks, 'active.tasks') }
}
export function activeAssignment(value: unknown): ActiveAssignment {
  const result = parseAssignment(value)
  if (result.mode !== 'active') throw new InputError('active assignment required')
  return result
}
export function parseContinuation(value: unknown): Continuation {
  const initial = fields(
    value,
    ['kind', 'assignment', 'next', 'reason', 'authorization'],
    'continuation',
  )
  const kind = choice(initial.kind, ['active', 'idle', 'terminal'], 'continuation.kind')
  if (kind === 'active') {
    const v = fields(value, ['kind', 'assignment'], 'continuation')
    return { kind, assignment: activeAssignment(v.assignment) }
  }
  if (kind === 'idle') {
    const v = fields(value, ['kind', 'next', 'reason'], 'continuation')
    return { kind, next: parseWave(v.next), reason: string(v.reason, 'idle.reason') }
  }
  const v = fields(value, ['kind', 'reason', 'authorization'], 'continuation')
  return {
    kind,
    reason: string(v.reason, 'terminal.reason'),
    authorization: parseEvidence(v.authorization),
  }
}
