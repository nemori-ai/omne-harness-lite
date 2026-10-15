import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, matchesGlob, relative, resolve } from 'node:path'
import { isLegacyDirectory, isLegacyFile } from '../check-scope.ts'
import { git } from '../metrics/git.ts'
import { readRevisionTexts } from '../metrics/revision-files.ts'
import { listWorkspaceMembers, ownerOf, workspacePatterns, type Tree } from '../testing/members.ts'
import type { Member } from '../deps/graph.ts'
import type { Snapshot } from './actual-model.ts'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }
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
  /** Git changes or read inputs absent from the recorded commit. */
  readonly inputDirty: boolean
  readonly unversionedInputs: readonly string[]
}
export interface ArchitectureSource {
  readonly snapshot: Snapshot
  readonly source: SourceCoordinates
  readonly patterns: readonly string[]
  readonly members: readonly ActualMember[]
  /** Naming-based discovery only; the resolver records applied config and extends files separately. */
  readonly discoveredConfigurationFiles: readonly string[]
}
const ignored = new Set(['node_modules', '.git', '.worktrees', '.venv', 'tmp', '.meta_harness'])
const ignoredPath = (path: string) =>
  isLegacyFile(path) ||
  ignored.has(path.split('/')[0] ?? '') ||
  path.split('/').includes('node_modules')
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
      if (path === '' || ignoredPath(path)) continue
      paths.push(path)
    }
    for (const [path, text] of readRevisionTexts(root, commit, paths.filter(retained)))
      texts.set(path, text)
  } else {
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        const path = relative(root, full).replaceAll('\\', '/')
        if (ignoredPath(path)) continue
        if (entry.isDirectory()) {
          if (!isLegacyDirectory(full)) walk(full)
        } else if (entry.isFile()) {
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
    if (/[?{}[\]]/u.test(pattern))
      throw new Error(`Unsupported workspace pattern ${pattern}: only whole-segment * is supported`)
  return patterns
}
function filesByOwner(
  inventory: readonly string[],
  members: readonly { readonly path: string }[],
): Map<string, { sources: string[]; dataFiles: string[] }> {
  const out = new Map<string, { sources: string[]; dataFiles: string[] }>()
  for (const path of [...inventory].sort()) {
    const owner = ownerOf(path, members)
    if (owner === undefined || !path.startsWith(`${owner.path}/src/`)) continue
    const files = out.get(owner.path) ?? { sources: [], dataFiles: [] }
    out.set(owner.path, files)
    if (/\.[cm]?tsx?$/u.test(path)) files.sources.push(path)
    else files.dataFiles.push(path)
  }
  return out
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
  const files = filesByOwner(inventory, declared)
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
        ...(files.get(item.path) ?? { sources: [], dataFiles: [] }),
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
  // Build directories belong to a member. A member or src directory named dist is still source.
  for (const path of texts.keys()) {
    const owner = ownerOf(path, members)?.path
    if (owner !== undefined && /^(dist|coverage)\//u.test(path.slice(owner.length + 1)))
      texts.delete(path)
  }
  const dirty = revision === undefined && git(root, ['status', '--porcelain']) !== ''
  const versioned = new Set(git(root, ['ls-tree', '-r', '--name-only', '-z', commit]).split('\0'))
  const unversionedInputs =
    revision === undefined
      ? [...new Set([...texts.keys(), ...members.flatMap(member => member.dataFiles)])]
          .filter(path => !versioned.has(path))
          .sort()
      : []
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
      dirty,
      inputDirty: dirty || unversionedInputs.length > 0,
      unversionedInputs,
    },
    patterns,
    members,
    discoveredConfigurationFiles: [...texts.keys()]
      .filter(path => /^tsconfig[^/]*\.json$/u.test(path) || /\/tsconfig[^/]*\.json$/u.test(path))
      .sort(),
  }
}
