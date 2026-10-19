// 成员目录下的 turbo.json（#390 的 D6）：`packages/*`、`tools/*` 等一律拒绝；`apps/*` 允许，但要满足下面七条规则。
// 规则 1、2 与 7 的一部分看成员的原文，其余看 turbo 合成后的任务定义（`turbo run … --dry=json` 的 `resolvedTaskDefinition`），
// 核对的是准入时实际生效的定义。这些是暂行规则：第一个需要成员配置的应用出现时按卡修订的方式调整，不直接改这里。
// 纯函数；跑 turbo 的部分在 turbo.ts。

/** 允许成员级 turbo.json 的成员都在这一层目录下。 */
export const MEMBER_TURBO_ROOT = 'apps/'

/** turbo 合成后的任务定义里这里用到的部分。 */
export interface ResolvedTask {
  readonly dependsOn: readonly string[]
  readonly cache: boolean
  readonly outputs: readonly string[]
  readonly inputs: readonly string[]
  readonly env: readonly string[]
  readonly persistent: boolean
}

/** 根 turbo.json 里一个任务的定义中这里用到的部分。 */
export interface RootTask {
  readonly dependsOn?: readonly string[]
  readonly env?: readonly string[]
}

/** 成员原文的问题：规则 1（extends 只能是 `["//"]`）、2（只覆盖根已定义的任务）、7（不设 persistent）。 */
export function rawProblems(raw: unknown, rootTasks: Readonly<Record<string, RootTask>>): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ['不是 JSON 对象']
  const config = raw as { extends?: unknown; tasks?: unknown }
  const problems: string[] = []
  if (JSON.stringify(config.extends) !== JSON.stringify(['//']))
    problems.push('规则 1：extends 只能是 ["//"]')
  const tasks =
    typeof config.tasks === 'object' && config.tasks !== null && !Array.isArray(config.tasks)
      ? (config.tasks as Record<string, unknown>)
      : {}
  for (const [name, task] of Object.entries(tasks)) {
    if (!(name in rootTasks)) problems.push(`规则 2：任务 ${name} 不在根 turbo.json 里`)
    if (
      typeof task === 'object' &&
      task !== null &&
      (task as { persistent?: unknown }).persistent === true
    )
      problems.push(`规则 7：任务 ${name} 不能设 persistent: true`)
  }
  return problems
}

/** 路径模式是否指到成员目录外：绝对路径、含 `..` 段或用 `$TURBO_ROOT$`。 */
function leavesMember(pattern: string): boolean {
  const path = pattern.startsWith('!') ? pattern.slice(1) : pattern
  return (
    path.startsWith('/') ||
    path.includes('$TURBO_ROOT$') ||
    path.split(/[\\/]/u).some(segment => segment === '..')
  )
}

/** 一个任务合成后定义的问题：规则 3（dependsOn 只增不减）、4（测试不缓存）、5（路径在成员内）、6（env 只增不减）、7。 */
export function resolvedProblems(
  task: string,
  resolved: ResolvedTask,
  root: RootTask,
  testTasks: readonly string[],
): string[] {
  const problems: string[] = []
  const missing = (root.dependsOn ?? []).filter(entry => !resolved.dependsOn.includes(entry))
  if (missing.length > 0)
    problems.push(`规则 3：${task} 的 dependsOn 少了根定义的 ${missing.join('、')}`)
  if (testTasks.includes(task) && resolved.cache)
    problems.push(`规则 4：${task} 不能设 cache: true`)
  const outside = [...resolved.outputs, ...resolved.inputs].filter(leavesMember)
  if (outside.length > 0)
    problems.push(`规则 5：${task} 的 outputs／inputs 指到成员目录外：${outside.join('、')}`)
  const dropped = (root.env ?? []).filter(name => !resolved.env.includes(name))
  if (dropped.length > 0) problems.push(`规则 6：${task} 的 env 少了根定义的 ${dropped.join('、')}`)
  if (resolved.persistent) problems.push(`规则 7：${task} 不能是 persistent`)
  return problems
}
