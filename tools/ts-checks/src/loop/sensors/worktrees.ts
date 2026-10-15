// 并行工作树：主检出以外、带分支的工作树有几棵，各自相对主线合并点改过哪些成员，
// 哪些成员被两棵以上同时在改——同时改得越多，合回主线时越容易互相踩。
import { statSync } from 'node:fs'
import { baselines, readContext } from '../../integration/context.ts'
import { changedFiles, git } from '../../metrics/git.ts'
import { memberOf } from '../../metrics/graph.ts'

export interface WorktreeEntry {
  readonly path: string
  readonly head: string | undefined
  /** `refs/heads/` 之后的分支名；分离头指针或裸仓库没有。 */
  readonly branch: string | undefined
}

/** `git worktree list --porcelain` → 条目；第一条是主检出。 */
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
  /** 相对主线合并点改过的成员；读不出来时为 undefined，原因在 `problem`。 */
  readonly members?: readonly string[]
  readonly problem?: string
}

export interface SharedMember {
  readonly member: string
  readonly worktrees: readonly string[]
}

/** 被两棵以上工作树同时改的成员，按棵数从多到少。 */
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

/** 主检出以外、带分支的工作树及其改过的成员。 */
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
        selected.state === 'adopted' ? readContext(entry.path).ownerTask?.taskBase : undefined
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
