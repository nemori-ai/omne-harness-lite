import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isAbsolute, join, posix, relative } from 'node:path'
import { fileAt, git } from '../core/git.ts'
import {
  RULE_IDS,
  type ArchitectureConstraints,
  type ArchitectureImportException,
  type ArchitectureRole,
  type ConstraintInput,
  type Layer,
} from './conformance-model.ts'
import {
  readArchitectureSource,
  type ArchitectureSource,
  type SourceCoordinates,
} from './source.ts'

export const CONSTRAINT_PATH = 'docs/architecture/constraints.json'
export const LEGACY_CONSTRAINT_PATH = '.meta_harness/design/architecture/constraints.json'
export const CONSTRAINT_PATHS = [CONSTRAINT_PATH, LEGACY_CONSTRAINT_PATH] as const
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
function obj(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!record(v) || Object.keys(v).some(key => !keys.includes(key)))
    throw new Error('Architecture constraints contain invalid object fields')
  return v
}
function str(v: unknown): string {
  if (typeof v !== 'string' || v.trim() === '')
    throw new Error('Architecture constraints require nonempty strings')
  return v
}
function strings(v: unknown): string[] {
  if (!Array.isArray(v)) throw new Error('Architecture constraints require string arrays')
  const out = v.map(str)
  if (new Set(out).size !== out.length)
    throw new Error('Architecture constraints contain duplicate values')
  return out
}
function list(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error('Architecture constraints require arrays')
  return v
}
function unique<T extends { readonly id: string }>(values: T[]): T[] {
  if (new Set(values.map(v => v.id)).size !== values.length)
    throw new Error('Architecture constraints contain duplicate identities')
  return values
}
export function safePath(path: string): string {
  if (
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some(part => part === '..' || part === '.' || part === '') ||
    /[?[\]{}]/u.test(path) ||
    (path.includes('*') && !path.endsWith('/**')) ||
    path.slice(0, -3).includes('*')
  )
    throw new Error(`Invalid architecture path: ${path}`)
  return path
}
function memberPath(value: unknown): string {
  const path = safePath(str(value))
  if (!/^(packages\/[^/]+\/[^/]+|apps\/[^/]+)$/u.test(path))
    throw new Error(`Architecture exceptions require exact members: ${path}`)
  return path
}
function importException(value: unknown): ArchitectureImportException {
  const row = obj(value, ['id', 'member', 'target', 'symbols', 'sharedStorage', 'source'])
  const symbols = strings(row['symbols'])
  if (symbols.length === 0 || symbols.some(symbol => symbol.includes('*')))
    throw new Error('Architecture exceptions require exact nonempty symbols')
  return {
    id: str(row['id']),
    member: memberPath(row['member']),
    target: memberPath(row['target']),
    symbols,
    sharedStorage: str(row['sharedStorage']),
    source: str(row['source']),
  }
}
function importExceptions(value: unknown): ArchitectureImportException[] {
  const rows = unique(list(value === undefined ? [] : value).map(importException))
  const seen = new Set<string>()
  for (const row of rows)
    for (const symbol of row.symbols) {
      const key = JSON.stringify([row.member, row.target, symbol])
      if (seen.has(key)) throw new Error('Architecture exceptions repeat a member/target/symbol')
      seen.add(key)
    }
  return rows
}
export function parseConstraints(text: string): ArchitectureConstraints {
  const value = obj(JSON.parse(text), [
    'schemaVersion',
    'domains',
    'roles',
    'rules',
    'importExceptions',
  ])
  const schemaVersion = value['schemaVersion']
  if (schemaVersion !== 1 && schemaVersion !== 2)
    throw new Error('Unsupported architecture constraint schema')
  const domains = unique(
    list(value['domains']).map(item => {
      const row = obj(item, ['id', 'label', 'source'])
      return { id: str(row['id']), label: str(row['label']), source: str(row['source']) }
    }),
  )
  const domainIds = new Set(domains.map(d => d.id))
  const layers: readonly Layer[] = [
    'interaction',
    'policy',
    'contract',
    'storage-port',
    'storage-adapter',
    'assembly',
    'unknown',
  ]
  const roles = unique(
    list(value['roles']).map((item): ArchitectureRole => {
      const row = obj(item, ['id', 'paths', 'layer', 'domains', 'status', 'source'])
      const paths = strings(row['paths']).map(safePath),
        layer = str(row['layer']),
        status = str(row['status']),
        related = strings(row['domains'])
      if (
        paths.length === 0 ||
        !layers.some(v => v === layer) ||
        !['adopted', 'candidate', 'unknown'].includes(status) ||
        related.some(id => !domainIds.has(id))
      )
        throw new Error('Invalid architecture role')
      return {
        id: str(row['id']),
        paths,
        layer: layer as Layer,
        domains: related,
        status: status as ArchitectureRole['status'],
        source: str(row['source']),
      }
    }),
  )
  const rules = unique(
    list(value['rules']).map(item => {
      const row = obj(item, ['id', 'source']),
        id = str(row['id'])
      const known = RULE_IDS.find(rule => rule === id)
      if (known === undefined) throw new Error(`Unknown architecture rule ${id}`)
      return { id: known, source: str(row['source']) }
    }),
  )
  return {
    schemaVersion,
    domains,
    roles,
    rules,
    importExceptions: importExceptions(value['importExceptions']),
  }
}
export function readConstraints(root: string, source: SourceCoordinates): ConstraintInput {
  const document = readDocument(root, source)
  return { ...document, source }
}

export function readBaselineConstraints(
  root: string,
  baseline: ArchitectureSource,
): ConstraintInput {
  if (baseline.source.kind !== 'revision')
    throw new Error('Historical constraint retirement requires a revision snapshot')
  return {
    ...readDocument(root, baseline.source, [...baseline.snapshot.texts.keys()]),
    source: baseline.source,
  }
}

const legacySource = (path: string) => /^(?:apps|packages)\.0\.0\.1\.legacy\//u.test(path)
const matchesRolePath = (path: string, pattern: string) =>
  pattern.endsWith('/**') ? path.startsWith(pattern.slice(0, -2)) : path === pattern

function readDocument(
  root: string,
  source: Pick<SourceCoordinates, 'kind' | 'commit'>,
  baselinePaths?: readonly string[],
) {
  const read = versionReader(root, source)
  const present = CONSTRAINT_PATHS.flatMap(path => {
    const text = read(path)
    return text === undefined ? [] : [{ path, text }]
  })
  if (present.length > 1)
    throw new Error(
      `Ambiguous architecture constraints at ${source.kind} ${source.commit}: ${present.map(item => item.path).join(', ')}`,
    )
  const selected = present[0]
  if (selected === undefined) return { path: CONSTRAINT_PATH, value: null, sources: [] }
  try {
    const value = parseConstraints(selected.text)
    const retiredRoleIds = value.roles
      .filter(
        role =>
          baselinePaths !== undefined &&
          legacySource(constraintSourcePath(selected.path, value.schemaVersion, role.source)) &&
          !baselinePaths.some(path => role.paths.some(pattern => matchesRolePath(path, pattern))),
      )
      .map(role => role.id)
    const retained = {
      ...value,
      roles: value.roles.filter(role => !retiredRoleIds.includes(role.id)),
    }
    const sources = validateConstraintSources(selected.path, retained, read)
    return {
      path: selected.path,
      value,
      sources,
      ...(retiredRoleIds.length === 0 ? {} : { retiredRoleIds }),
    }
  } catch (error) {
    throw new Error(
      `${source.kind} ${source.commit} ${selected.path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

export function constraintDependencies(root: string, revision?: string): readonly string[] {
  const { path, value, sources } =
    revision === undefined
      ? readDocument(root, { kind: 'worktree', commit: git(root, ['rev-parse', 'HEAD']) })
      : readBaselineConstraints(root, readArchitectureSource(root, revision))
  if (value === null) return CONSTRAINT_PATHS
  return [path, ...sources.map(source => source.path)]
}

function versionReader(root: string, source: Pick<SourceCoordinates, 'kind' | 'commit'>) {
  const texts = new Map<string, string | undefined>()
  return (path: string): string | undefined => {
    safePath(path)
    if (texts.has(path)) return texts.get(path)
    let text: string | undefined
    if (source.kind === 'revision') {
      const entry = git(root, ['ls-tree', source.commit, '--', path])
      if (entry !== '') {
        if (!/^100(?:644|755) blob /u.test(entry))
          throw new Error(`Architecture input is not a regular file at ${source.commit}: ${path}`)
        text = fileAt(root, source.commit, path)
        if (text === undefined)
          throw new Error(`Cannot read architecture input at ${source.commit}: ${path}`)
      }
    } else if (lstatSync(join(root, path), { throwIfNoEntry: false }) !== undefined) {
      const actual = realpathSync(join(root, path))
      const contained = relative(realpathSync(root), actual)
      if (isAbsolute(contained) || contained === '..' || contained.startsWith('../'))
        throw new Error(`Architecture input escapes checkout: ${path}`)
      text = readFileSync(actual, 'utf8')
    }
    texts.set(path, text)
    return text
  }
}

export function constraintSourcePath(
  path: string,
  schemaVersion: 1 | 2,
  reference: string,
): string {
  const [raw, fragment, extra] = reference.split('#')
  if (
    raw === undefined ||
    raw === '' ||
    extra !== undefined ||
    fragment === '' ||
    raw.includes('?')
  )
    throw new Error(`Invalid architecture source: ${reference}`)
  const decoded = decodeURIComponent(raw)
  safePath(decoded)
  if (!decoded.endsWith('.md'))
    throw new Error(`Architecture source must be Markdown: ${reference}`)
  const rooted =
    schemaVersion === 2 || /^(?:packages|apps|docs|tools|scripts|\.meta_harness)\//u.test(decoded)
  return safePath(rooted ? decoded : posix.join(posix.dirname(path), decoded))
}

function markdownAnchors(text: string): Set<string> {
  const anchors = new Set<string>()
  let fence: string | undefined
  let previous = ''
  for (const line of text
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, '')
    .replace(/<!--[\s\S]*?(?:-->|$)/gu, '')
    .split(/\r?\n/u)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1]
    if (marker !== undefined) {
      if (fence === undefined) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
      previous = ''
      continue
    }
    if (fence !== undefined || /^(?: {4}|\t)/u.test(line)) continue
    const heading =
      /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line)?.[1] ??
      (/^ {0,3}(?:=+|-+)\s*$/u.test(line) ? previous : undefined)
    if (heading !== undefined && heading !== '') {
      const base = heading
        .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/gu, '$1')
        .replace(/<[^>]*>/gu, '')
        .replace(/[*`]/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\- ]/gu, '')
        .replaceAll(' ', '-')
      let anchor = base,
        suffix = 0
      while (anchors.has(anchor)) anchor = `${base}-${++suffix}`
      anchors.add(anchor)
    }
    for (const match of line
      .replace(/(`+).*?\1/gu, '')
      .matchAll(/<a\s+[^>]*?(?:id|name)=["']([^"']+)["'][^>]*>/gu)) {
      const anchor = match[1]
      if (anchor !== undefined) anchors.add(anchor)
    }
    previous = line.trim()
  }
  return anchors
}

function validateConstraintSources(
  path: string,
  value: ArchitectureConstraints,
  read: (path: string) => string | undefined,
): ConstraintInput['sources'] {
  const anchors = new Map<string, Set<string>>()
  const digests = new Map<string, string>()
  for (const row of [
    ...value.domains,
    ...value.roles,
    ...value.rules,
    ...(value.importExceptions ?? []),
  ]) {
    const target = constraintSourcePath(path, value.schemaVersion, row.source)
    if (legacySource(target))
      throw new Error(
        `${path} ${row.id}: legacy source is not an active architecture input: ${target}`,
      )
    const text = read(target)
    if (text === undefined)
      throw new Error(`${path} ${row.id}: missing source ${row.source} (${target})`)
    if (!digests.has(target)) digests.set(target, createHash('sha256').update(text).digest('hex'))
    const fragment = row.source.split('#')[1]
    if (fragment === undefined) continue
    const names = anchors.get(target) ?? markdownAnchors(text)
    anchors.set(target, names)
    if (!names.has(decodeURIComponent(fragment)))
      throw new Error(`${path} ${row.id}: missing source anchor ${row.source} (${target})`)
  }
  return [...digests]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, digest]) => ({ path, digest }))
}
export function semanticConstraints(value: ArchitectureConstraints | null): string | null {
  if (value === null) return null
  const sorted = <T extends { readonly id: string }>(items: readonly T[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id))
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    domains: sorted(value.domains),
    ...(value.importExceptions?.length
      ? {
          importExceptions: sorted(
            value.importExceptions.map(row => ({ ...row, symbols: [...row.symbols].sort() })),
          ),
        }
      : {}),
    rules: sorted(value.rules),
    roles: sorted(
      value.roles.map(row => ({
        id: row.id,
        paths: [...row.paths].sort(),
        layer: row.layer,
        domains: [...row.domains].sort(),
        status: row.status,
        source: row.source,
      })),
    ),
  })
}
export function roleAt(
  path: string,
  roles: readonly ArchitectureRole[],
): ArchitectureRole | undefined {
  const matches = roles
    .flatMap(role =>
      role.paths.flatMap(pattern => {
        const prefix = pattern.endsWith('/**') ? pattern.slice(0, -2) : undefined
        return matchesRolePath(path, pattern)
          ? [{ role, precision: prefix?.length ?? pattern.length + 1 }]
          : []
      }),
    )
    .sort((a, b) => b.precision - a.precision)
  const top = matches[0]
  if (
    top === undefined ||
    matches.some(item => item.precision === top.precision && item.role.id !== top.role.id)
  )
    return undefined
  return top.role
}
