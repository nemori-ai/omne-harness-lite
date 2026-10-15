import {
  array,
  branch,
  choice,
  fields,
  integer,
  literal,
  safePath,
  section,
  sha,
  string,
  strings,
  same,
  IntegrationError,
} from '../integration/parse.ts'
import type { IssueIdentity } from './protocol.ts'

export function parseConditionScope(value: unknown, phase: string): string {
  if (value === undefined || value === 'all') return 'all'
  const scope = string(value, 'condition.scope')
  if (
    phase !== 'integration' ||
    !/^(track|main|stable|refs\/heads\/(main|stable|integration\/[A-Za-z0-9][A-Za-z0-9_.-]*))$/.test(
      scope,
    )
  )
    throw new IntegrationError(
      'input-error',
      'Condition scope requires an integration layer or exact shared ref',
    )
  return branch(scope, 'condition.scope')
}
export function conditionApplies(scope: string | undefined, target: string): boolean {
  const layer = target.startsWith('refs/heads/integration/')
    ? 'track'
    : target.replace('refs/heads/', '')
  return scope === undefined || scope === 'all' || scope === target || scope === layer
}

export type Route =
  | { kind: 'track'; track: string }
  | { kind: 'global' | 'cross-track'; owners: string[] }
export type TaskBinding = {
  schemaVersion: 1
  issue: IssueIdentity
  revision: number
  attempt: string
  responsible: string
  branch: string
  route: Route
  completionTarget: 'track' | 'main' | 'stable'
  taskBase: string
  writeScope: string[]
  dispatch: string
  conditions: string[]
  authorization: string[]
}
export function parseRoute(value: unknown): Route {
  const v = fields(value, ['kind', 'track', 'owners'], 'route')
  const kind = choice(v.kind, ['track', 'global', 'cross-track'], 'route.kind')
  if (kind === 'track') {
    fields(v, ['kind', 'track'], 'route')
    const track = branch(v.track, 'route.track')
    if (track.includes('/'))
      throw new IntegrationError('input-error', 'track must be one branch segment')
    return { kind, track }
  }
  fields(v, ['kind', 'owners'], 'route')
  const owners = strings(v.owners, 'route.owners')
  if (owners.length === 0)
    throw new IntegrationError('input-error', 'route requires affected owners')
  return { kind, owners }
}
export function parseIssueIdentity(value: unknown): IssueIdentity {
  const v = fields(value, ['repository', 'id', 'url', 'number'], 'issue')
  const repository = string(v.repository, 'issue.repository')
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository))
    throw new IntegrationError('input-error', 'Invalid Issue repository')
  const number = integer(v.number, 'issue.number')
  const url = literal(v.url, `https://github.com/${repository}/issues/${number}`, 'issue.url')
  return { repository, number, url, id: string(v.id, 'issue.id') }
}
export function parseTaskBinding(value: unknown): TaskBinding {
  const v = fields(
    value,
    [
      'schemaVersion',
      'issue',
      'revision',
      'attempt',
      'responsible',
      'branch',
      'route',
      'completionTarget',
      'taskBase',
      'writeScope',
      'dispatch',
      'conditions',
      'authorization',
    ],
    'binding',
  )
  const responsible = string(v.responsible, 'responsible')
  const workBranch = branch(v.branch)
  if (!workBranch.startsWith(`${responsible}/`) || responsible.includes('/'))
    throw new IntegrationError('input-error', 'work branch must use the responsible human prefix')
  const writeScope = array(v.writeScope, 'writeScope').map(item => safePath(item, 'writeScope'))
  if (writeScope.length === 0) throw new IntegrationError('input-error', 'writeScope is empty')
  const route = parseRoute(v.route)
  const completionTarget = choice(
    v.completionTarget,
    ['track', 'main', 'stable'],
    'completionTarget',
  )
  if (route.kind !== 'track' && completionTarget === 'track')
    throw new IntegrationError('input-error', 'global route cannot finish at a track')
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    issue: parseIssueIdentity(v.issue),
    revision: integer(v.revision, 'revision'),
    attempt: string(v.attempt, 'attempt'),
    responsible,
    branch: workBranch,
    route,
    completionTarget,
    taskBase: sha(v.taskBase, 'taskBase'),
    writeScope,
    dispatch: string(v.dispatch, 'dispatch'),
    conditions: strings(v.conditions, 'conditions'),
    authorization: strings(v.authorization, 'authorization'),
  }
}
export function readTaskBinding(body: string, issue: IssueIdentity): TaskBinding | undefined {
  const raw = section(body, 'omne-integration-binding:v1')
  if (raw === undefined) return undefined
  const binding = parseTaskBinding(raw)
  same(binding.issue, issue, 'Binding identity does not match captured Issue')
  const revisions = [...body.matchAll(/^\s*-\s+交付修订[：:]\s*([1-9]\d*)\s*$/gm)]
  if (revisions.length !== 1 || Number(revisions[0]?.[1]) !== binding.revision)
    throw new IntegrationError(
      'input-error',
      'Binding revision must match the unique delivery revision',
    )
  return binding
}
