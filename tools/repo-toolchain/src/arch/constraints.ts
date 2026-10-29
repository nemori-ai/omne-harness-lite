import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isAbsolute, join, posix, relative } from 'node:path'
import { fileAt, git } from '../core/git.ts'
import { runnerRoot } from '../core/subject.ts'
import { memberOf } from '../deps/graph.ts'
import {
  RULE_IDS,
  type ArchitectureConstraints,
  type ArchitectureDirection,
  type ArchitectureGroupCycleEdge,
  type ArchitectureGroupCycleException,
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
  if (!record(v)) throw new Error('Architecture constraints require objects')
  const unknown = Object.keys(v).filter(key => !keys.includes(key))
  if (unknown.length > 0)
    throw new Error(`Architecture constraints contain unknown fields: ${unknown.join(', ')}`)
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
/**
 * 角色所在的成员目录，按 deps/graph.ts 的 `memberOf` 算（`packages/<组>/<成员>` 或 `apps/<成员>`）。方向行按成员判目标，
 * 所以它引用的角色的每条 `paths` 都必须落在同一个成员里；`examples/` 不是方向行可引用的成员。
 */
export function roleMember(role: ArchitectureRole): string {
  const [member, ...rest] = role.paths.map(path => memberOf(path))
  if (member === undefined || rest.some(other => other?.path !== member.path))
    throw new Error(
      `Architecture role ${role.id} does not stay inside one member: ${role.paths.join(', ')}`,
    )
  if (member.group === 'examples')
    throw new Error(
      `Architecture role ${role.id} is in examples/, which directions cannot reference`,
    )
  return member.path
}
/** `pattern` 覆盖 `other`：两者相同，或 `other` 在 `pattern` 的 `/**` 目录之下。 */
const covers = (pattern: string, other: string): boolean =>
  pattern === other || (pattern.endsWith('/**') && other.startsWith(pattern.slice(0, -2)))
/** 方向行引用的一个角色与它的成员目录。 */
interface DirectionRoleRef {
  readonly id: string
  readonly member: string
}
/**
 * 方向行引用的角色：成员唯一，且 `paths` 不与任何别的角色相同或互相包含。否则一个文件会同时属于两个角色，
 * 源的归属就不唯一（更精确的角色会把 `src/**` 的一部分截走）。
 */
function directionRole(id: string, roles: ReadonlyMap<string, ArchitectureRole>): DirectionRoleRef {
  const role = roles.get(id)
  if (role === undefined) throw new Error(`Architecture direction references unknown role ${id}`)
  const member = roleMember(role)
  for (const other of roles.values()) {
    if (other.id === role.id) continue
    const overlap = role.paths.find(path =>
      other.paths.some(candidate => covers(path, candidate) || covers(candidate, path)),
    )
    if (overlap !== undefined)
      throw new Error(
        `Architecture role ${role.id} shares or contains the paths of ${other.id}: ${overlap}`,
      )
  }
  return { id, member }
}
const DIRECTION_ID = /^DIR-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u
type RoleRefs = readonly [DirectionRoleRef, ...DirectionRoleRef[]]
function roleRefs(v: unknown, roles: ReadonlyMap<string, ArchitectureRole>): RoleRefs {
  const [first, ...rest] = strings(v)
  if (first === undefined) throw new Error('Architecture directions require nonempty role lists')
  return [directionRole(first, roles), ...rest.map(id => directionRole(id, roles))]
}
const idsOf = ([first, ...rest]: RoleRefs): [string, ...string[]] => [
  first.id,
  ...rest.map(ref => ref.id),
]
/**
 * 源角色与目标角色不能在同一个成员里：成员内部的依赖不进依赖图，这样的一对永远不会命中。
 * 同一个角色同时出现在两边是它的特例。
 */
function rejectSameMember(id: string, from: RoleRefs, to: RoleRefs): void {
  for (const source of from) {
    const target = to.find(ref => ref.member === source.member)
    if (target !== undefined)
      throw new Error(
        `Architecture direction ${id} puts source role ${source.id} and target role ${target.id} in the same member ${source.member}`,
      )
  }
}
function direction(
  value: unknown,
  roles: ReadonlyMap<string, ArchitectureRole>,
): ArchitectureDirection {
  const row = obj(value, ['id', 'from', 'to', 'source'])
  const id = str(row['id'])
  if (!DIRECTION_ID.test(id)) throw new Error(`Invalid architecture direction id: ${id}`)
  const from = roleRefs(row['from'], roles),
    to = roleRefs(row['to'], roles)
  rejectSameMember(id, from, to)
  return { id, from: idsOf(from), to: idsOf(to), source: str(row['source']) }
}
const LAYERS: readonly Layer[] = [
  'interaction',
  'policy',
  'contract',
  'storage-port',
  'storage-adapter',
  'assembly',
  'unknown',
]
const STATUSES: readonly ArchitectureRole['status'][] = ['adopted', 'candidate', 'unknown']
function role(item: unknown, domainIds: ReadonlySet<string>): ArchitectureRole {
  const row = obj(item, ['id', 'paths', 'layer', 'domains', 'status', 'source'])
  const paths = strings(row['paths']).map(safePath),
    layer = LAYERS.find(v => v === str(row['layer'])),
    status = STATUSES.find(v => v === str(row['status'])),
    related = strings(row['domains'])
  if (
    paths.length === 0 ||
    layer === undefined ||
    status === undefined ||
    related.some(id => !domainIds.has(id))
  )
    throw new Error('Invalid architecture role')
  return { id: str(row['id']), paths, layer, domains: related, status, source: str(row['source']) }
}
function rule(item: unknown): ArchitectureConstraints['rules'][number] {
  const row = obj(item, ['id', 'source']),
    id = str(row['id'])
  const known = RULE_IDS.find(candidate => candidate === id)
  if (known === undefined) throw new Error(`Unknown architecture rule ${id}`)
  return { id: known, source: str(row['source']) }
}
/** schema 3 的 `directions`：缺省是没有方向行；给了就必须是数组（`null` 也不行）。 */
function directions(value: unknown, roles: readonly ArchitectureRole[]): ArchitectureDirection[] {
  const byId = new Map(roles.map(declared => [declared.id, declared]))
  return unique((value === undefined ? [] : list(value)).map(item => direction(item, byId)))
}
/** 成员路径：与 deps/graph.ts 的 `memberOf` 给出的 `path` 同形（`packages/<组>/<包>`、`apps/<应用>`、`examples/<示例>`）。 */
function groupCycleMember(value: unknown): { path: string; group: string } {
  const path = safePath(str(value))
  const member = memberOf(`${path}/`)
  if (member?.path !== path)
    throw new Error(`Architecture group cycle exceptions require member paths: ${path}`)
  return { path, group: member.group }
}
function ruling(value: unknown): string {
  const text = str(value)
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error(`Architecture group cycle exceptions require an https ruling link: ${text}`)
  }
  if (url.protocol !== 'https:')
    throw new Error(`Architecture group cycle exceptions require an https ruling link: ${text}`)
  return text
}
function groupCycleEdge(value: unknown): ArchitectureGroupCycleEdge {
  const row = obj(value, ['from', 'to'])
  const from = groupCycleMember(row['from'])
  const to = groupCycleMember(row['to'])
  if (from.group === to.group)
    throw new Error(
      `Architecture group cycle exceptions require edges across groups: ${from.path} -> ${to.path}`,
    )
  return { from: from.path, to: to.path }
}
function groupCycleException(value: unknown): ArchitectureGroupCycleException {
  const row = obj(value, ['id', 'edges', 'ruling', 'reason'])
  const [first, ...rest] = list(row['edges']).map(groupCycleEdge)
  if (first === undefined)
    throw new Error('Architecture group cycle exceptions require at least one edge')
  return {
    id: str(row['id']),
    edges: [first, ...rest],
    ruling: ruling(row['ruling']),
    reason: str(row['reason']),
  }
}
/**
 * schema 3 的 `groupCycleExceptions`：缺省是没有例外；给了就必须是数组。同一条成员边在全部例外里只能出现一次：
 * 放行哪条边由哪条例外负责，不留两份裁定。
 */
function groupCycleExceptions(value: unknown): ArchitectureGroupCycleException[] {
  const rows = unique((value === undefined ? [] : list(value)).map(groupCycleException))
  const keys = rows.flatMap(row => row.edges.map(edge => `${edge.from}\u0000${edge.to}`))
  if (new Set(keys).size !== keys.length)
    throw new Error('Architecture group cycle exceptions repeat an edge')
  return rows
}
export function parseConstraints(text: string): ArchitectureConstraints {
  const parsed: unknown = JSON.parse(text)
  if (!record(parsed)) throw new Error('Architecture constraints require an object')
  const schemaVersion = parsed['schemaVersion']
  if (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3)
    throw new Error('Unsupported architecture constraint schema')
  const value = obj(parsed, [
    'schemaVersion',
    'domains',
    'roles',
    'rules',
    'importExceptions',
    ...(schemaVersion === 3 ? ['directions', 'groupCycleExceptions'] : []),
  ])
  const domains = unique(
    list(value['domains']).map(item => {
      const row = obj(item, ['id', 'label', 'source'])
      return { id: str(row['id']), label: str(row['label']), source: str(row['source']) }
    }),
  )
  const domainIds = new Set(domains.map(d => d.id))
  const roles = unique(list(value['roles']).map(item => role(item, domainIds)))
  return {
    schemaVersion,
    domains,
    roles,
    rules: unique(list(value['rules']).map(rule)),
    importExceptions: importExceptions(value['importExceptions']),
    ...(schemaVersion === 3
      ? {
          directions: directions(value['directions'], roles),
          groupCycleExceptions: groupCycleExceptions(value['groupCycleExceptions']),
        }
      : {}),
  }
}
/** 读哪一版：工作树读文件，历史版本读那个提交。 */
type DocumentAt =
  | { readonly kind: 'worktree' }
  | { readonly kind: 'revision'; readonly commit: string }
const at = (source: Pick<SourceCoordinates, 'kind' | 'commit'>): DocumentAt =>
  source.kind === 'worktree' ? { kind: 'worktree' } : { kind: 'revision', commit: source.commit }
const label = (source: Pick<SourceCoordinates, 'kind' | 'commit'>) =>
  `${source.kind} ${source.commit}`

export function readConstraints(root: string, source: SourceCoordinates): ConstraintInput {
  const document = readDocument(root, at(source), label(source))
  return { ...document, source }
}

export function readBaselineConstraints(
  root: string,
  baseline: ArchitectureSource,
): ConstraintInput {
  if (baseline.source.kind !== 'revision')
    throw new Error('Historical constraint retirement requires a revision snapshot')
  return {
    ...readDocument(root, at(baseline.source), label(baseline.source), [
      ...baseline.snapshot.texts.keys(),
    ]),
    source: baseline.source,
  }
}

const legacySource = (path: string) => /^(?:apps|packages)\.0\.0\.1\.legacy\//u.test(path)
export const matchesRolePath = (path: string, pattern: string): boolean =>
  pattern.endsWith('/**') ? path.startsWith(pattern.slice(0, -2)) : path === pattern

export type RunnerConstraints =
  | { readonly kind: 'missing'; readonly path: string }
  | { readonly kind: 'present'; readonly path: string; readonly value: ArchitectureConstraints }
/**
 * 运行检查器的仓库的 `constraints.json`（与 `cruiseConfig()` 同一个根）。`omne-deps` 的方向行只从这里读，
 * 被检查的检出改不了它。文件缺失返回 missing；存在但解析、校验或来源核对失败则抛错。
 */
export function readRunnerConstraints(root: string = runnerRoot()): RunnerConstraints {
  const document = readDocument(root, { kind: 'worktree' }, `runner ${root}`)
  return document.value === null
    ? { kind: 'missing', path: document.path }
    : { kind: 'present', path: document.path, value: document.value }
}

/** `where` 只进错误消息，说明读的是哪一版（或哪个 runner）。 */
function readDocument(
  root: string,
  source: DocumentAt,
  where: string,
  baselinePaths?: readonly string[],
) {
  const read = versionReader(root, source)
  const present = CONSTRAINT_PATHS.flatMap(path => {
    const text = read(path)
    return text === undefined ? [] : [{ path, text }]
  })
  if (present.length > 1)
    throw new Error(
      `Ambiguous architecture constraints at ${where}: ${present.map(item => item.path).join(', ')}`,
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
      `${where} ${selected.path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

export function constraintDependencies(root: string, revision?: string): readonly string[] {
  const { path, value, sources } =
    revision === undefined
      ? readDocument(root, { kind: 'worktree' }, `worktree ${git(root, ['rev-parse', 'HEAD'])}`)
      : readBaselineConstraints(root, readArchitectureSource(root, revision))
  if (value === null) return CONSTRAINT_PATHS
  return [path, ...sources.map(source => source.path)]
}

function versionReader(root: string, source: DocumentAt) {
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
  schemaVersion: ArchitectureConstraints['schemaVersion'],
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
    schemaVersion !== 1 || /^(?:packages|apps|docs|tools|scripts|\.meta_harness)\//u.test(decoded)
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
    ...(value.directions ?? []),
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
const sortedById = <T extends { readonly id: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => a.id.localeCompare(b.id))
/** 语义比较里的方向行：没有方向行时不出现这个键，所以 schema 3 不写 `directions` 与写空数组语义相同。 */
function semanticDirections(rows: ArchitectureConstraints['directions']) {
  if (!rows?.length) return {}
  return {
    directions: sortedById(
      rows.map(row => ({
        id: row.id,
        from: [...row.from].sort(),
        to: [...row.to].sort(),
        source: row.source,
      })),
    ),
  }
}
/** 语义比较里的组环例外：与方向行相同，没有例外时不出现这个键；例外内边的书写顺序不是语义。 */
function semanticGroupCycleExceptions(rows: ArchitectureConstraints['groupCycleExceptions']) {
  if (!rows?.length) return {}
  return {
    groupCycleExceptions: sortedById(
      rows.map(row => ({
        ...row,
        edges: row.edges
          .map(edge => ({ from: edge.from, to: edge.to }))
          .sort((a, b) => `${a.from}\u0000${a.to}`.localeCompare(`${b.from}\u0000${b.to}`)),
      })),
    ),
  }
}
export function semanticConstraints(value: ArchitectureConstraints | null): string | null {
  if (value === null) return null
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    domains: sortedById(value.domains),
    ...(value.importExceptions?.length
      ? {
          importExceptions: sortedById(
            value.importExceptions.map(row => ({ ...row, symbols: [...row.symbols].sort() })),
          ),
        }
      : {}),
    ...semanticDirections(value.directions),
    ...semanticGroupCycleExceptions(value.groupCycleExceptions),
    rules: sortedById(value.rules),
    roles: sortedById(
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
