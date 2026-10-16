import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { requireAdopted, readTag } from './context.ts'
import { git, lines, parents, requireAncestor, ancestor } from './git.ts'
import { remoteRefs, fetchObject, targetHead } from './transport.ts'
import { UNIT_PREFIX } from './policy.ts'
import { parseUnit } from './units.ts'

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
