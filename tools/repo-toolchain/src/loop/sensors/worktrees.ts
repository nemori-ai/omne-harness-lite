import { baselines, readTaskContext } from '../../core/task-context.ts'
import { statSync } from 'node:fs'
import { changedFiles, git } from '../../core/git.ts'
import { memberOf } from '../../deps/graph.ts'

export interface WorktreeEntry {
  readonly path: string
  readonly head: string | undefined
  readonly branch: string | undefined
}

export function parseWorktrees(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  for (const block of porcelain.split(/\n\s*\n/u)) {
    let path: string | undefined
    let head: string | undefined
    let branch: string | undefined
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
      else if (line.startsWith('branch '))
        branch = line.slice('branch '.length).replace(/^refs\/heads\//u, '')
    }
    if (path !== undefined) entries.push({ path, head, branch })
  }
  return entries
}

export interface WorktreeChanges {
  readonly path: string
  readonly branch: string
  readonly members?: readonly string[]
  readonly problem?: string
}

export interface SharedMember {
  readonly member: string
  readonly worktrees: readonly string[]
}

export function sharedMembers(worktrees: readonly WorktreeChanges[]): SharedMember[] {
  const by = new Map<string, string[]>()
  for (const tree of worktrees)
    for (const member of tree.members ?? [])
      by.set(member, [...(by.get(member) ?? []), tree.branch])
  return [...by]
    .filter(([, trees]) => trees.length > 1)
    .map(([member, trees]) => ({ member, worktrees: trees.sort() }))
    .sort((a, b) => b.worktrees.length - a.worktrees.length || a.member.localeCompare(b.member))
}

export function readWorktrees(root: string, primaryBranch: string): WorktreeChanges[] {
  const [, ...others] = parseWorktrees(git(root, ['worktree', 'list', '--porcelain']))
  const out: WorktreeChanges[] = []
  for (const entry of others) {
    if (entry.branch === undefined) continue
    if (statSync(entry.path, { throwIfNoEntry: false })?.isDirectory() !== true) {
      out.push({ path: entry.path, branch: entry.branch, problem: '目录不在了（可清理的工作树）' })
      continue
    }
    let mergeBase: string
    try {
      const selected = baselines(entry.path)
      const taskBase =
        selected.state === 'bound' ? readTaskContext(entry.path).ownerTask?.taskBase : undefined
      mergeBase =
        taskBase ?? selected.targetBase ?? git(entry.path, ['merge-base', primaryBranch, 'HEAD'])
    } catch {
      out.push({
        path: entry.path,
        branch: entry.branch,
        problem: `任务上下文未知，或与 ${primaryBranch} 没有合并点`,
      })
      continue
    }
    const members = new Set<string>()
    for (const path of changedFiles(entry.path, mergeBase)) {
      const member = memberOf(path)
      if (member !== undefined) members.add(member.path)
    }
    out.push({ path: entry.path, branch: entry.branch, members: [...members].sort() })
  }
  return out
}
