export const MEMBER_TURBO_ROOT = 'apps/'

export interface ResolvedTask {
  readonly dependsOn: readonly string[]
  readonly cache: boolean
  readonly outputs: readonly string[]
  readonly inputs: readonly string[]
  readonly env: readonly string[]
  readonly persistent: boolean
}

export interface RootTask {
  readonly dependsOn?: readonly string[]
  readonly env?: readonly string[]
}

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

function leavesMember(pattern: string): boolean {
  const path = pattern.startsWith('!') ? pattern.slice(1) : pattern
  return (
    path.startsWith('/') ||
    path.includes('$TURBO_ROOT$') ||
    path.split(/[\\/]/u).some(segment => segment === '..')
  )
}

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
