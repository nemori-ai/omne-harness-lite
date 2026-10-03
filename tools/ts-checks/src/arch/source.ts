import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, matchesGlob, relative, resolve } from 'node:path'
import { fileAt, git } from '../metrics/git.ts'
import { listWorkspaceMembers, ownerOf, workspacePatterns, type Tree } from '../testing/members.ts'
import type { Member } from '../metrics/graph.ts'
import type { Snapshot } from './actual-model.ts'

export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }
export interface ActualMember {
  readonly id: string
  readonly path: string
  readonly name: string
  readonly category: 'product' | 'development'
  readonly manifest: { readonly path: string; readonly value: JsonValue }
  readonly sources: readonly string[]
  readonly dataFiles: readonly string[]
}
export interface SourceCoordinates {
  readonly root: string
  readonly kind: 'worktree' | 'revision'
  readonly commit: string
  readonly dirty: boolean
}
export interface ArchitectureSource {
  readonly snapshot: Snapshot
  readonly source: SourceCoordinates
  readonly patterns: readonly string[]
  readonly members: readonly ActualMember[]
  /** Naming-based discovery only; the resolver records applied config and extends files separately. */
  readonly discoveredConfigurationFiles: readonly string[]
}
const ignored = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.worktrees',
  'tmp',
  '.meta_harness',
])
const retained = (path: string) =>
  path === 'pnpm-workspace.yaml' || /\.[cm]?tsx?$/u.test(path) || path.endsWith('.json')
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
function jsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(jsonValue)
  return object(value) && Object.values(value).every(jsonValue)
}
function sourceTree(
  root: string,
  commit?: string,
): { texts: Map<string, string>; paths: string[] } {
  const texts = new Map<string, string>()
  const paths: string[] = []
  if (commit !== undefined) {
    for (const path of git(root, ['ls-tree', '-r', '--name-only', '-z', commit]).split('\0')) {
      if (path === '' || path.split('/').some(part => ignored.has(part))) continue
      paths.push(path)
      if (!retained(path)) continue
      // This path came from the fixed tree. A failed read is an error, never an absent file.
      const text = fileAt(root, commit, path)
      if (text === undefined) throw new Error(`Cannot read ${path} from fixed commit ${commit}`)
      texts.set(path, text)
    }
  } else {
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.isFile()) {
          const path = relative(root, full).replaceAll('\\', '/')
          paths.push(path)
          if (retained(path)) texts.set(path, readFileSync(full, 'utf8'))
        }
      }
    }
    walk(root)
  }
  return { texts, paths }
}
function virtualTree(texts: ReadonlyMap<string, string>): Tree {
  return {
    read: path => texts.get(path),
    directories: path => {
      const prefix = path === '' ? '' : `${path}/`
      return [
        ...new Set(
          [...texts.keys()]
            .filter(key => key.startsWith(prefix))
            .flatMap(key => {
              const rest = key.slice(prefix.length)
              return rest.includes('/') ? [rest.split('/')[0] ?? ''] : []
            }),
        ),
      ].sort()
    },
  }
}
function manifest(text: string, path: string): JsonValue {
  const value: unknown = JSON.parse(text)
  if (
    !object(value) ||
    typeof value['name'] !== 'string' ||
    value['name'] === '' ||
    !jsonValue(value)
  )
    throw new Error(`${path}: workspace manifest must be an object with a nonempty name`)
  return value
}
function patternsOf(texts: ReadonlyMap<string, string>): string[] {
  const yaml = texts.get('pnpm-workspace.yaml')
  if (yaml === undefined) throw new Error('Actual architecture requires pnpm-workspace.yaml')
  const patterns = workspacePatterns(yaml)
  for (const pattern of patterns)
    if (/[?{}\[\]]/u.test(pattern))
      throw new Error(`Unsupported workspace pattern ${pattern}: only whole-segment * is supported`)
  return patterns
}
function filesOf(
  member: string,
  inventory: readonly string[],
  members: readonly { readonly path: string }[],
): { sources: string[]; dataFiles: string[] } {
  const files = inventory
    .filter(path => ownerOf(path, members)?.path === member && path.startsWith(`${member}/src/`))
    .sort()
  return {
    sources: files.filter(path => /\.[cm]?tsx?$/u.test(path)),
    dataFiles: files.filter(path => !/\.[cm]?tsx?$/u.test(path)),
  }
}
function membersOf(
  texts: ReadonlyMap<string, string>,
  inventory: readonly string[],
  patterns: readonly string[],
): ActualMember[] {
  for (const [path, text] of texts)
    if (
      path.endsWith('/package.json') &&
      patterns.some(pattern => matchesGlob(dirname(path), pattern))
    )
      manifest(text, path)
  const declared = [
    ...new Map(
      listWorkspaceMembers(virtualTree(texts), []).map(item => [item.path, item]),
    ).values(),
  ]
  const names = new Set<string>()
  return declared
    .map(item => {
      if (names.has(item.name)) throw new Error(`Duplicate workspace package name: ${item.name}`)
      names.add(item.name)
      const path = `${item.path}/package.json`,
        text = texts.get(path)
      if (text === undefined) throw new Error(`${path}: listed workspace manifest disappeared`)
      return {
        id: item.path,
        path: item.path,
        name: item.name,
        category: /^(packages|apps)\//u.test(item.path)
          ? ('product' as const)
          : ('development' as const),
        manifest: { path, value: manifest(text, path) },
        ...filesOf(item.path, inventory, declared),
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}
export function readArchitectureSource(root: string, revision?: string): ArchitectureSource {
  root = resolve(root)
  if (resolve(git(root, ['rev-parse', '--show-toplevel'])) !== root)
    throw new Error('Actual architecture root must be the Git repository top-level directory')
  // Resolve once. All subsequent revision reads use this immutable commit, not the caller's ref.
  const commit = git(root, ['rev-parse', '--verify', `${revision ?? 'HEAD'}^{commit}`])
  const { texts, paths: inventory } = sourceTree(root, revision === undefined ? undefined : commit)
  const patterns = patternsOf(texts),
    members = membersOf(texts, inventory, patterns)
  const indexed: Member[] = members.map(item => ({
    path: item.path,
    name: item.name,
    group: dirname(item.path),
  }))
  const products = new Set(
    members.filter(item => item.category === 'product').map(item => item.path),
  )
  return {
    snapshot: {
      texts,
      members: indexed,
      analysisMembers: indexed.filter(item => products.has(item.path)),
    },
    source: {
      root,
      kind: revision === undefined ? 'worktree' : 'revision',
      commit,
      dirty: revision === undefined && git(root, ['status', '--porcelain']) !== '',
    },
    patterns,
    members,
    discoveredConfigurationFiles: [...texts.keys()]
      .filter(path => /^tsconfig[^/]*\.json$/u.test(path) || /\/tsconfig[^/]*\.json$/u.test(path))
      .sort(),
  }
}
