import { execFileSync } from 'node:child_process'
import { repositoryEnv } from './git-environment.ts'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isLegacyDirectory } from './check-scope.ts'

export interface WorkspaceMember {
  readonly path: string
  readonly name: string
  readonly scripts: Readonly<Record<string, string>>
  readonly dependencies: readonly string[]
}

export interface TestMember {
  readonly path: string
  readonly name: string
  readonly script: string
  readonly dependencies: readonly string[]
}

export interface Tree {
  read(path: string): string | undefined
  directories(path: string): string[]
}

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

export function withScript(members: readonly WorkspaceMember[], scriptName: string): TestMember[] {
  return members.flatMap(member => {
    const script = member.scripts[scriptName]
    return script === undefined
      ? []
      : [{ path: member.path, name: member.name, script, dependencies: member.dependencies }]
  })
}

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
