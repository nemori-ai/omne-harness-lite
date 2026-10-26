import {
  array,
  branch,
  choice,
  fields,
  integer,
  literal,
  object,
  safePath,
  section,
  sha,
  string,
  strings,
  same,
  IntegrationError,
} from '../integration/parse.ts'
import { contractChanges, natures, type ContractChange, type Nature } from './attributes.ts'
import { lineId } from './lines.ts'
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

/** Every route names the track whose branch the task integrates into. */
export type Route =
  | { kind: 'track'; track: string }
  | { kind: 'global' | 'cross-track'; track: string; owners: string[] }
type BindingFields = {
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
/** The version 1 binding: dispatch facts only. Attributes live in the Issue body and milestone. */
export type TaskBindingV1 = { schemaVersion: 1 } & BindingFields
/**
 * The version 2 binding also records the card attributes at dispatch. `milestone` is the Issue
 * milestone title at dispatch, or null when the Issue had none.
 */
export type TaskBindingV2 = { schemaVersion: 2 } & BindingFields & {
    line: string
    nature: Nature
    contractChange: ContractChange
    milestone: string | null
  }
export type TaskBinding = TaskBindingV1 | TaskBindingV2
export function parseRoute(value: unknown): Route {
  const v = fields(value, ['kind', 'track', 'owners'], 'route')
  const kind = choice(v.kind, ['track', 'global', 'cross-track'], 'route.kind')
  const track = branch(v.track, 'route.track')
  if (track.includes('/'))
    throw new IntegrationError('input-error', 'track must be one branch segment')
  if (kind === 'track') {
    fields(v, ['kind', 'track'], 'route')
    return { kind, track }
  }
  const owners = strings(v.owners, 'route.owners')
  if (owners.length === 0)
    throw new IntegrationError('input-error', 'route requires affected owners')
  return { kind, track, owners }
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
const V1_FIELDS = [
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
] as const
const V2_FIELDS = [...V1_FIELDS, 'line', 'nature', 'contractChange', 'milestone'] as const
function parseFields(v: Record<string, unknown>): BindingFields {
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
  return {
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
/** Parses either version; version 1 keeps its exact field set, version 2 requires all 17. */
export function parseTaskBinding(value: unknown): TaskBinding {
  if (object(value, 'binding').schemaVersion === 2) {
    const v = fields(value, V2_FIELDS, 'binding')
    if (!('milestone' in v))
      throw new IntegrationError('input-error', 'binding.milestone is required')
    const parsed = parseFields(v)
    return {
      schemaVersion: 2,
      ...parsed,
      line: lineId(v.line, 'line'),
      nature: choice(v.nature, natures, 'nature'),
      contractChange: choice(v.contractChange, contractChanges, 'contractChange'),
      milestone: v.milestone === null ? null : string(v.milestone, 'milestone'),
    }
  }
  const v = fields(value, V1_FIELDS, 'binding')
  const parsed = parseFields(v)
  return { schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'), ...parsed }
}
/** The fenced block marker of each binding version; a body carries at most one binding block. */
export const BINDING_MARKERS = {
  1: 'omne-integration-binding:v1',
  2: 'omne-integration-binding:v2',
} as const
export function readTaskBinding(body: string, issue: IssueIdentity): TaskBinding | undefined {
  const blocks = ([1, 2] as const).flatMap(version => {
    const raw = section(body, BINDING_MARKERS[version])
    return raw === undefined ? [] : [{ version, raw }]
  })
  const block = blocks[0]
  if (block === undefined) return undefined
  if (blocks.length > 1)
    throw new IntegrationError('input-error', 'Duplicate omne-integration-binding sections')
  const binding = parseTaskBinding(block.raw)
  if (binding.schemaVersion !== block.version)
    throw new IntegrationError(
      'input-error',
      `${BINDING_MARKERS[block.version]} block must carry schemaVersion ${block.version}`,
    )
  same(binding.issue, issue, 'Binding identity does not match captured Issue')
  if (deliveryRevision(body) !== binding.revision)
    throw new IntegrationError(
      'input-error',
      'Binding revision must match the unique delivery revision',
    )
  return binding
}
/** The body's unique「交付修订」value; undefined without exactly one such line. */
export function deliveryRevision(body: string): number | undefined {
  const revisions = [...body.matchAll(/^\s*-\s+交付修订[：:]\s*([1-9]\d*)\s*$/gm)]
  const revision = Number(revisions[0]?.[1])
  return revisions.length === 1 && Number.isSafeInteger(revision) ? revision : undefined
}
