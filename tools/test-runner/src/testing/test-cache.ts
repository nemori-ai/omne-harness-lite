import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import {
  fileTree,
  listWorkspaceMembers,
  type WorkspaceMember,
} from '@omne-harness/repo-toolchain/core/workspace'
import { isRunTier, type CacheRules, type RunTier, type TestRunsConfig } from './config.ts'
import type { MemberRun } from './ledger.ts'
import { testCount } from './ledger.ts'
import { slugOf } from './run.ts'
import { classify, patternToRegExp, type ClassifiedFile } from './scope.ts'
import { admissionRequested, packageGraph, TIER_TASKS, type PackageGraph } from './turbo.ts'

export const TEST_CACHE_ENV = 'OMNE_TEST_CACHE'
export const TEST_CACHE_HOME_ENV = 'OMNE_TEST_CACHE_HOME'
export const TEST_CACHE_DIR = 'tmp/test-cache'

export function cacheHome(mainRoot: string, env: Readonly<Record<string, string | undefined>>) {
  const value = env[TEST_CACHE_HOME_ENV]
  return value === undefined || value === '' ? join(mainRoot, TEST_CACHE_DIR) : value
}

export interface CachePolicy {
  readonly read: boolean
  readonly reason: string
  readonly trustedOnly: boolean
  readonly write: boolean
  readonly writeReason: string
}

export function cachePolicy(
  env: Readonly<Record<string, string | undefined>>,
  options: {
    readonly noCache: boolean
    readonly full: boolean
    readonly build: boolean
    readonly unbuiltReason?: string
  },
): CachePolicy {
  const value = env[TEST_CACHE_ENV]
  if (value !== undefined && value !== '' && value !== '0' && value !== '1')
    throw new Error(`环境变量 ${TEST_CACHE_ENV} 只能是 0、1 或不设，现在是 ${value}`)
  const write = options.build
    ? { write: true, writeReason: '' }
    : {
        write: false,
        writeReason: options.unbuiltReason ?? '本次没有构建，测试可能跑的是旧 dist',
      }
  const unread = { read: false, trustedOnly: false, ...write }
  if (options.full) return { ...unread, reason: 'FULL=1 要求全量' }
  if (options.noCache) return { ...unread, reason: '--no-cache' }
  if (value === '0') return { ...unread, reason: `${TEST_CACHE_ENV}=0` }
  return { read: true, reason: '', trustedOnly: admissionRequested(env), ...write }
}

export type Snapshot = ReadonlyMap<string, string>

function git(root: string, args: readonly string[], input?: string): string {
  return execFileSync('git', args, {
    env: repositoryEnv(process.env),
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(input === undefined ? {} : { input }),
  })
}

export function snapshotTree(root: string): Snapshot {
  const snapshot = new Map<string, string>()
  const rehash = new Set<string>()
  for (const line of nulSeparated(git(root, ['ls-files', '-s', '-z']))) {
    const tab = line.indexOf('\t')
    const [, blob, stage] = line.slice(0, tab).split(' ')
    const path = line.slice(tab + 1)
    if (blob === undefined || stage === undefined)
      throw new Error(`git ls-files -s 的一行认不出：${line}`)
    if (stage !== '0') rehash.add(path)
    else snapshot.set(path, blob)
  }
  for (const path of nulSeparated(git(root, ['ls-files', '-d', '-z']))) {
    snapshot.delete(path)
    rehash.delete(path)
  }
  for (const path of nulSeparated(git(root, ['diff', '--name-only', '-z'])))
    if (snapshot.has(path) || rehash.has(path)) rehash.add(path)
  for (const path of nulSeparated(git(root, ['ls-files', '--others', '--exclude-standard', '-z'])))
    rehash.add(path)
  if (rehash.size === 0) return snapshot
  const paths = [...rehash]
  const hashed = git(root, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`)
    .split('\n')
    .filter(line => line !== '')
  if (hashed.length !== paths.length)
    throw new Error(`git hash-object 给了 ${hashed.length} 个 id，要的是 ${paths.length} 个`)
  for (const [index, path] of paths.entries()) snapshot.set(path, hashed[index] ?? '')
  return snapshot
}

export function selects(
  file: ClassifiedFile,
  member: string,
  upstream: ReadonlySet<string>,
): boolean {
  switch (file.category) {
    case 'excluded':
      return false
    case 'global':
    case 'unclassified':
      return true
    case 'lockfile':
      return true
    case 'reader':
    case 'member':
    case 'python':
    case 'resident':
      return (
        file.reads.some(hit => hit.members.includes(member)) ||
        file.owner === member ||
        (file.owner !== undefined && upstream.has(file.owner))
      )
    default: {
      const exhaustive: never = file.category
      return exhaustive
    }
  }
}

export function memberInputs(
  member: string,
  files: readonly ClassifiedFile[],
  upstream: ReadonlySet<string>,
): string[] {
  return files
    .filter(file => selects(file, member, upstream))
    .map(file => file.path)
    .sort()
}

export function upstreamOf(
  member: WorkspaceMember,
  members: readonly WorkspaceMember[],
  graph: PackageGraph,
): Set<string> {
  const byName = new Map(members.map(entry => [entry.name, entry.path]))
  const upstream = new Set<string>()
  const pending = [member.name]
  while (pending.length > 0) {
    const name = pending.pop() ?? ''
    const entry = graph.get(name)
    if (entry === undefined) throw new Error(`turbo 的包依赖图里没有 ${name}`)
    for (const dependency of entry.dependencies) {
      const path = byName.get(dependency)
      if (path === undefined)
        throw new Error(`${name} 依赖的 ${dependency} 不在 workspace 成员清单里`)
      if (path === member.path || upstream.has(path)) continue
      upstream.add(path)
      pending.push(dependency)
    }
  }
  return upstream
}

export function keyEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  rules: CacheRules,
): Record<string, string> {
  const patterns = rules.env.map(pattern => patternToRegExp(pattern))
  const picked: Record<string, string> = {}
  for (const name of Object.keys(env).sort()) {
    const value = env[name]
    if (value === undefined || rules.ignoreEnv.includes(name)) continue
    if (patterns.some(pattern => pattern.test(name))) picked[name] = value
  }
  return picked
}

export interface KeyInputs {
  readonly member: string
  readonly tier: RunTier
  readonly files: readonly (readonly [path: string, blob: string])[]
  readonly platform: string
  readonly arch: string
  readonly node: string
  readonly env: Readonly<Record<string, string>>
}

export const KEY_VERSION = 1

function hashInputs(inputs: KeyInputs, task: string | undefined): string {
  const files = [...inputs.files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const env = Object.fromEntries(Object.entries(inputs.env).sort(([a], [b]) => (a < b ? -1 : 1)))
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: KEY_VERSION,
        member: inputs.member,
        ...(task === undefined ? {} : { task }),
        platform: inputs.platform,
        arch: inputs.arch,
        node: inputs.node,
        env,
        files,
      }),
    )
    .digest('hex')
}

export function cacheKey(inputs: KeyInputs): string {
  return hashInputs(inputs, TIER_TASKS[inputs.tier])
}

export function inputDigest(inputs: KeyInputs): string {
  return hashInputs(inputs, undefined)
}

export const BUILT_FROM_FILE = 'built-from.json'

export interface BuiltMember {
  readonly input: string
  readonly output?: string
}

export function builtFromPath(planPath: string): string {
  return join(dirname(planPath), BUILT_FROM_FILE)
}

export function clearBuiltFrom(path: string): void {
  rmSync(path, { force: true })
}

export function writeBuiltFrom(
  path: string,
  head: string,
  members: ReadonlyMap<string, Required<BuiltMember>>,
): void {
  mkdirSync(dirname(path), { recursive: true })
  const sorted = [...members].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  writeFileSync(path, `${JSON.stringify({ head, members: Object.fromEntries(sorted) }, null, 1)}\n`)
}

export type BuiltFromRead =
  | { readonly status: 'ok'; readonly members: ReadonlyMap<string, BuiltMember> }
  | { readonly status: 'missing' }
  | { readonly status: 'other-head'; readonly recorded: string }
  | { readonly status: 'legacy' }

export function readBuiltFrom(path: string, head: string): BuiltFromRead {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { status: 'missing' }
  }
  if (typeof parsed !== 'object' || parsed === null) return { status: 'missing' }
  const { head: recorded, members } = parsed as Record<string, unknown>
  if (typeof recorded !== 'string' || typeof members !== 'object' || members === null)
    return { status: 'missing' }
  const digests = new Map<string, BuiltMember>()
  for (const [member, entry] of Object.entries(members)) {
    const { input, output } = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >
    if (typeof input !== 'string' || typeof output !== 'string') return { status: 'legacy' }
    digests.set(member, { input, output })
  }
  if (recorded !== head) return { status: 'other-head', recorded }
  return { status: 'ok', members: digests }
}

function listFiles(dir: string, prefix = ''): string[] | undefined {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return undefined
  }
  const lines: string[] = []
  for (const name of names) {
    const path = join(dir, name)
    const stat = lstatSync(path)
    if (stat.isDirectory()) lines.push(...(listFiles(path, `${prefix}${name}/`) ?? []))
    else lines.push(`${prefix}${name}\t${stat.size}\t${stat.mtimeMs}`)
  }
  return lines
}

export function distDigest(root: string, memberPath: string): string {
  const lines = listFiles(join(root, memberPath, 'dist'))
  if (lines === undefined) return 'absent'
  return createHash('sha256').update(lines.sort().join('\n')).digest('hex')
}

export function outputDigests(options: {
  readonly root: string
  readonly targets: readonly string[]
  readonly config: TestRunsConfig
}): Map<string, string> {
  const members = listWorkspaceMembers(fileTree(options.root), options.config.affected.excludeRoots)
  const graph = packageGraph(options.root)
  const byPath = new Map(members.map(member => [member.path, member]))
  const dists = new Map<string, string>()
  const distOf = (path: string) => {
    const known = dists.get(path)
    if (known !== undefined) return known
    const digest = distDigest(options.root, path)
    dists.set(path, digest)
    return digest
  }
  const result = new Map<string, string>()
  for (const target of options.targets) {
    const member = byPath.get(target)
    if (member === undefined) continue
    const paths = [target, ...[...upstreamOf(member, members, graph)].sort()]
    result.set(
      target,
      createHash('sha256')
        .update(JSON.stringify(paths.map(path => [path, distOf(path)])))
        .digest('hex'),
    )
  }
  return result
}

export interface CacheEntry {
  readonly version: typeof KEY_VERSION
  readonly member: string
  readonly tier: RunTier
  readonly key: string
  readonly ledger: string
  readonly head: string
  readonly dirty: boolean
  readonly recordedAt: string
  readonly tests: number
  readonly files: number
  readonly wallSeconds: number
  readonly inputs: { readonly files: number; readonly node: string; readonly platform: string }
  readonly admission?: true
}

export function entryPath(home: string, member: string, tier: RunTier, key: string): string {
  return join(home, slugOf(member), `${tier}-${key}.json`)
}

export function isEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  const inputs = entry['inputs']
  return (
    entry['version'] === KEY_VERSION &&
    typeof entry['member'] === 'string' &&
    isRunTier(entry['tier']) &&
    typeof entry['key'] === 'string' &&
    typeof entry['ledger'] === 'string' &&
    typeof entry['head'] === 'string' &&
    typeof entry['dirty'] === 'boolean' &&
    typeof entry['recordedAt'] === 'string' &&
    typeof entry['tests'] === 'number' &&
    typeof entry['files'] === 'number' &&
    typeof entry['wallSeconds'] === 'number' &&
    (entry['admission'] === undefined || entry['admission'] === true) &&
    typeof inputs === 'object' &&
    inputs !== null &&
    typeof (inputs as Record<string, unknown>)['files'] === 'number' &&
    typeof (inputs as Record<string, unknown>)['node'] === 'string' &&
    typeof (inputs as Record<string, unknown>)['platform'] === 'string'
  )
}

export function readEntry(
  home: string,
  member: string,
  tier: RunTier,
  key: string,
): CacheEntry | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(entryPath(home, member, tier, key), 'utf8'))
  } catch {
    return undefined
  }
  if (!isEntry(parsed)) return undefined
  return parsed.member === member && parsed.tier === tier && parsed.key === key ? parsed : undefined
}

export function writeEntry(home: string, entry: CacheEntry): string | undefined {
  const path = entryPath(home, entry.member, entry.tier, entry.key)
  try {
    mkdirSync(join(home, slugOf(entry.member)), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(entry, null, 1)}\n`)
    renameSync(temporary, path)
    return undefined
  } catch (error) {
    return `${path}：${error instanceof Error ? error.message : String(error)}`
  }
}

export function cacheable(run: MemberRun): boolean {
  return (
    run.exitCode === 0 &&
    run.problem === undefined &&
    run.report !== undefined &&
    run.report.testResults.every(
      file =>
        file.status === 'passed' &&
        file.assertionResults.every(assertion => assertion.status !== 'failed'),
    )
  )
}

export interface CacheLookup {
  readonly home: string
  readonly policy: CachePolicy
  readonly keys: ReadonlyMap<string, MemberKey>
  readonly uncacheable: ReadonlyMap<string, string>
  readonly hits: ReadonlyMap<string, CacheEntry>
  readonly rekey: () => ReadonlyMap<string, MemberKey>
  readonly built?: ReadonlyMap<string, BuiltMember>
  readonly outputs?: () => ReadonlyMap<string, string>
  readonly unavailable?: string
}

export interface LookupOptions {
  readonly root: string
  readonly mainRoot: string
  readonly targets: readonly string[]
  readonly tier: RunTier
  readonly policy: CachePolicy
  readonly config: TestRunsConfig
  readonly env: Readonly<Record<string, string | undefined>>
}

export interface MemberKey {
  readonly key: string
  readonly digest: string
  readonly inputs: number
}

export function memberKeys(
  options: LookupOptions,
  members: readonly WorkspaceMember[],
  graph: PackageGraph,
  snapshot: Snapshot,
): { readonly keys: Map<string, MemberKey>; readonly uncacheable: Map<string, string> } {
  const { config, env, tier } = options
  const files = [...snapshot.keys()].map(path => classify(path, members, config.affected))
  const common = {
    tier,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    env: keyEnvironment(env, config.cache),
  }
  const byPath = new Map(members.map(member => [member.path, member]))
  const keys = new Map<string, MemberKey>()
  const uncacheable = new Map<string, string>()
  for (const target of options.targets) {
    const member = byPath.get(target)
    if (member === undefined) {
      uncacheable.set(target, '不在 workspace 成员清单里')
      continue
    }
    try {
      const upstream = upstreamOf(member, members, graph)
      const inputs = memberInputs(target, files, upstream).map(
        path => [path, snapshot.get(path) ?? ''] as const,
      )
      const keyInputs = { ...common, member: target, files: inputs }
      keys.set(target, {
        key: cacheKey(keyInputs),
        digest: inputDigest(keyInputs),
        inputs: inputs.length,
      })
    } catch (error) {
      uncacheable.set(target, error instanceof Error ? error.message : String(error))
    }
  }
  return { keys, uncacheable }
}

export function currentDigests(options: {
  readonly root: string
  readonly targets: readonly string[]
  readonly config: TestRunsConfig
  readonly env: Readonly<Record<string, string | undefined>>
}): Map<string, string> {
  const members = listWorkspaceMembers(fileTree(options.root), options.config.affected.excludeRoots)
  const { keys } = memberKeys(
    {
      ...options,
      mainRoot: options.root,
      tier: 'fast',
      policy: { read: false, reason: '', trustedOnly: false, write: false, writeReason: '' },
    },
    members,
    packageGraph(options.root),
    snapshotTree(options.root),
  )
  return new Map([...keys].map(([member, { digest }]) => [member, digest]))
}

export function lookupCache(options: LookupOptions): CacheLookup {
  const home = cacheHome(options.mainRoot, options.env)
  const { policy } = options
  try {
    const members = listWorkspaceMembers(
      fileTree(options.root),
      options.config.affected.excludeRoots,
    )
    const graph = packageGraph(options.root)
    const snapshot = snapshotTree(options.root)
    const { keys, uncacheable } = memberKeys(options, members, graph, snapshot)
    const hits = new Map<string, CacheEntry>()
    if (policy.read)
      for (const [member, { key }] of keys) {
        const entry = readEntry(home, member, options.tier, key)
        if (entry !== undefined && (!policy.trustedOnly || entry.admission === true))
          hits.set(member, entry)
      }
    return {
      home,
      policy,
      keys,
      uncacheable,
      hits,
      rekey: () => memberKeys(options, members, graph, snapshotTree(options.root)).keys,
      outputs: () =>
        outputDigests({ root: options.root, targets: [...keys.keys()], config: options.config }),
    }
  } catch (error) {
    return {
      home,
      policy,
      keys: new Map(),
      uncacheable: new Map(),
      hits: new Map(),
      rekey: () => new Map(),
      unavailable: error instanceof Error ? error.message : String(error),
    }
  }
}

export function recordCache(
  lookup: CacheLookup,
  runs: readonly MemberRun[],
  tier: RunTier,
  source: {
    readonly ledger: string
    readonly head: string
    readonly dirty: boolean
    readonly admission: boolean
  },
): { readonly written: string[]; readonly problems: string[]; readonly skipped: string[] } {
  const written: string[] = []
  const problems: string[] = []
  const skipped: string[] = []
  if (!lookup.policy.write) return { written, problems, skipped }
  const candidates = runs.filter(
    run => lookup.keys.has(run.member) && cacheable(run) && run.report !== undefined,
  )
  if (candidates.length === 0) return { written, problems, skipped }
  let fresh: ReadonlyMap<string, MemberKey> | undefined
  let freshError = ''
  let outputs: ReadonlyMap<string, string> | undefined
  let outputsError = ''
  try {
    fresh = lookup.rekey()
  } catch (error) {
    freshError = error instanceof Error ? error.message : String(error)
  }
  for (const run of candidates) {
    const found = lookup.keys.get(run.member)
    if (found === undefined || run.report === undefined) continue
    if (fresh === undefined) {
      skipped.push(`${run.member}：跑完后重算键失败（${freshError}），不写缓存`)
      continue
    }
    const now = fresh.get(run.member)
    if (now?.key !== found.key) {
      skipped.push(`${run.member}：运行期间输入有变化，键与开跑前不一致，不写缓存`)
      continue
    }
    const built = lookup.built?.get(run.member)
    if (built === undefined) {
      skipped.push(`${run.member}：这次没有构建记录，测试跑的可能是别的源码构建出的 dist，不写缓存`)
      continue
    }
    if (built.input !== now.digest) {
      skipped.push(`${run.member}：构建之后输入变了，通过的是旧源码构建出的 dist，不写缓存`)
      continue
    }
    if (built.output !== undefined) {
      if (outputs === undefined) {
        try {
          outputs = lookup.outputs?.() ?? new Map()
        } catch (error) {
          outputsError = error instanceof Error ? error.message : String(error)
          outputs = new Map()
        }
      }
      if (outputsError !== '') {
        skipped.push(`${run.member}：取不到现在的产物摘要（${outputsError}），不写缓存`)
        continue
      }
      if (outputs.get(run.member) !== built.output) {
        skipped.push(
          `${run.member}：构建之后 dist 被改过，这次通过不一定对应记录里的构建，不写缓存`,
        )
        continue
      }
    }
    if (
      !source.admission &&
      readEntry(lookup.home, run.member, tier, found.key)?.admission === true
    ) {
      written.push(run.member)
      continue
    }
    const problem = writeEntry(lookup.home, {
      version: KEY_VERSION,
      member: run.member,
      tier,
      key: found.key,
      ledger: source.ledger,
      head: source.head,
      dirty: source.dirty,
      recordedAt: new Date().toISOString(),
      tests: testCount(run.report),
      files: run.report.testResults.length,
      wallSeconds: Math.round(run.wallSeconds * 10) / 10,
      inputs: {
        files: found.inputs,
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
      },
      ...(source.admission ? { admission: true as const } : {}),
    })
    if (problem === undefined) written.push(run.member)
    else problems.push(problem)
  }
  return { written, problems, skipped }
}

export interface CacheMeta {
  readonly mode: 'read-write' | 'write-only' | 'unavailable'
  readonly reason: string
  readonly trustedOnly: boolean
  readonly home: string
  readonly hits: readonly {
    readonly member: string
    readonly key: string
    readonly source: string
    readonly head: string
    readonly recordedAt: string
    readonly tests: number
  }[]
  readonly written: readonly string[]
  readonly write: 'on' | 'off'
  readonly skipped: number
  readonly uncacheable: readonly { readonly member: string; readonly reason: string }[]
  readonly problems: readonly string[]
}

export function cacheMeta(
  lookup: CacheLookup,
  recorded: {
    readonly written: readonly string[]
    readonly problems: readonly string[]
    readonly skipped: readonly string[]
  },
): CacheMeta {
  return {
    mode:
      lookup.unavailable !== undefined
        ? 'unavailable'
        : lookup.policy.read
          ? 'read-write'
          : 'write-only',
    reason: lookup.unavailable ?? lookup.policy.reason,
    trustedOnly: lookup.policy.trustedOnly,
    home: lookup.home,
    hits: [...lookup.hits].map(([member, entry]) => ({
      member,
      key: entry.key,
      source: entry.ledger,
      head: entry.head,
      recordedAt: entry.recordedAt,
      tests: entry.tests,
    })),
    written: recorded.written,
    write: lookup.unavailable === undefined && lookup.policy.write ? 'on' : 'off',
    skipped: recorded.skipped.length,
    uncacheable: [...lookup.uncacheable].map(([member, reason]) => ({ member, reason })),
    problems: recorded.problems,
  }
}
