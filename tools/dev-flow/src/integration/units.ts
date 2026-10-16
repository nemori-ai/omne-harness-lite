import { parseAudit, parseSource, readTag, type TaskAudit } from './context.ts'
import { ancestor, git, lines, parents, requireAncestor } from './git.ts'
import { UNIT_PREFIX, modes, type Policy } from './policy.ts'
import {
  array,
  canonical,
  choice,
  fields,
  literal,
  same,
  sha,
  string,
  IntegrationError,
} from './parse.ts'
import { operationId, type Candidate } from './records.ts'
import { fetchObject, targetRefs } from './transport.ts'

export type Unit = ReturnType<typeof parseUnit>
export function parseUnit(value: unknown) {
  const v = fields(
    value,
    [
      'schemaVersion',
      'operation',
      'mode',
      'target',
      'base',
      'sources',
      'candidate',
      'tasks',
      'policy',
      'verification',
    ],
    'unit',
  )
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    operation: operationId(v.operation),
    mode: choice(v.mode, [...modes, 'track-bootstrap'], 'unit.mode'),
    target: string(v.target, 'target'),
    base: v.base === null ? null : sha(v.base),
    sources: array(v.sources, 'sources').map(item => sha(item)),
    candidate: sha(v.candidate),
    tasks: array(v.tasks, 'tasks').map(parseAudit),
    policy: parseSource(v.policy),
    verification: string(v.verification, 'verification'),
  }
}
export function unitFor(candidate: Candidate, verification: string): Unit {
  return {
    schemaVersion: 1,
    operation: candidate.operation,
    mode: candidate.mode,
    target: candidate.target,
    base: candidate.expectedBase,
    sources: candidate.sources,
    candidate: candidate.candidate,
    tasks: candidate.tasks,
    policy: candidate.policy,
    verification,
  }
}
export function combineTasks(root: string, tasks: TaskAudit[]): TaskAudit[] {
  const result = new Map<string, TaskAudit>()
  for (const task of tasks) {
    const key = canonical([task.binding.issue, task.binding.revision, task.binding.attempt]),
      previous = result.get(key)
    if (previous === undefined) {
      result.set(key, task)
      continue
    }
    same(
      previous.binding,
      task.binding,
      'Unit prefix contains incompatible task revision or attempt',
    )
    if (ancestor(root, previous.taskSource, task.taskSource)) result.set(key, task)
    else requireAncestor(root, task.taskSource, previous.taskSource)
  }
  return [...result.values()].sort((a, b) =>
    canonical([a.binding.issue, a.binding.revision, a.binding.attempt]).localeCompare(
      canonical([b.binding.issue, b.binding.revision, b.binding.attempt]),
    ),
  )
}
export function pendingPrefix(
  root: string,
  policy: Policy,
  trackId: string,
  source: string,
  base: string,
): { tasks: TaskAudit[]; units: string[] } {
  const track = policy.tracks.find(item => item.id === trackId)
  if (track === undefined) throw new IntegrationError('refused', 'Unregistered prefix track')
  return completePrefix(
    root,
    policy,
    `refs/heads/${track.branch}`,
    track.initialMain,
    source,
    base,
    true,
  )
}
export function completePrefix(
  root: string,
  policy: Policy,
  target: string,
  initial: string,
  source: string,
  base: string,
  needsBootstrap: boolean,
): { tasks: TaskAudit[]; units: string[] } {
  requireAncestor(root, initial, source)
  const byCommit = new Map<string, { unit: Unit; oid: string }>()
  for (const [ref, oid] of targetRefs(root, policy)) {
    if (!ref.startsWith(UNIT_PREFIX)) continue
    fetchObject(root, policy.transport.location, oid, policy.timeouts.networkMs)
    const tag = readTag(root, oid),
      unit = parseUnit(tag.body)
    same(tag.name, ref.slice(10), 'Unit tag name mismatch')
    same(ref, `${UNIT_PREFIX}${unit.operation}`, 'Unit operation tag mismatch')
    same(tag.target, unit.candidate, 'Unit tag target mismatch')
    if (unit.target !== target) continue
    if (byCommit.has(unit.candidate))
      throw new IntegrationError('invariant', 'Multiple units claim the same track commit')
    byCommit.set(unit.candidate, { unit, oid })
  }
  const bootstrap = byCommit.get(initial)
  if (
    needsBootstrap &&
    (bootstrap?.unit.mode !== 'track-bootstrap' || bootstrap.unit.base !== null)
  )
    throw new IntegrationError('unknown', 'Track bootstrap unit is missing')
  const chain = lines(
    git(root, ['rev-list', '--first-parent', '--reverse', `${initial}..${source}`]),
  )
  const tasks: TaskAudit[] = [],
    units: string[] = [],
    coveredSources: string[] = [],
    unitCommits = new Set<string>()
  for (const commit of chain) {
    const entry = byCommit.get(commit)
    if (entry === undefined)
      throw new IntegrationError('refused', `Unregistered direct track commit ${commit}`)
    const { unit, oid } = entry
    const actualParents = parents(root, commit)
    if (unit.base === null || actualParents[0] !== unit.base)
      throw new IntegrationError('invariant', 'Unit first parent does not match expected base')
    if (actualParents.slice(1).some(parent => !unit.sources.includes(parent)))
      throw new IntegrationError('invariant', 'Unit has an undeclared merge parent')
    for (const source of unit.sources) requireAncestor(root, source, commit)
    if (unit.sources.length === 0)
      throw new IntegrationError('invariant', 'Published unit has no complete source')
    if (unit.mode === 'fi' && unit.tasks.length !== 0)
      throw new IntegrationError('invariant', 'FI cannot invent business tasks')
    for (const task of unit.tasks) {
      requireAncestor(root, task.binding.taskBase, task.taskSource)
      if (!unit.sources.some(source => ancestor(root, task.taskSource, source)))
        throw new IntegrationError('invariant', 'Unit taskSource is outside declared sources')
    }
    coveredSources.push(...unit.sources)
    unitCommits.add(commit)
    if (!ancestor(root, commit, base)) {
      units.push(oid)
      tasks.push(...unit.tasks)
    }
  }
  const uncovered = lines(
    git(root, ['rev-list', source, `^${base}`, ...coveredSources.map(commit => `^${commit}`)]),
  ).filter(commit => !unitCommits.has(commit))
  if (uncovered.length > 0)
    throw new IntegrationError(
      'refused',
      'Track contains commits outside registered complete sources',
    )
  return { tasks: combineTasks(root, tasks), units }
}
