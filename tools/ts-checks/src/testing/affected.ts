// 受影响范围：一次改动该跑哪些成员的测试。
// 按 package.json 里声明的 workspace 依赖求反向传递闭包，而不是按源码导入——测试可能导入生产代码
// 不导入的包。pnpm 自带的 `--filter "...[<since>]"` 做的是同一件事，但它在 git 工作树里匹配不到
// 任何包（2026-10-01 在 pnpm 10.28.1 上验证：主检出选中 41 个，同一提交的工作树选中 0 个），
// 而实施都在工作树里进行，所以这里自己算。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface TestMember {
  /** 仓库相对目录，例如 `packages/core/messages`。 */
  readonly path: string
  readonly name: string
  /** `package.json` 里 `test` 脚本的原文。 */
  readonly testScript: string
  /** 它声明依赖的 workspace 成员名（dependencies、devDependencies、peerDependencies）。 */
  readonly dependencies: readonly string[]
}

/**
 * `pnpm-workspace.yaml` 里 `packages:` 下列出的成员目录模式。成员清单只有那一份权威，这里不另写一份；
 * 只认它现在用到的写法：一行一个、`*` 代表一级目录。认不出的写法直接报错，不悄悄漏掉成员。
 */
export function workspacePatterns(yaml: string): string[] {
  const lines = yaml.split('\n')
  const start = lines.findIndex(line => /^packages:\s*$/u.test(line))
  if (start === -1) throw new Error('pnpm-workspace.yaml 里没有 packages: 列表')
  const patterns: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(#.*)?$/u.test(line)) continue
    const item = /^\s+-\s+(['"]?)([^'"#\s]+)\1\s*(#.*)?$/u.exec(line)
    if (item === null) {
      if (/^\S/u.test(line)) break
      throw new Error(`pnpm-workspace.yaml 的 packages 列表里有认不出的一行：${line.trim()}`)
    }
    const pattern = item[2] ?? ''
    if (
      pattern.startsWith('!') ||
      pattern.split('/').some(part => part.includes('*') && part !== '*')
    )
      throw new Error(`pnpm-workspace.yaml 的成员模式 ${pattern} 用了这里不支持的写法`)
    patterns.push(pattern)
  }
  if (patterns.length === 0) throw new Error('pnpm-workspace.yaml 的 packages 列表是空的')
  return patterns
}

function directories(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
    .map(entry => entry.name)
    .sort()
}

function expand(root: string, pattern: string): string[] {
  let paths = ['']
  for (const segment of pattern.split('/'))
    paths = paths.flatMap(prefix =>
      segment === '*'
        ? directories(join(root, prefix)).map(name => (prefix === '' ? name : `${prefix}/${name}`))
        : [prefix === '' ? segment : `${prefix}/${segment}`],
    )
  return paths
}

/** 仓库里带测试脚本的 workspace 成员，不含被排除根目录下的。 */
export function listTestMembers(root: string, excludeRoots: readonly string[]): TestMember[] {
  const members: TestMember[] = []
  for (const pattern of workspacePatterns(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')))
    for (const path of expand(root, pattern)) {
      if (excludeRoots.some(base => path === base || path.startsWith(`${base}/`))) continue
      const manifestPath = join(root, path, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name?: unknown
        scripts?: { test?: unknown }
        dependencies?: Record<string, unknown>
        devDependencies?: Record<string, unknown>
        peerDependencies?: Record<string, unknown>
      }
      const testScript = manifest.scripts?.test
      if (typeof manifest.name !== 'string' || typeof testScript !== 'string') continue
      const dependencies = [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.peerDependencies,
      ].flatMap(block =>
        Object.entries(block ?? {})
          .filter(([, range]) => typeof range === 'string' && range.startsWith('workspace:'))
          .map(([name]) => name),
      )
      members.push({
        path,
        name: manifest.name,
        testScript,
        dependencies: [...new Set(dependencies)].sort(),
      })
    }
  return members
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replaceAll(/[.+?^${}()|[\]\\]/gu, '\\$&')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*')
  return new RegExp(`^${escaped}$`, 'u')
}

export interface AffectedPlan {
  /** 命中了全局路径：全部成员都算受影响。 */
  readonly global?: { readonly path: string; readonly pattern: string }
  /** 自己有文件改动的成员。 */
  readonly changed: readonly string[]
  /** 没有改动、但直接或间接依赖了变更成员的成员。 */
  readonly dependents: readonly string[]
  /** 改动落在被排除根目录或任何成员之外、且没有命中全局路径的文件数。 */
  readonly outside: number
}

/** 由改动过的文件与成员清单算出该跑哪些成员；纯函数。 */
export function planAffected(
  changedPaths: readonly string[],
  members: readonly TestMember[],
  globalPaths: readonly string[],
): AffectedPlan {
  const all = members.map(member => member.path)
  for (const pattern of globalPaths) {
    const matcher = patternToRegExp(pattern)
    const path = changedPaths.find(candidate => matcher.test(candidate))
    if (path !== undefined)
      return { global: { path, pattern }, changed: all, dependents: [], outside: 0 }
  }
  const changed = new Set<string>()
  let outside = 0
  for (const path of changedPaths) {
    const owner = members.find(member => path.startsWith(`${member.path}/`))
    if (owner === undefined) outside += 1
    else changed.add(owner.path)
  }
  const byName = new Map(members.map(member => [member.name, member]))
  const dependentsOf = new Map<string, string[]>()
  for (const member of members)
    for (const name of member.dependencies) {
      const target = byName.get(name)
      if (target !== undefined)
        dependentsOf.set(target.path, [...(dependentsOf.get(target.path) ?? []), member.path])
    }
  const reached = new Set(changed)
  const queue = [...changed]
  for (let head = queue.shift(); head !== undefined; head = queue.shift())
    for (const dependent of dependentsOf.get(head) ?? [])
      if (!reached.has(dependent)) {
        reached.add(dependent)
        queue.push(dependent)
      }
  return {
    changed: all.filter(path => changed.has(path)),
    dependents: all.filter(path => reached.has(path) && !changed.has(path)),
    outside,
  }
}

export function describePlan(plan: AffectedPlan, total: number): string[] {
  const lines: string[] = []
  if (plan.global !== undefined)
    lines.push(
      `全局文件 ${plan.global.path} 有改动（命中 ${plan.global.pattern}）：全部 ${total} 个成员都算受影响`,
    )
  else {
    lines.push(`变更成员 ${plan.changed.length} 个：${plan.changed.join('、') || '无'}`)
    lines.push(`依赖方 ${plan.dependents.length} 个：${plan.dependents.join('、') || '无'}`)
    if (plan.outside > 0)
      lines.push(`另有 ${plan.outside} 个改动文件不属于任何参与测试的成员（文档、示例、设计区等）`)
  }
  return lines
}
