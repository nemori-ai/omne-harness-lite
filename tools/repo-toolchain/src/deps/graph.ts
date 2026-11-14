import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ignoredDirectories, isUnderIgnored, nulSeparated } from '../core/git.ts'
import { isTestPath } from '../core/rule.ts'
import { runnerRoot } from '../core/subject.ts'

export interface Member {
  readonly path: string
  readonly group: string
  readonly name: string
}

export interface ImportSite {
  readonly path: string
  readonly line: number
  readonly specifier: string
}

export interface MemberEdge {
  readonly from: string
  readonly to: string
  readonly sites: readonly ImportSite[]
}

export interface FileDependency extends ImportSite {
  readonly resolved: string
}

export type DependencyFindingKind = 'dependency-rule' | 'file-cycle' | 'member-cycle'

export interface FindingEdge {
  readonly from: string
  readonly to: string
}

export interface DependencyFinding<Kind extends string = DependencyFindingKind> {
  readonly kind: Kind
  readonly rule: string
  readonly message: string
  readonly sites: readonly ImportSite[]
  readonly edges: readonly FindingEdge[]
}

export interface DependencyGraph {
  readonly members: readonly Member[]
  readonly modules: readonly string[]
  readonly edges: readonly MemberEdge[]
  readonly dependencies: readonly FileDependency[]
  readonly findings: readonly DependencyFinding[]
}

export class DependencyGraphUnavailable extends Error {
  override readonly name = 'DependencyGraphUnavailable'
}

export function memberOf(path: string): Member | undefined {
  const match =
    /^(packages\/[^/]+)\/([^/]+)\//u.exec(path) ?? /^(apps|examples)\/([^/]+)\//u.exec(path)
  const group = match?.[1]
  const name = match?.[2]
  if (group === undefined || name === undefined) return undefined
  return { path: `${group}/${name}`, group, name }
}

export function cycles(
  nodes: readonly string[],
  edges: readonly { readonly from: string; readonly to: string }[],
): string[][] {
  const next = new Map<string, string[]>()
  for (const node of nodes) next.set(node, [])
  for (const edge of edges) next.get(edge.from)?.push(edge.to)

  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []

  const connect = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)
    for (const target of next.get(node) ?? []) {
      if (!index.has(target)) {
        connect(target)
        low.set(node, Math.min(low.get(node) ?? 0, low.get(target) ?? 0))
      } else if (onStack.has(target)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(target) ?? 0))
      }
    }
    if (low.get(node) !== index.get(node)) return
    const component: string[] = []
    for (;;) {
      const top = stack.pop()
      if (top === undefined) break
      onStack.delete(top)
      component.push(top)
      if (top === node) break
    }
    if (component.length > 1) found.push(component.sort())
  }
  for (const node of [...nodes].sort()) if (!index.has(node)) connect(node)
  return found.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
}

export interface CruiseDependency {
  readonly module: string
  readonly resolved: string
  readonly couldNotResolve: boolean
  readonly dependencyTypes: readonly string[]
}
export interface CruiseModule {
  readonly source: string
  readonly dependencies: readonly CruiseDependency[]
  readonly couldNotResolve?: boolean
}
export interface CruiseViolation {
  readonly from: string
  readonly to: string
  readonly rule: { readonly name: string; readonly severity: string }
  readonly cycle?: readonly (string | { readonly name: string })[]
}
export interface CruiseOutput {
  readonly modules: readonly CruiseModule[]
  readonly summary: { readonly violations: readonly CruiseViolation[] }
}

export function cruiseConfig(): string {
  return join(runnerRoot(), '.dependency-cruiser.cjs')
}
function cruiseTsconfig(): string {
  return join(runnerRoot(), 'tsconfig.base.json')
}
const ROOTS = ['packages', 'apps', 'examples', 'tools', 'scripts']
const SCOPE = '@omne-harness/'

function cruiserBin(): string {
  for (let dir = dirname(fileURLToPath(import.meta.url)); ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs')
    if (existsSync(bin)) return bin
    if (dirname(dir) === dir)
      throw new DependencyGraphUnavailable('找不到本包依赖的 dependency-cruiser')
  }
}

export function requireCruiserTypeScript(bin: string): void {
  for (let dir = dirname(realpathSync(bin)); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules', 'typescript', 'package.json'))) return
    if (dirname(dir) === dir)
      throw new DependencyGraphUnavailable(
        'dependency-cruiser 找不到 TypeScript，无法解析 .ts。用 pnpm 时在 pnpm-workspace.yaml 的 packageExtensions 里给 dependency-cruiser 加上 typescript 依赖。',
      )
  }
}

export function cruise(root: string): CruiseOutput {
  const roots = ROOTS.filter(dir => existsSync(join(root, dir)))
  if (roots.length === 0) return { modules: [], summary: { violations: [] } }
  const bin = cruiserBin()
  requireCruiserTypeScript(bin)
  const args = [
    bin,
    '--config',
    cruiseConfig(),
    '--ts-config',
    cruiseTsconfig(),
    '--output-type',
    'json',
  ]
  const run = spawnSync(process.execPath, [...args, ...roots], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
  if (run.error !== undefined)
    throw new DependencyGraphUnavailable(`起不来 dependency-cruiser：${run.error.message}`, {
      cause: run.error,
    })
  try {
    return JSON.parse(run.stdout) as CruiseOutput
  } catch {
    throw new DependencyGraphUnavailable(
      `dependency-cruiser 没有给出依赖图（退出码 ${run.status}）：${run.stderr.trim()}`,
    )
  }
}

function ruleComments(): ReadonlyMap<string, string> {
  const require = createRequire(import.meta.url)
  const config = require(cruiseConfig()) as {
    forbidden?: readonly { readonly name: string; readonly comment?: string }[]
  }
  return new Map((config.forbidden ?? []).map(rule => [rule.name, rule.comment ?? '']))
}

function lineFinder(root: string): (path: string, specifier: string) => number {
  const texts = new Map<string, readonly string[]>()
  return (path, specifier) => {
    let lines = texts.get(path)
    if (lines === undefined) {
      try {
        lines = readFileSync(join(root, path), 'utf8').split('\n')
      } catch {
        lines = []
      }
      texts.set(path, lines)
    }
    const quoted = [`'${specifier}'`, `"${specifier}"`, `\`${specifier}\``]
    const index = lines.findIndex(line => quoted.some(item => line.includes(item)))
    return index === -1 ? 1 : index + 1
  }
}

function isProductSource(path: string, member: Member): boolean {
  return path.startsWith(`${member.path}/src/`) && !isTestPath(path)
}

const pairKey = (from: string, to: string) => `${from}\u0000${to}`

export function graphOf(root: string, output: CruiseOutput): DependencyGraph {
  const lineOf = lineFinder(root)
  const members = new Map<string, Member>()
  const note = (path: string) => {
    const member = memberOf(path)
    if (member !== undefined && !members.has(member.path)) members.set(member.path, member)
    return member
  }

  const modules = output.modules
    .filter(module => !module.couldNotResolve)
    .map(module => module.source)
    .filter(path => memberOf(path) !== undefined)
    .sort()
  const dependencies: FileDependency[] = []
  const edges = new Map<string, { from: string; to: string; sites: ImportSite[] }>()
  const specifierOf = new Map<string, string>()
  for (const module of output.modules) {
    const from = note(module.source)
    for (const dependency of module.dependencies) {
      if (dependency.couldNotResolve) continue
      specifierOf.set(pairKey(module.source, dependency.resolved), dependency.module)
      const to = note(dependency.resolved)
      if (from === undefined || to === undefined || from.path === to.path) continue
      const site = {
        path: module.source,
        line: lineOf(module.source, dependency.module),
        specifier: dependency.module,
      }
      dependencies.push({ ...site, resolved: dependency.resolved })
      if (!isProductSource(module.source, from)) continue
      const key = pairKey(from.path, to.path)
      let edge = edges.get(key)
      if (edge === undefined) {
        edge = { from: from.path, to: to.path, sites: [] }
        edges.set(key, edge)
      }
      edge.sites.push(site)
    }
  }
  const memberList = [...members.values()].sort((a, b) => a.path.localeCompare(b.path))
  const edgeList = [...edges.values()].sort((a, b) =>
    a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
  )

  const findings: DependencyFinding[] = []
  const comments = ruleComments()
  for (const violation of output.summary.violations) {
    const specifier = specifierOf.get(pairKey(violation.from, violation.to)) ?? violation.to
    const site = { path: violation.from, line: lineOf(violation.from, specifier), specifier }
    const fromMember = memberOf(violation.from)?.path
    const toMember = memberOf(violation.to)?.path
    const pair =
      fromMember !== undefined && toMember !== undefined && fromMember !== toMember
        ? [{ from: fromMember, to: toMember }]
        : []
    if (violation.rule.name === 'no-circular') {
      const path = (violation.cycle ?? []).map(step =>
        typeof step === 'string' ? step : step.name,
      )
      findings.push({
        kind: 'file-cycle',
        rule: violation.rule.name,
        message: `文件之间成环：${[violation.from, ...path].join(' → ')}`,
        sites: [site],
        edges: pair,
      })
      continue
    }
    const reason = comments.get(violation.rule.name)?.split(/(?<=\.)\s/u)[0] ?? ''
    findings.push({
      kind: 'dependency-rule',
      rule: violation.rule.name,
      message: `[${violation.rule.name}] ${violation.from} 依赖了 ${violation.to}${reason === '' ? '' : `：${reason}`}`,
      sites: [site],
      edges: pair,
    })
  }

  const firstSite = (from: string, to: string): ImportSite[] => {
    const site = edges.get(pairKey(from, to))?.sites[0]
    return site === undefined ? [] : [site]
  }
  for (const component of cycles(
    memberList.map(member => member.path),
    edgeList,
  )) {
    const inside = edgeList.filter(
      edge => component.includes(edge.from) && component.includes(edge.to),
    )
    findings.push({
      kind: 'member-cycle',
      rule: 'member-cycle',
      message: `成员之间成环：${component.join('、')}`,
      sites: inside.flatMap(edge => firstSite(edge.from, edge.to)),
      edges: inside.map(edge => ({ from: edge.from, to: edge.to })),
    })
  }
  return { members: memberList, modules, edges: edgeList, dependencies, findings }
}

const GRAPH_FORMAT = 'v8'

function cacheDirectory(root: string): string {
  // 不用 `--path-format=absolute`：Git 2.31 之前不认它，会原样回显，缓存就落到以它命名的相对目录里。
  const dir = resolve(root, git(root, ['rev-parse', '--git-common-dir']).toString().trim())
  return join(dir, 'omne-dep-graph')
}

export function workingGraph(root: string, hooks: WorkingGraphHooks = {}): DependencyGraph {
  const admission = admissionMode()
  const ignoredDirs = ignoredDirectories(root)
  const key = workingCacheEnabled() ? workingCacheKey(root, ignoredDirs) : undefined
  if (key !== undefined) {
    const hit = admission ? undefined : readWorkingCache(key.path, key, root)
    if (hit?.graph !== undefined) {
      note(`依赖图缓存：命中 working-${key.digest.slice(0, 12)}`)
      return hit.graph
    }
    if (hit?.changed !== undefined)
      note(`依赖图缓存：被忽略目录里的导入目标 ${hit.changed} 变了或不在了，重算`)
    else note(`依赖图缓存：未命中 working-${key.digest.slice(0, 12)}，重算`)
  }
  const output = cruise(root)
  const targets = targetDigests(root, ignoredTargets(output, ignoredDirs))
  const graph = graphOf(root, withoutIgnoredModules(output, ignoredDirs))
  hooks.afterCompute?.()
  if (key !== undefined) {
    const after = fingerprintOf(root, ignoredDirectories(root))
    if ('reason' in after || after.digest !== key.digest || changedTarget(root, targets))
      note('依赖图缓存：运行中输入有变化，这次不写缓存')
    else writeWorkingCache(key.path, key, graph, targets)
  }
  return graph
}

export interface WorkingGraphHooks {
  readonly afterCompute?: () => void
}

export function admissionMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const value = env.OMNE_ADMISSION
  if (value === undefined || value === '') return false
  if (value === '1') return true
  throw new Error(`环境变量 OMNE_ADMISSION 只能是 1 或不设，现在是 ${value}`)
}

function workingCacheKey(
  root: string,
  ignoredDirs: ReadonlySet<string>,
): (WorkingFingerprint & { readonly path: string }) | undefined {
  const key = fingerprintOf(root, ignoredDirs)
  if ('reason' in key) {
    note(`依赖图缓存：不可用（${key.reason}），重算`)
    return undefined
  }
  return { ...key, path: join(cacheDirectory(root), `working-${key.digest}.json`) }
}

export const WORKING_CACHE_SWITCH = 'OMNE_DEP_GRAPH_CACHE'
const WORKING_CACHE_KEEP = 10

function workingCacheEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return env[WORKING_CACHE_SWITCH] !== '0'
}

function note(line: string): void {
  if (process.stderr.isTTY === true) process.stderr.write(`${line}\n`)
}

export interface WorkingFingerprint {
  readonly digest: string
  readonly inputs: readonly string[]
}

export function workingGraphFingerprint(
  root: string,
  ignoredDirs: ReadonlySet<string> = ignoredDirectories(root),
  codePath: string = THIS_MODULE,
): WorkingFingerprint | undefined {
  const key = fingerprintOf(root, ignoredDirs, codePath)
  return 'reason' in key ? undefined : key
}

function fingerprintOf(
  root: string,
  ignoredDirs: ReadonlySet<string>,
  codePath: string = THIS_MODULE,
): WorkingFingerprint | { readonly reason: string } {
  try {
    const inputs = workingInputs(root, ignoredDirs, codePath)
    return { digest: sha256(inputs.join('\n')), inputs }
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) }
  }
}

const THIS_MODULE = fileURLToPath(import.meta.url)

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

function fileDigest(path: string): string {
  return existsSync(path) ? sha256(readFileSync(path)) : 'absent'
}

function cruiserVersion(): string {
  const manifest = join(dirname(cruiserBin()), '..', 'package.json')
  return (
    (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown }).version?.toString() ?? '?'
  )
}

function loadedConfigDigest(): string {
  const require = createRequire(import.meta.url)
  return sha256(JSON.stringify(require(cruiseConfig())))
}

function tsconfigDigests(file: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(file)) return []
  seen.add(file)
  if (!existsSync(file)) return ['absent']
  const text = readFileSync(file, 'utf8')
  const digests = [sha256(text)]
  for (const value of extendsOf(text)) {
    const target = resolveExtends(file, value)
    digests.push(
      ...(target === undefined ? [`unresolved ${value}`] : tsconfigDigests(target, seen)),
    )
  }
  return digests
}

function extendsOf(text: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const literal = /"extends"\s*:\s*"([^"]+)"/u.exec(text)?.[1]
    return literal === undefined ? [] : [literal]
  }
  const value = (parsed as { extends?: unknown } | null)?.extends
  if (typeof value === 'string') return [value]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function resolveExtends(from: string, value: string): string | undefined {
  const candidates =
    value.startsWith('.') || value.startsWith('/') || /^[a-zA-Z]:/u.test(value)
      ? [resolve(dirname(from), value), resolve(dirname(from), `${value}.json`)]
      : []
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  if (candidates.length > 0) return undefined
  const require = createRequire(from)
  for (const specifier of [value, `${value}.json`, `${value}/tsconfig.json`]) {
    try {
      return require.resolve(specifier)
    } catch {}
  }
  return undefined
}

function afterFields(record: string, count: number): string | undefined {
  let index = -1
  for (let seen = 0; seen < count; seen += 1) {
    index = record.indexOf(' ', index + 1)
    if (index === -1) return undefined
  }
  return record.slice(index + 1)
}

function changedPaths(root: string): string[] {
  const records = nulSeparated(
    git(root, [
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
      '--no-renames',
    ]).toString(),
  )
  const paths: string[] = []
  for (const record of records) {
    const path = record.startsWith('1 ')
      ? afterFields(record, 8)
      : record.startsWith('u ')
        ? afterFields(record, 10)
        : record.startsWith('? ') || record.startsWith('! ')
          ? record.slice(2)
          : undefined
    if (path !== undefined && path !== '') paths.push(path)
  }
  return paths
}

function contentIds(root: string, paths: readonly string[]): Map<string, string> {
  const ids = new Map<string, string>()
  const regular: string[] = []
  for (const path of paths) {
    let stat
    try {
      stat = lstatSync(join(root, path))
    } catch {
      ids.set(path, 'missing')
      continue
    }
    if (stat.isSymbolicLink()) ids.set(path, `link ${readlinkSync(join(root, path))}`)
    else if (!stat.isFile()) ids.set(path, stat.isDirectory() ? 'directory' : 'special')
    else if (/[\r\n]/u.test(path)) ids.set(path, `sha256 ${sha256(readFileSync(join(root, path)))}`)
    else regular.push(path)
  }
  if (regular.length > 0) {
    const hashes = git(
      root,
      ['hash-object', '--stdin-paths', '--no-filters'],
      Buffer.from(`${regular.join('\n')}\n`),
    )
      .toString()
      .split('\n')
      .filter(line => line !== '')
    if (hashes.length !== regular.length)
      throw new DependencyGraphUnavailable(
        `git hash-object 给了 ${hashes.length} 个摘要，要 ${regular.length} 个`,
      )
    regular.forEach((path, index) => ids.set(path, hashes[index] ?? ''))
  }
  return ids
}

function workingInputs(root: string, ignoredDirs: ReadonlySet<string>, codePath: string): string[] {
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim()
  const lines = [
    `format ${GRAPH_FORMAT}`,
    `code ${sha256(readFileSync(codePath))}`,
    `cruiser ${cruiserVersion()}`,
    `config ${sha256(readFileSync(cruiseConfig()))} ${loadedConfigDigest()}`,
    ...tsconfigDigests(cruiseTsconfig()).map(digest => `tsconfig ${digest}`),
    `head ${head}`,
    `roots ${ROOTS.filter(dir => existsSync(join(root, dir))).join(' ')}`,
    `lock ${fileDigest(join(root, 'pnpm-lock.yaml'))}`,
    `modules ${fileDigest(join(root, 'node_modules', '.modules.yaml'))}`,
    `ignored-dirs ${[...ignoredDirs].sort().join(' ')}`,
  ]
  const changed = [...new Set(changedPaths(root))].sort()
  const ignored = nulSeparated(
    git(root, [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--directory',
      '-z',
    ]).toString(),
  ).sort()
  const ignoredFiles = ignored.filter(path => !path.endsWith('/'))
  const ids = contentIds(root, [...new Set([...changed, ...ignoredFiles])])
  for (const path of changed) lines.push(`changed ${path} ${ids.get(path) ?? ''}`)
  for (const path of ignored)
    lines.push(
      path.endsWith('/')
        ? `ignored-dir ${path.slice(0, -1)}`
        : `ignored-file ${path} ${ids.get(path) ?? ''}`,
    )
  return lines
}

interface WorkingCacheEntry {
  readonly format: string
  readonly fingerprint: string
  readonly inputs: readonly string[]
  readonly targets: Readonly<Record<string, string>>
  readonly graph: DependencyGraph
}

function ignoredTargets(output: CruiseOutput, ignoredDirs: ReadonlySet<string>): string[] {
  if (ignoredDirs.size === 0) return []
  const found = new Set<string>()
  for (const module of output.modules) {
    if (isUnderIgnored(module.source, ignoredDirs)) continue
    for (const dependency of module.dependencies) {
      if (dependency.couldNotResolve) continue
      const target = dependency.resolved
      if (target.split('/').includes('node_modules')) continue
      if (isUnderIgnored(target, ignoredDirs)) found.add(target)
    }
  }
  return [...found].sort()
}

function targetDigests(root: string, targets: readonly string[]): Record<string, string> {
  return Object.fromEntries(targets.map(target => [target, fileDigest(join(root, target))]))
}

function changedTarget(
  root: string,
  targets: Readonly<Record<string, string>>,
): string | undefined {
  return Object.entries(targets).find(
    ([target, digest]) => fileDigest(join(root, target)) !== digest,
  )?.[0]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const hasStrings = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  isRecord(value) && keys.every(key => typeof value[key] === 'string')

function isGraph(value: unknown): value is DependencyGraph {
  if (!isRecord(value)) return false
  const { members, modules, edges, dependencies, findings } = value
  return (
    Array.isArray(members) &&
    members.every(member => hasStrings(member, ['path', 'group', 'name'])) &&
    Array.isArray(modules) &&
    modules.every(module => typeof module === 'string') &&
    Array.isArray(edges) &&
    edges.every(
      edge =>
        hasStrings(edge, ['from', 'to']) && Array.isArray((edge as { sites?: unknown }).sites),
    ) &&
    Array.isArray(dependencies) &&
    dependencies.every(
      dependency =>
        hasStrings(dependency, ['path', 'specifier', 'resolved']) &&
        typeof (dependency as { line?: unknown }).line === 'number',
    ) &&
    Array.isArray(findings) &&
    findings.every(
      finding =>
        hasStrings(finding, ['kind', 'rule', 'message']) &&
        Array.isArray((finding as { sites?: unknown }).sites) &&
        Array.isArray((finding as { edges?: unknown }).edges),
    )
  )
}

function readWorkingCache(
  path: string,
  key: WorkingFingerprint,
  root: string,
): { readonly graph?: DependencyGraph; readonly changed?: string } | undefined {
  let entry: Partial<WorkingCacheEntry> | undefined
  try {
    entry = JSON.parse(readFileSync(path, 'utf8')) as Partial<WorkingCacheEntry>
  } catch {
    return undefined
  }
  if (
    typeof entry !== 'object' ||
    entry === null ||
    entry.format !== GRAPH_FORMAT ||
    entry.fingerprint !== key.digest ||
    !isGraph(entry.graph) ||
    typeof entry.targets !== 'object' ||
    entry.targets === null ||
    Array.isArray(entry.targets) ||
    !Object.values(entry.targets).every(digest => typeof digest === 'string')
  )
    return undefined
  const changed = changedTarget(root, entry.targets)
  if (changed !== undefined) return { changed }
  try {
    const now = new Date()
    utimesSync(path, now, now)
  } catch {}
  return { graph: entry.graph }
}

function writeWorkingCache(
  path: string,
  key: WorkingFingerprint,
  graph: DependencyGraph,
  targets: Readonly<Record<string, string>>,
): void {
  const entry: WorkingCacheEntry = {
    format: GRAPH_FORMAT,
    fingerprint: key.digest,
    inputs: key.inputs,
    targets,
    graph,
  }
  try {
    mkdirSync(dirname(path), { recursive: true })
    const staged = `${path}.${process.pid}.tmp`
    writeFileSync(staged, JSON.stringify(entry))
    renameSync(staged, path)
  } catch {
    return
  }
  pruneWorkingCache(dirname(path))
}

function pruneWorkingCache(directory: string): void {
  try {
    const entries = readdirSync(directory)
      .filter(name => name.startsWith('working-') && name.endsWith('.json'))
      .map(name => ({ name, mtime: statSync(join(directory, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const entry of entries.slice(WORKING_CACHE_KEEP)) {
      try {
        unlinkSync(join(directory, entry.name))
      } catch {}
    }
  } catch {}
}

function withoutIgnoredModules(
  output: CruiseOutput,
  ignoredDirs: ReadonlySet<string>,
): CruiseOutput {
  if (ignoredDirs.size === 0) return output
  return {
    modules: output.modules.filter(module => !isUnderIgnored(module.source, ignoredDirs)),
    summary: {
      violations: output.summary.violations.filter(
        violation => !isUnderIgnored(violation.from, ignoredDirs),
      ),
    },
  }
}

export function linkWorkspace(root: string, into: string): void {
  const scope = join(into, SCOPE.slice(0, -1))
  const visit = (directory: string, depth: number): void => {
    let entries: string[]
    try {
      entries = readdirSync(join(root, directory))
    } catch {
      return
    }
    if (entries.includes('package.json') && directory !== '') {
      try {
        const name = (
          JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8')) as {
            name?: unknown
          }
        ).name
        if (typeof name === 'string' && name.startsWith(SCOPE)) {
          const link = join(scope, name.slice(SCOPE.length))
          mkdirSync(scope, { recursive: true })
          let present = false
          try {
            lstatSync(link)
            present = true
          } catch {
            present = false
          }
          if (!present) symlinkSync(resolve(root, directory), link, 'dir')
        }
      } catch {}
    }
    if (depth === 0) return
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const path = directory === '' ? entry : `${directory}/${entry}`
      try {
        if (lstatSync(join(root, path)).isDirectory()) visit(path, depth - 1)
      } catch {}
    }
  }
  for (const top of ROOTS) visit(top, 2)
}

function git(root: string, args: readonly string[], input?: Buffer): Buffer {
  const run = spawnSync('git', ['-C', root, ...args], {
    ...(input === undefined ? {} : { input }),
    maxBuffer: 1024 * 1024 * 1024,
  })
  if (run.status !== 0)
    throw new DependencyGraphUnavailable(
      `git ${args.join(' ')} 失败：${run.stderr.toString().trim()}`,
    )
  return run.stdout
}

const TREE_NAME = /^tree-[0-9a-f]+-(\d+)$/u

export const STALE_TREE_GRACE_MS = 10 * 60 * 1000

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function removeTree(tree: string): Error | undefined {
  try {
    rmSync(tree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    return undefined
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

export function sweepStaleTrees(
  directory: string,
  alive: (pid: number) => boolean = processAlive,
  now: number = Date.now(),
): string[] {
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return []
  }
  const removed: string[] = []
  for (const name of names) {
    const pid = TREE_NAME.exec(name)?.[1]
    if (pid === undefined || alive(Number(pid))) continue
    const tree = join(directory, name)
    try {
      if (now - statSync(tree).mtimeMs < STALE_TREE_GRACE_MS) continue
    } catch {
      continue
    }
    const failed = removeTree(tree)
    if (failed === undefined) removed.push(name)
    else process.stderr.write(`旧的基线图临时树 ${tree} 没删掉：${failed.message}\n`)
  }
  return removed
}

function readRevisionCache(path: string): DependencyGraph | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
  return isGraph(parsed) ? parsed : undefined
}

export function revisionGraph(root: string, revision: string): DependencyGraph {
  const commit = git(root, ['rev-parse', '--verify', `${revision}^{commit}`])
    .toString()
    .trim()
  const rules = sha256(
    `${sha256(readFileSync(cruiseConfig()))} ${sha256(readFileSync(THIS_MODULE))}`,
  ).slice(0, 12)
  const directory = cacheDirectory(root)
  sweepStaleTrees(directory)
  const cached = join(directory, `${commit}-${rules}-${GRAPH_FORMAT}.json`)
  const hit = readRevisionCache(cached)
  if (hit !== undefined) return hit

  const present = new Set(
    git(root, ['ls-tree', '--name-only', commit]).toString().split('\n').filter(Boolean),
  )
  const paths = [...ROOTS, 'tsconfig.base.json', 'package.json'].filter(path => present.has(path))
  const tree = join(directory, `tree-${commit}-${process.pid}`)
  const leftover = removeTree(tree)
  if (leftover !== undefined)
    throw new DependencyGraphUnavailable(`清不掉 ${tree}：${leftover.message}`)
  mkdirSync(tree, { recursive: true })
  try {
    if (paths.length > 0) {
      const archive = git(root, ['archive', '--format=tar', commit, '--', ...paths])
      const untar = spawnSync('tar', ['-x'], {
        cwd: tree,
        input: archive,
        maxBuffer: 64 * 1024 * 1024,
      })
      if (untar.status !== 0)
        throw new DependencyGraphUnavailable(`解开 ${commit} 失败：${untar.stderr.toString()}`)
    }
    linkWorkspace(tree, join(tree, 'node_modules'))
    const full = graphOf(tree, cruise(tree))
    const graph = {
      ...full,
      findings: full.findings.filter(finding => finding.rule !== 'no-unresolvable'),
    }
    const staged = `${cached}.${process.pid}`
    writeFileSync(staged, JSON.stringify(graph))
    renameSync(staged, cached)
    return graph
  } finally {
    const failed = removeTree(tree)
    if (failed !== undefined)
      process.stderr.write(`基线图临时树 ${tree} 没删掉：${failed.message}；下次运行时再清\n`)
  }
}
