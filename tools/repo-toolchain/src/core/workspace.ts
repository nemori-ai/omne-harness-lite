// workspace 成员清单：`pnpm-workspace.yaml` 列出的成员目录、它们的脚本与声明的 workspace 依赖。
// 依赖按 package.json 的声明算，而不是按源码导入——测试可能导入生产代码不导入的包。
// 清单可以从工作树读，也可以从某个提交读（回放历史上的提交时用），两者走同一套解析。
import { execFileSync } from 'node:child_process'
import { repositoryEnv } from './git-environment.ts'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isLegacyDirectory } from './check-scope.ts'

export interface WorkspaceMember {
  /** 仓库相对目录，例如 `packages/core/messages`。 */
  readonly path: string
  readonly name: string
  /** `package.json` 的 `scripts`，只收字符串值。 */
  readonly scripts: Readonly<Record<string, string>>
  /** 它声明依赖的 workspace 成员名（dependencies、devDependencies、peerDependencies）。 */
  readonly dependencies: readonly string[]
}

export interface TestMember {
  readonly path: string
  readonly name: string
  /** `package.json` 里被选中的那个脚本（`test` 或 `acceptance`）的原文。 */
  readonly script: string
  readonly dependencies: readonly string[]
}

/** 读成员清单要用到的两件事：读一个文件、列一个目录下的子目录。路径都相对仓库根。 */
export interface Tree {
  /** 文件不存在时为 undefined。 */
  read(path: string): string | undefined
  directories(path: string): string[]
}

/** 工作树：含未提交与未跟踪的成员；跳过 `node_modules`。 */
export function fileTree(root: string): Tree {
  return {
    read: path => {
      const full = join(root, path)
      return existsSync(full) ? readFileSync(full, 'utf8') : undefined
    },
    directories: path => {
      const full = join(root, path)
      if (!existsSync(full)) return []
      return readdirSync(full, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
        .map(entry => entry.name)
        .sort()
    },
  }
}

function gitOutput(root: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      env: repositoryEnv(process.env),
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
}

/** 某个提交上的树。提交本身不存在时第一次读就报错，不当作「没有成员」。 */
export function gitTree(root: string, revision: string): Tree {
  if (gitOutput(root, ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`]) === undefined)
    throw new Error(`提交 ${revision} 不存在`)
  return {
    read: path => gitOutput(root, ['show', `${revision}:${path}`]),
    directories: path =>
      (gitOutput(root, ['ls-tree', '-d', '--name-only', `${revision}:${path}`]) ?? '')
        .split('\n')
        .filter(name => name !== '')
        .sort(),
  }
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

function expand(tree: Tree, pattern: string): string[] {
  let paths = ['']
  for (const segment of pattern.split('/'))
    paths = paths.flatMap(prefix =>
      segment === '*'
        ? tree.directories(prefix).map(name => (prefix === '' ? name : `${prefix}/${name}`))
        : [prefix === '' ? segment : `${prefix}/${segment}`],
    )
  return paths
}

interface Manifest {
  name?: unknown
  scripts?: Record<string, unknown>
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
}

/** 全部 workspace 成员（有 package.json 且有名字的），不含被排除根目录下的；按清单顺序。 */
export function listWorkspaceMembers(
  tree: Tree,
  excludeRoots: readonly string[],
): WorkspaceMember[] {
  const yaml = tree.read('pnpm-workspace.yaml')
  if (yaml === undefined) throw new Error('没有 pnpm-workspace.yaml')
  const members: WorkspaceMember[] = []
  for (const pattern of workspacePatterns(yaml))
    for (const path of expand(tree, pattern)) {
      if (excludeRoots.some(base => path === base || path.startsWith(`${base}/`))) continue
      const text = tree.read(`${path}/package.json`)
      if (text === undefined) continue
      let manifest: Manifest
      try {
        manifest = JSON.parse(text) as Manifest
      } catch (error) {
        throw new Error(`${path}/package.json 不是合法的 JSON`, { cause: error })
      }
      if (typeof manifest.name !== 'string') continue
      const scripts = Object.fromEntries(
        Object.entries(manifest.scripts ?? {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
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
        scripts,
        dependencies: [...new Set(dependencies)].sort(),
      })
    }
  return members
}

/** 有 `script` 脚本的成员，带上脚本原文。 */
export function withScript(members: readonly WorkspaceMember[], scriptName: string): TestMember[] {
  return members.flatMap(member => {
    const script = member.scripts[scriptName]
    return script === undefined
      ? []
      : [{ path: member.path, name: member.name, script, dependencies: member.dependencies }]
  })
}

/** 工作树里带 `script` 脚本（缺省 `test`）的 workspace 成员，不含被排除根目录下的。 */
export function listTestMembers(
  root: string,
  excludeRoots: readonly string[],
  scriptName: string = 'test',
): TestMember[] {
  return withScript(
    listWorkspaceMembers(fileTree(root), excludeRoots).filter(
      member => !isLegacyDirectory(member.path),
    ),
    scriptName,
  )
}

/** 路径归哪个成员：最长的成员目录前缀；目录名只是前缀相同的不算。 */
export function ownerOf<T extends { readonly path: string }>(
  path: string,
  members: readonly T[],
): T | undefined {
  let owner: T | undefined
  for (const member of members)
    if (
      path.startsWith(`${member.path}/`) &&
      (owner === undefined || member.path.length > owner.path.length)
    )
      owner = member
  return owner
}
