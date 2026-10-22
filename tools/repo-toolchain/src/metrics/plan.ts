// test-runner 的计划文件（`plan --json` 写出）里度量要用的几栏：基线与要跑测试的成员。
// 覆盖采集按它选成员，与准入检查、变异读同一份计划；这里不重算计划，也不依赖 test-runner。
import { readFileSync } from 'node:fs'
import { git } from '../core/git.ts'
import { baselines } from '../core/task-context.ts'
import { ownerOf } from '../core/workspace.ts'

export interface MetricsPlan {
  readonly head: string
  readonly base: { readonly ref: string; readonly mergeBase: string }
  /** 计划里要跑测试的成员目录。 */
  readonly test: readonly string[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
}

/** 只核这里用到的几栏。 */
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

/**
 * 读计划文件；它算的不是当前提交就报错：提交变了，计划就不再描述这次改动。
 * 工作树绑定了任务上下文时，计划的基线也要与上下文固定的基线一致（与 test-runner 读计划时相同）。
 */
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

/** 要采覆盖的成员：在计划里要跑测试、又在配置所列根目录下的，按出现顺序去重。 */
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

/**
 * 有改动、在配置根目录下、却不在计划里的成员。计划只核提交；算完计划后工作树又改了别的成员，
 * 按计划采覆盖会静默漏掉它们，所以调用方见到非空就报错。
 * 改动文件按 `ownerOf` 归到工作区成员（最长的成员目录前缀）。组根文件（`packages/<组>/docs/**` 等）
 * 没有成员前缀，归不到任何成员，不算（组根不是成员，见 `docs/package-organization.md`）。
 */
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
