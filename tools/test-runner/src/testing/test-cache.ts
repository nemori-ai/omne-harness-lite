// 成员级测试结果缓存：一个成员某一层的一次完整通过，按「输入集的内容摘要」记在主检出的 `tmp/test-cache/`；
// 下一次同样的输入就不再跑它。只缓存完整通过（退出码 0、有报告、没有失败、运行器自己没判问题）；
// 失败、超时、被中断、没写出报告的从不进缓存。借鉴 ub-mode 的 mutator 与 crapper：上次的结果有效就复用，
// 不重跑没变的东西。
//
// 输入集与影响面同源：一个成员的输入，就是「改了会让计划选中它」的那些文件——由 scope.ts 的 `classify`
// 按 test-runs.config.json 的 `affected` 规则判，不另写一套：
// - 全局文件与没有规则认得的文件（改了计划判全量）进每个成员的键；
// - 读者规则点名它的文件、它自己的文件（成员根目录文档除外）、它上游成员（按 turbo 的包依赖图传递）的文件进它的键；
// - 只需常驻检查、Python 工具、退役目录与别的成员的文件不进。
// 内容摘要取 git 的 blob id：已跟踪且干净的直接读索引，改过与未跟踪的用 `git hash-object`（走同一套换行过滤）。
// 键里另有层（turbo 任务名）、平台与架构、Node 版本，以及配置 `cache.env` 列出的环境变量。
// 锁文件、根清单、分层定义、本运行器的源码、成员的 vitest 配置与 package.json 都已由上面的规则进键。
//
// 缓存读写失败一律按未命中：既不让检查失败，也不让检查放行。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import {
  fileTree,
  listWorkspaceMembers,
  type WorkspaceMember,
} from '@omne-harness/repo-toolchain/core/workspace'
import type { CacheRules, RunTier, TestRunsConfig } from './config.ts'
import type { MemberRun } from './ledger.ts'
import { testCount } from './ledger.ts'
import { slugOf } from './run.ts'
import { classify, patternToRegExp, type ClassifiedFile } from './scope.ts'
import { admissionRequested, packageGraph, TIER_TASKS, type PackageGraph } from './turbo.ts'

/** 环境变量 `OMNE_TEST_CACHE`：`0` 不读缓存（照常写），`1` 或不设照常读写；别的值报错，不猜。 */
export const TEST_CACHE_ENV = 'OMNE_TEST_CACHE'
/** 缓存根：环境变量给了用它，否则是主检出的 `tmp/test-cache/`（与账本同级）。 */
export const TEST_CACHE_HOME_ENV = 'OMNE_TEST_CACHE_HOME'
export const TEST_CACHE_DIR = 'tmp/test-cache'

export function cacheHome(mainRoot: string, env: Readonly<Record<string, string | undefined>>) {
  const value = env[TEST_CACHE_HOME_ENV]
  return value === undefined || value === '' ? join(mainRoot, TEST_CACHE_DIR) : value
}

/** 这次运行读不读缓存；写总是写（失败的运行写不进去，见 `cacheable`）。 */
export interface CachePolicy {
  readonly read: boolean
  /** 不读时的原因；读时为空串。 */
  readonly reason: string
}

/**
 * `FULL=1`（或 `--full`）、`--no-cache`、`OMNE_TEST_CACHE=0` 不读；准入模式也不读——准入不读待合并的改动能写入的缓存
 * （与构建、类型检查的 turbo 缓存同一条规则）。
 */
export function cachePolicy(
  env: Readonly<Record<string, string | undefined>>,
  options: { readonly noCache: boolean; readonly full: boolean },
): CachePolicy {
  const value = env[TEST_CACHE_ENV]
  if (value !== undefined && value !== '' && value !== '0' && value !== '1')
    throw new Error(`环境变量 ${TEST_CACHE_ENV} 只能是 0、1 或不设，现在是 ${value}`)
  if (options.full) return { read: false, reason: 'FULL=1 要求全量' }
  if (options.noCache) return { read: false, reason: '--no-cache' }
  if (value === '0') return { read: false, reason: `${TEST_CACHE_ENV}=0` }
  if (admissionRequested(env))
    return { read: false, reason: '准入模式不读待合并的改动能写入的缓存' }
  return { read: true, reason: '' }
}

/** 工作树快照：影响面里能出现的每个文件（已跟踪的，加未跟踪、未忽略的）的内容 id。 */
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

/**
 * 已跟踪且干净的文件取索引里的 blob id；工作树里改过的（含有冲突的）与未跟踪的用 `git hash-object` 现算，
 * 它走与提交相同的换行过滤，内容没变的仍得到同一个 id。工作树里删掉的不在快照里；被忽略的从不在。
 */
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

/**
 * 一个文件在不在某个成员的输入集里：与 `planCheck` 选中它的条件同源。
 * 全局与未归类的文件让计划判全量，所以进每个成员的键；读者规则点名、自己的文件、上游成员的文件进它的键。
 */
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
    // 锁文件进每个成员的键。计划按 importer 把锁文件改动映射到受影响的成员（scope.ts），键却取整份锁文件的内容摘要：
    // 锁文件一变，所有成员的条目都失效。这比计划保守——只多重跑、不少跑；按 importer 把锁文件投影进各成员的键另议。
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

/** 一个成员的输入集：按归属选出的路径，已排序。 */
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

/**
 * 一个成员的上游闭包（成员目录），按 turbo 的包依赖图传递求出；不含它自己。
 * 图里点名了成员清单以外的包就报错：那个包的文件由规则归不到成员，键会漏掉它。
 */
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

/** 进键的环境变量：匹配 `cache.env` 任一模式、不在 `cache.ignoreEnv` 里、且已设置的，按名字排序。 */
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

/** 键的全部输入。键的版本号随这里的形状变：形状一变旧条目全部失效。 */
export interface KeyInputs {
  readonly member: string
  readonly tier: RunTier
  /** 输入集里每个文件的内容 id，按路径排序。 */
  readonly files: readonly (readonly [path: string, blob: string])[]
  readonly platform: string
  readonly arch: string
  readonly node: string
  readonly env: Readonly<Record<string, string>>
}

export const KEY_VERSION = 1

export function cacheKey(inputs: KeyInputs): string {
  const files = [...inputs.files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const env = Object.fromEntries(Object.entries(inputs.env).sort(([a], [b]) => (a < b ? -1 : 1)))
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: KEY_VERSION,
        member: inputs.member,
        task: TIER_TASKS[inputs.tier],
        platform: inputs.platform,
        arch: inputs.arch,
        node: inputs.node,
        env,
        files,
      }),
    )
    .digest('hex')
}

/** 缓存里的一个条目：哪次运行、什么输入下，这个成员这一层完整通过了。 */
export interface CacheEntry {
  readonly version: typeof KEY_VERSION
  readonly member: string
  readonly tier: RunTier
  readonly key: string
  /** 来源账本：那次运行的目录。 */
  readonly ledger: string
  readonly head: string
  readonly dirty: boolean
  readonly recordedAt: string
  /** 那次跑了的用例数与文件数、墙钟。 */
  readonly tests: number
  readonly files: number
  readonly wallSeconds: number
  readonly inputs: { readonly files: number; readonly node: string; readonly platform: string }
}

export function entryPath(home: string, member: string, tier: RunTier, key: string): string {
  return join(home, slugOf(member), `${tier}-${key}.json`)
}

function isEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  const inputs = entry['inputs']
  return (
    entry['version'] === KEY_VERSION &&
    typeof entry['member'] === 'string' &&
    typeof entry['tier'] === 'string' &&
    typeof entry['key'] === 'string' &&
    typeof entry['ledger'] === 'string' &&
    typeof entry['head'] === 'string' &&
    typeof entry['dirty'] === 'boolean' &&
    typeof entry['recordedAt'] === 'string' &&
    typeof entry['tests'] === 'number' &&
    typeof entry['files'] === 'number' &&
    typeof entry['wallSeconds'] === 'number' &&
    typeof inputs === 'object' &&
    inputs !== null
  )
}

/** 读一个条目；文件不存在、不是 JSON、形状不对、或记的不是这个成员这一层这个键，都当作没有。 */
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

/** 写一个条目（先写临时文件再改名）；写不进去返回原因，不抛。 */
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

/** 完整通过才进缓存：退出码 0、运行器没判问题、有报告、报告里没有失败的文件或用例。 */
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

/** 一次运行开始前对缓存的查询结果。 */
export interface CacheLookup {
  readonly home: string
  readonly policy: CachePolicy
  /** 能算出键的成员：键与输入集的文件数。 */
  readonly keys: ReadonlyMap<string, MemberKey>
  /** 算不出键的成员与原因：照常跑，不写缓存。 */
  readonly uncacheable: ReadonlyMap<string, string>
  /** 读缓存时命中的成员。 */
  readonly hits: ReadonlyMap<string, CacheEntry>
  /** 整个缓存不可用的原因（快照或依赖图取不到）；有它时 `keys` 为空。 */
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
  /** 输入集里的文件数。 */
  readonly inputs: number
}

/** 各成员的键：取一次快照与依赖图，逐成员按归属选输入；算不出的成员记下原因。 */
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
      keys.set(target, {
        key: cacheKey({ ...common, member: target, files: inputs }),
        inputs: inputs.length,
      })
    } catch (error) {
      uncacheable.set(target, error instanceof Error ? error.message : String(error))
    }
  }
  return { keys, uncacheable }
}

/** 查缓存：算键，按策略读条目。快照或依赖图取不到时整个缓存不可用，全部成员照常跑、不写。 */
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
        if (entry !== undefined) hits.set(member, entry)
      }
    return { home, policy, keys, uncacheable, hits }
  } catch (error) {
    return {
      home,
      policy,
      keys: new Map(),
      uncacheable: new Map(),
      hits: new Map(),
      unavailable: error instanceof Error ? error.message : String(error),
    }
  }
}

/** 运行之后写缓存：完整通过且有键的成员各写一条；返回写了谁、哪些写不进去。 */
export function recordCache(
  lookup: CacheLookup,
  runs: readonly MemberRun[],
  tier: RunTier,
  source: { readonly ledger: string; readonly head: string; readonly dirty: boolean },
): { readonly written: string[]; readonly problems: string[] } {
  const written: string[] = []
  const problems: string[] = []
  for (const run of runs) {
    const found = lookup.keys.get(run.member)
    if (found === undefined || !cacheable(run) || run.report === undefined) continue
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
    })
    if (problem === undefined) written.push(run.member)
    else problems.push(problem)
  }
  return { written, problems }
}

/** 账本抬头里的 `cache` 一栏：怎么用的缓存、谁命中了、来源在哪、谁写进去了。 */
export interface CacheMeta {
  readonly mode: 'read-write' | 'write-only' | 'unavailable'
  readonly reason: string
  readonly home: string
  readonly hits: readonly {
    readonly member: string
    readonly key: string
    readonly source: string
    readonly tests: number
  }[]
  readonly written: readonly string[]
  readonly uncacheable: readonly { readonly member: string; readonly reason: string }[]
  readonly problems: readonly string[]
}

export function cacheMeta(
  lookup: CacheLookup,
  recorded: { readonly written: readonly string[]; readonly problems: readonly string[] },
): CacheMeta {
  return {
    mode:
      lookup.unavailable !== undefined
        ? 'unavailable'
        : lookup.policy.read
          ? 'read-write'
          : 'write-only',
    reason: lookup.unavailable ?? lookup.policy.reason,
    home: lookup.home,
    hits: [...lookup.hits].map(([member, entry]) => ({
      member,
      key: entry.key,
      source: entry.ledger,
      tests: entry.tests,
    })),
    written: recorded.written,
    uncacheable: [...lookup.uncacheable].map(([member, reason]) => ({ member, reason })),
    problems: recorded.problems,
  }
}
