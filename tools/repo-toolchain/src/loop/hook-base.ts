import { fileAt, git } from '../core/git.ts'

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

function candidateOf(root: string, branch: string, location: string): string | undefined {
  return (
    commitOf(root, `refs/remotes/${location}/${branch}`) ?? commitOf(root, `refs/heads/${branch}`)
  )
}

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
