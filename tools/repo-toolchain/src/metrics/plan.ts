import { readFileSync } from 'node:fs'
import { git } from '../core/git.ts'
import { baselines } from '../core/task-context.ts'
import { ownerOf } from '../core/workspace.ts'

export interface MetricsPlan {
  readonly head: string
  readonly base: { readonly ref: string; readonly mergeBase: string }
  readonly test: readonly string[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
}

export function parseMetricsPlan(value: unknown): MetricsPlan | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { head, base, plan } = value as Record<string, unknown>
  if (typeof head !== 'string' || typeof base !== 'object' || base === null) return undefined
  const { ref, mergeBase } = base as Record<string, unknown>
  if (typeof ref !== 'string' || typeof mergeBase !== 'string') return undefined
  if (typeof plan !== 'object' || plan === null) return undefined
  const test = (plan as Record<string, unknown>)['test']
  if (!isStringArray(test)) return undefined
  return { head, base: { ref, mergeBase }, test }
}

export function readMetricsPlan(root: string, path: string): MetricsPlan {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(
      `读不出计划文件 ${path}：${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const plan = parseMetricsPlan(parsed)
  if (plan === undefined) throw new Error(`计划文件 ${path} 的形状不对：重新算计划`)
  baselines(root, plan.base.ref)
  const head = git(root, ['rev-parse', 'HEAD'])
  if (plan.head !== head)
    throw new Error(
      `计划文件 ${path} 是对提交 ${plan.head.slice(0, 9)} 算的，现在是 ${head.slice(0, 9)}：重新算计划`,
    )
  return plan
}

export function coverageTargets(
  members: Iterable<string | undefined>,
  plan: MetricsPlan,
  roots: readonly string[],
): string[] {
  const planned = new Set(plan.test)
  return [...new Set(members)].filter(
    (path): path is string =>
      path !== undefined && planned.has(path) && roots.some(root => path.startsWith(`${root}/`)),
  )
}

export function unplannedMembers(
  changedFiles: Iterable<string>,
  plan: MetricsPlan,
  roots: readonly string[],
  members: readonly { readonly path: string }[],
): string[] {
  const planned = new Set(plan.test)
  const owners = new Set<string>()
  for (const file of changedFiles) {
    const owner = ownerOf(file, members)?.path
    if (owner !== undefined) owners.add(owner)
  }
  return [...owners].filter(
    path => !planned.has(path) && roots.some(root => path.startsWith(`${root}/`)),
  )
}
