// 收工钩子在没有 task context 时的基线：主线与各活跃集成轨道里，离 HEAD 最近的合并点。
// 从轨道分出的长期分支只看自己相对轨道的改动，不把轨道相对主线的内容算成这次变更。只跑 git，读不到的一律跳过。
import { fileAt, git } from '../core/git.ts'

/** 轨道登记的位置；规则归 `docs/engineering/integration.md`，字段由流程工具校验，这里只读用到的几个。 */
export const POLICY_PATH = 'docs/engineering/integration-policy.json'
const DEFAULT_LOCATION = 'origin'

type Registry = { readonly location: string; readonly branches: readonly string[] }

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function activeBranches(tracks: unknown): string[] {
  if (!Array.isArray(tracks)) return []
  return tracks.flatMap((track: unknown) => {
    if (typeof track !== 'object' || track === null) return []
    const { status, branch } = track as { status?: unknown; branch?: unknown }
    return status === 'active' && nonEmptyText(branch) ? [branch] : []
  })
}

/** 当前 HEAD 提交里 policy 登记的活跃轨道分支与传输位置；读不到或读不懂时没有轨道，位置取默认。 */
function readRegistry(root: string): Registry {
  const none: Registry = { location: DEFAULT_LOCATION, branches: [] }
  const text = fileAt(root, 'HEAD', POLICY_PATH)
  if (text === undefined) return none
  try {
    const policy = JSON.parse(text) as { tracks?: unknown; transport?: { location?: unknown } }
    const location = policy.transport?.location
    return {
      location: nonEmptyText(location) ? location : DEFAULT_LOCATION,
      branches: activeBranches(policy.tracks),
    }
  } catch {
    return none
  }
}

function commitOf(root: string, ref: string): string | undefined {
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  } catch {
    return undefined
  }
}

/** 远端跟踪分支优先，没有就同名本地分支；都没有返回 undefined。 */
function candidateOf(root: string, branch: string, location: string): string | undefined {
  return (
    commitOf(root, `refs/remotes/${location}/${branch}`) ?? commitOf(root, `refs/heads/${branch}`)
  )
}

/** 候选与 HEAD 的合并点，及 HEAD 领先它的提交数；没有共同历史时 undefined。 */
function distanceTo(
  root: string,
  tip: string,
): { readonly mergeBase: string; readonly ahead: number } | undefined {
  try {
    const mergeBase = git(root, ['merge-base', tip, 'HEAD'])
    return { mergeBase, ahead: Number(git(root, ['rev-list', '--count', `${mergeBase}..HEAD`])) }
  } catch {
    return undefined
  }
}

/**
 * 主线与各活跃轨道里离 HEAD 最近的合并点（HEAD 领先它的提交数最少；并列取主线，其次按登记顺序）。
 * 一个候选也求不出时是 HEAD：只看未提交的改动。
 */
export function nearestBase(root: string, primaryBranch: string): string {
  const { location, branches } = readRegistry(root)
  let best: { readonly mergeBase: string; readonly ahead: number } | undefined
  for (const branch of [primaryBranch, ...branches]) {
    const tip = candidateOf(root, branch, location)
    const found = tip === undefined ? undefined : distanceTo(root, tip)
    if (found !== undefined && (best === undefined || found.ahead < best.ahead)) best = found
  }
  return best?.mergeBase ?? 'HEAD'
}
