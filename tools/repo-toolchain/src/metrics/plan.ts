// test-runner 的计划文件（`plan --json` 写出）里度量要用的几栏：基线与要跑测试的成员。
// 覆盖采集按它选成员，与准入检查、变异读同一份计划；这里不重算计划，也不依赖 test-runner。
import { readFileSync } from 'node:fs'
import { git } from '../core/git.ts'

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

/** 读计划文件；它算的不是当前提交就报错：提交变了，计划就不再描述这次改动。 */
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
  const head = git(root, ['rev-parse', 'HEAD'])
  if (plan.head !== head)
    throw new Error(
      `计划文件 ${path} 是对提交 ${plan.head.slice(0, 9)} 算的，现在是 ${head.slice(0, 9)}：重新算计划`,
    )
  return plan
}
