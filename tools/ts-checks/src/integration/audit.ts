import { baselines, requireAdopted, readTag } from './context.ts'
import { inspect, type AcceptanceLockConfig } from '../acceptance/lock.ts'
import { git, lines, parents, requireAncestor, ancestor } from './git.ts'
import { remoteRefs, fetchObject, targetHead } from './transport.ts'
import { UNIT_PREFIX } from './policy.ts'
import { parseUnit } from './units.ts'

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
export function auditHistory(
  root: string,
  explicitBase: string | undefined,
  config: AcceptanceLockConfig,
) {
  const adopted = baselines(root, explicitBase).state === 'adopted'
  return auditRanges(root, explicitBase).map(range => ({
    ...range,
    acceptance: inspect(root, range.base, config, range.head, adopted),
  }))
}
/** Imported histories retain their own audits. Only the work line and merge edits belong to this task's write scope. */
export function scopeViolations(root: string): string[] {
  const resolved = baselines(root),
    violations: string[] = []
  if (resolved.state !== 'adopted') return violations
  const state = requireAdopted(root),
    allowed = new Set<string>()
  const main = targetHead(root, state.policy, 'refs/heads/main')
  if (main !== null) allowed.add(main)
  for (const [ref, oid] of remoteRefs(
    root,
    state.policy.transport.location,
    state.policy.timeouts.networkMs,
    `${UNIT_PREFIX}*`,
  )) {
    fetchObject(root, state.policy.transport.location, oid, state.policy.timeouts.networkMs)
    const tag = readTag(root, oid),
      unit = parseUnit(tag.body)
    if (`refs/tags/${tag.name}` === ref && tag.target === unit.candidate)
      allowed.add(unit.candidate)
  }
  for (const task of resolved.audits) {
    requireAncestor(root, task.binding.taskBase, task.taskSource)
    for (const commit of lines(
      git(root, ['rev-list', '--first-parent', `${task.binding.taskBase}..${task.taskSource}`]),
    )) {
      const parentList = parents(root, commit)
      if (
        parentList.slice(1).some(parent => ![...allowed].some(tip => ancestor(root, parent, tip)))
      )
        violations.push(`${task.binding.issue.url}: ${commit} imports an unregistered history`)
      const touched = lines(
        git(root, [
          'diff-tree',
          '--no-commit-id',
          '--name-only',
          '-r',
          ...(parentList.length > 1 ? ['--cc'] : ['--root']),
          commit,
        ]),
      )
      for (const path of touched)
        if (!task.binding.writeScope.some(scope => path === scope || path.startsWith(`${scope}/`)))
          violations.push(
            `${task.binding.issue.url}: ${commit} changed ${path} outside its write scope`,
          )
    }
  }
  return violations
}
