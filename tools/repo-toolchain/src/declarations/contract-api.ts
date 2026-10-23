// 契约 API 快照的三个动作：写快照、核对快照与 dist、对比基线提交上的快照并粗分类。
// 契约成员清单取线归属表的 `contracts`，快照落点取 `repo-toolchain.config.json` 的 `contractApi` 一节。
// 核对与对比只报告：发现不让命令失败，命令只在用法、配置、基线或工具出错时失败。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { repositoryEnv } from '../core/git-environment.ts'
import { readToolchainSection, toolchainConfigPath } from '../core/toolchain-config.ts'
import {
  classifySnapshots,
  strongest,
  type ApiChange,
  type ClassifyContext,
  type Difference,
  type DifferenceTarget,
} from './api-classify.ts'
import {
  byCodeUnit,
  parseSnapshot,
  renderSnapshot,
  SnapshotFormatError,
  type ApiSnapshot,
} from './api-format.ts'
import {
  readContractMember,
  readWorkingFile,
  snapshotContracts,
  type ContractMember,
  type MemberProblem,
  type ReadFile,
} from './api-snapshot.ts'

export interface ContractApiConfig {
  /** 线归属表的仓库相对路径；成员清单取各线 `contracts` 的并集。 */
  readonly members: string
  /** 快照路径模板：`{member}` 是成员目录，`{package}` 是不带 scope 的包名。 */
  readonly snapshot: string
}

const CONFIG_KEYS = ['members', 'snapshot']

export function parseContractApiConfig(raw: unknown): ContractApiConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('contractApi 一节须为对象')
  const extra = Object.keys(raw).filter(key => !CONFIG_KEYS.includes(key))
  if (extra.length > 0) throw new Error(`contractApi 里有认不出的键：${extra.join('、')}`)
  const members = 'members' in raw ? raw.members : undefined
  const snapshot = 'snapshot' in raw ? raw.snapshot : undefined
  if (typeof members !== 'string' || members === '')
    throw new Error('contractApi.members 须为仓库相对路径')
  if (!isSnapshotTemplate(snapshot))
    throw new Error('contractApi.snapshot 须为以 .md 结尾、含 {member} 或 {package} 的路径模板')
  return { members, snapshot }
}

function isSnapshotTemplate(value: unknown): value is string {
  if (typeof value !== 'string' || !value.endsWith('.md')) return false
  return value.includes('{member}') || value.includes('{package}')
}

export function readContractApiConfig(path: string = toolchainConfigPath()): ContractApiConfig {
  return parseContractApiConfig(readToolchainSection('contractApi', path))
}

/** 线归属表各线 `contracts` 的并集，按路径排序；表的完整校验归 dev-flow 的 `check:lines`。 */
export function parseContractMembers(text: string): string[] {
  const parsed: unknown = JSON.parse(text)
  const lines =
    typeof parsed === 'object' && parsed !== null && 'lines' in parsed ? parsed.lines : undefined
  if (!Array.isArray(lines)) throw new Error('线归属表没有 lines 数组')
  const members = new Set(lines.flatMap(contractsOf))
  return [...members].sort(byCodeUnit)
}

function contractsOf(line: unknown): string[] {
  const contracts: unknown =
    typeof line === 'object' && line !== null && 'contracts' in line ? line.contracts : undefined
  if (
    !Array.isArray(contracts) ||
    !contracts.every(item => typeof item === 'string' && item !== '')
  )
    throw new Error('线归属表里每条线的 contracts 须为路径数组')
  return contracts
}

export function snapshotPath(
  config: ContractApiConfig,
  directory: string,
  packageName: string,
): string {
  return config.snapshot
    .replaceAll('{member}', directory)
    .replaceAll('{package}', packageName.replace(/^@[^/]+\//u, ''))
}

/** 一个契约成员与它的快照文件（仓库相对）。 */
export interface LocatedMember {
  readonly member: ContractMember
  readonly snapshotFile: string
}

export interface Contracts {
  readonly located: readonly LocatedMember[]
  readonly problems: readonly MemberProblem[]
}

/**
 * 契约成员与快照路径的唯一算法，工作树与基线提交共用。线归属表不存在时 `listMissing` 决定：
 * 工作树上是配置错误（抛出），基线上表示那时还没有契约成员。两个成员落到同一路径时抛出。
 */
export function locateContracts(
  read: ReadFile,
  config: ContractApiConfig,
  listMissing: 'throw' | 'empty',
): Contracts {
  const text = read(config.members)
  if (text === undefined && listMissing === 'throw')
    throw new Error(`没有线归属表 ${config.members}`)
  const located: LocatedMember[] = []
  const problems: MemberProblem[] = []
  const owners = new Map<string, string>()
  for (const directory of text === undefined ? [] : parseContractMembers(text)) {
    const outcome = readContractMember(read, directory)
    if (outcome.kind === 'invalid') {
      problems.push(outcome.problem)
      continue
    }
    const snapshotFile = snapshotPath(config, directory, outcome.member.packageName)
    const owner = owners.get(snapshotFile)
    if (owner !== undefined)
      throw new Error(
        `快照路径 ${snapshotFile} 同时属于 ${owner} 与 ${directory}，改 contractApi.snapshot`,
      )
    owners.set(snapshotFile, directory)
    located.push({ member: outcome.member, snapshotFile })
  }
  return { located, problems }
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export type WriteStatus =
  | {
      readonly directory: string
      readonly status: 'written' | 'unchanged'
      readonly snapshotFile: string
    }
  /** 没有 dist：没写。 */
  | { readonly directory: string; readonly status: 'unbuilt'; readonly snapshotFile: string }
  /** package.json 或 dist 的声明不全、dist 有编译诊断：没写。 */
  | { readonly directory: string; readonly status: 'invalid'; readonly message: string }

export interface WriteRun {
  readonly typescript: string
  readonly members: readonly WriteStatus[]
}

/** 契约成员的生成结果，按成员目录排序；生成不了的成员带着原因。 */
function generate(root: string, config: ContractApiConfig) {
  const contracts = locateContracts(readWorkingFile(root), config, 'throw')
  const run = snapshotContracts(
    root,
    contracts.located.map(item => item.member),
  )
  const generated = new Map(run.results.map(item => [item.directory, item]))
  const results = contracts.located.flatMap(item => {
    const outcome = generated.get(item.member.directory)
    return outcome === undefined ? [] : [{ ...outcome, snapshotFile: item.snapshotFile }]
  })
  return { typescript: run.typescript, results, problems: contracts.problems }
}

const byDirectory = <T extends { readonly directory: string }>(items: T[]): T[] =>
  items.sort((a, b) => byCodeUnit(a.directory, b.directory))

/** 从 dist 重写契约成员的快照；没有 dist、声明不全或有编译诊断的成员不写，如实列出。 */
export function writeSnapshots(root: string, config: ContractApiConfig): WriteRun {
  const { typescript, results, problems } = generate(root, config)
  const members: WriteStatus[] = problems.map(item => ({ ...item, status: 'invalid' }))
  for (const item of results) {
    if (item.kind === 'unbuilt')
      members.push({
        directory: item.directory,
        status: 'unbuilt',
        snapshotFile: item.snapshotFile,
      })
    else if (item.kind === 'invalid')
      members.push({ directory: item.directory, status: 'invalid', message: item.message })
    else
      members.push(writeOne(root, item.directory, item.snapshotFile, renderSnapshot(item.snapshot)))
  }
  return { typescript, members: byDirectory(members) }
}

function writeOne(
  root: string,
  directory: string,
  snapshotFile: string,
  text: string,
): WriteStatus {
  const target = join(root, snapshotFile)
  if (existsSync(target) && readFileSync(target, 'utf8') === text)
    return { directory, status: 'unchanged', snapshotFile }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, text)
  return { directory, status: 'written', snapshotFile }
}

/** `sha256` 是快照文件字节的 SHA-256（快照摘要）；文件存在时才有。 */
export type CheckStatus =
  | {
      readonly directory: string
      readonly status: 'match'
      readonly snapshotFile: string
      readonly sha256: string
    }
  /** 快照文件与 dist 不一致；差异是快照到 dist，规则同对比基线。 */
  | {
      readonly directory: string
      readonly status: 'differs'
      readonly snapshotFile: string
      readonly sha256: string
      readonly change: ApiChange
      readonly differences: readonly Difference[]
    }
  /** 快照文件读不回（格式版本不对或被改坏）。 */
  | {
      readonly directory: string
      readonly status: 'unreadable'
      readonly snapshotFile: string
      readonly sha256: string
      readonly message: string
    }
  | { readonly directory: string; readonly status: 'missing'; readonly snapshotFile: string }
  /** 没有 dist：这次没核对。 */
  | {
      readonly directory: string
      readonly status: 'unbuilt'
      readonly snapshotFile: string
      readonly sha256?: string
    }
  | { readonly directory: string; readonly status: 'invalid'; readonly message: string }

export interface CheckRun {
  readonly typescript: string
  readonly members: readonly CheckStatus[]
}

/** 拿 dist 现场生成的快照与快照文件比；不一致只报告，列出差异与粗分类。 */
export function checkSnapshots(root: string, config: ContractApiConfig): CheckRun {
  const realRoot = realpathSync(root)
  const { typescript, results, problems } = generate(root, config)
  const members: CheckStatus[] = problems.map(item => ({ ...item, status: 'invalid' }))
  for (const item of results) {
    const target = join(root, item.snapshotFile)
    const bytes = existsSync(target) ? readFileSync(target) : undefined
    const sha256 = bytes === undefined ? {} : { sha256: digest(bytes) }
    if (item.kind === 'invalid')
      members.push({ directory: item.directory, status: 'invalid', message: item.message })
    else if (item.kind === 'unbuilt')
      members.push({
        directory: item.directory,
        status: 'unbuilt',
        snapshotFile: item.snapshotFile,
        ...sha256,
      })
    else if (bytes === undefined)
      members.push({
        directory: item.directory,
        status: 'missing',
        snapshotFile: item.snapshotFile,
      })
    else members.push(checkOne(realRoot, item.directory, item.snapshotFile, bytes, item.snapshot))
  }
  return { typescript, members: byDirectory(members) }
}

function checkOne(
  root: string,
  directory: string,
  snapshotFile: string,
  bytes: Buffer,
  generated: ApiSnapshot,
): CheckStatus {
  const sha256 = digest(bytes)
  const text = bytes.toString('utf8')
  if (text === renderSnapshot(generated))
    return { directory, status: 'match', snapshotFile, sha256 }
  try {
    const { change, differences } = classifySnapshots(parseSnapshot(text), generated, {
      root,
      directory,
    })
    return { directory, status: 'differs', snapshotFile, sha256, change, differences }
  } catch (error) {
    if (!(error instanceof SnapshotFormatError)) throw error
    return { directory, status: 'unreadable', snapshotFile, sha256, message: error.message }
  }
}

export type DiffMember =
  | {
      readonly directory: string
      readonly status: 'compared'
      /** 基线上与工作树上的快照文件；成员那一侧不是契约成员时没有。 */
      readonly before?: string
      readonly after?: string
      readonly change: ApiChange
      readonly differences: readonly Difference[]
    }
  /** 一侧的 package.json 读不出，或快照文件读不回。 */
  | { readonly directory: string; readonly status: 'invalid'; readonly message: string }

export interface DiffRun {
  readonly base: string
  readonly commit: string
  readonly change: ApiChange
  readonly members: readonly DiffMember[]
}

export class BaseRevisionError extends Error {}

/** 基线解析成提交；不是提交时抛 BaseRevisionError，其他 Git 失败原样带着 cause 抛出。 */
function resolveCommit(root: string, base: string): string {
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).trim()
  } catch (error) {
    if (exitStatus(error) === 1) throw new BaseRevisionError(`基线 ${base} 不是这个仓库里的提交`)
    throw new Error(`解析基线 ${base} 失败`, { cause: error })
  }
}

function exitStatus(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    env: repositoryEnv(process.env),
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** 提交里的文件：路径不在那棵树里是 undefined；其余 Git 失败照常抛出，不当作没有文件。 */
function revisionReader(root: string, commit: string): ReadFile {
  return path => {
    if (git(root, ['ls-tree', '-z', commit, '--', path]) === '') return undefined
    return git(root, ['cat-file', 'blob', `${commit}:${path}`])
  }
}

/**
 * 基线提交上的快照文件对工作树的快照文件，逐成员粗分类。只比快照文件，不读 dist。
 * 成员取基线与当前两份线归属表的并集，各侧的快照路径按各侧的包名算：
 * 只在当前是契约成员的整份算新增，只在基线是的整份算删除，包名变了是 review，两侧都没有快照文件是 review。
 */
export function diffSnapshots(root: string, config: ContractApiConfig, base: string): DiffRun {
  const realRoot = realpathSync(root)
  const commit = resolveCommit(root, base)
  const working = readWorkingFile(root)
  const baseRead = revisionReader(root, commit)
  const now = locateContracts(working, config, 'throw')
  const then = locateContracts(baseRead, config, 'empty')
  const directories = new Set([...now.located, ...then.located].map(item => item.member.directory))
  for (const problem of [...now.problems, ...then.problems]) directories.add(problem.directory)
  const members = [...directories]
    .sort(byCodeUnit)
    .map(directory =>
      diffMember(
        { root: realRoot, directory },
        side(then, baseRead, directory),
        side(now, working, directory),
      ),
    )
  // 读不出的成员没有可比的结论，按 review 计。
  const changes = members.map(item => (item.status === 'compared' ? item.change : 'review'))
  return { base, commit, change: strongest(changes), members }
}

type Side =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly message: string }
  | {
      readonly kind: 'present'
      readonly file: string
      readonly packageName: string
      readonly text: string | undefined
    }

function side(contracts: Contracts, read: ReadFile, directory: string): Side {
  const problem = contracts.problems.find(item => item.directory === directory)
  if (problem !== undefined) return { kind: 'invalid', message: problem.message }
  const found = contracts.located.find(item => item.member.directory === directory)
  if (found === undefined) return { kind: 'absent' }
  return {
    kind: 'present',
    file: found.snapshotFile,
    packageName: found.member.packageName,
    text: read(found.snapshotFile),
  }
}

function diffMember(context: ClassifyContext, before: Side, after: Side): DiffMember {
  const directory = context.directory
  if (before.kind === 'invalid')
    return { directory, status: 'invalid', message: `基线上：${before.message}` }
  if (after.kind === 'invalid') return { directory, status: 'invalid', message: after.message }
  try {
    const differences = sideDifferences(context, before, after)
    return {
      directory,
      status: 'compared',
      ...(before.kind === 'present' ? { before: before.file } : {}),
      ...(after.kind === 'present' ? { after: after.file } : {}),
      change: strongest(differences.map(item => item.change)),
      differences,
    }
  } catch (error) {
    if (!(error instanceof SnapshotFormatError)) throw error
    return { directory, status: 'invalid', message: error.message }
  }
}

function snapshotOn(side: Side): ApiSnapshot | undefined {
  return side.kind === 'present' && side.text !== undefined ? parseSnapshot(side.text) : undefined
}

/** 两侧快照的差异；包名变了而快照只在一侧时，另记一项 renamed。 */
function sideDifferences(context: ClassifyContext, before: Side, after: Side): Difference[] {
  const { differences } = classifySnapshots(snapshotOn(before), snapshotOn(after), context)
  const renamed =
    before.kind === 'present' &&
    after.kind === 'present' &&
    before.packageName !== after.packageName
  if (!renamed || differences.some(item => item.kind === 'renamed')) return [...differences]
  return [{ target: { scope: 'snapshot' }, kind: 'renamed', change: 'review' }, ...differences]
}

function describeTarget(target: DifferenceTarget): string {
  switch (target.scope) {
    case 'snapshot':
      return '整份快照'
    case 'entry':
      return `入口 \`${target.entry}\``
    case 'export':
      return `入口 \`${target.entry}\` · \`${target.name}\``
    case 'augmentation':
      return `模块扩充 \`${target.target}\` · \`${target.name}\``
    default: {
      const _exhaustive: never = target
      return _exhaustive
    }
  }
}

const KIND_WORDS: Readonly<Record<Difference['kind'], string>> = {
  added: '新增',
  removed: '删除',
  changed: '改动',
  marked: '标注变了',
  renamed: '包名改了',
  missing: '两边都没有快照',
  unresolved: '还原的声明有编译诊断',
}

/** 一项差异的一行说明；检查器比较过的项写出两个方向，并附第一条原因。 */
function describeDifference(item: Difference): string {
  const sides =
    item.readers === undefined || item.writers === undefined
      ? ''
      : `（读方${item.readers ? '不破坏' : '破坏'}，写方${item.writers ? '不破坏' : '破坏'}）`
  const note = item.notes?.[0] === undefined ? '' : `：${item.notes[0]}`
  return `${describeTarget(item.target)}：${KIND_WORDS[item.kind]}，${item.change}${sides}${note}`
}

export function renderCheck(run: CheckRun): string[] {
  const count = (status: CheckStatus['status']) =>
    run.members.filter(item => item.status === status).length
  const lines = [
    `契约 API 快照（TypeScript ${run.typescript}）：${run.members.length} 个契约成员，` +
      `${count('match')} 个与 dist 一致，${count('differs')} 个不一致，${count('missing')} 个没有快照，` +
      `${count('unreadable')} 个快照读不回，${count('unbuilt')} 个没有 dist，${count('invalid')} 个声明不全（只报告）`,
  ]
  for (const item of run.members) lines.push(...checkLines(item))
  if (count('differs') + count('missing') + count('unreadable') > 0)
    lines.push('  公开面有意改动时运行 omne-contract-api --write 更新快照')
  return lines
}

function checkLines(item: CheckStatus): string[] {
  switch (item.status) {
    case 'match':
      return []
    case 'differs':
      return [
        `  ${item.directory}：${item.snapshotFile} 与 dist 不一致，${item.change}`,
        ...item.differences.map(difference => `    ${describeDifference(difference)}`),
      ]
    case 'unreadable':
      return [`  ${item.directory}：${item.snapshotFile} 读不回：${item.message}`]
    case 'missing':
      return [`  ${item.directory}：没有快照文件 ${item.snapshotFile}`]
    case 'unbuilt':
      return [`  ${item.directory}：没有 dist，这次没核对`]
    case 'invalid':
      return [`  ${item.directory}：${item.message}`]
    default: {
      const _exhaustive: never = item
      return _exhaustive
    }
  }
}

export function renderWrite(run: WriteRun): string[] {
  const written = run.members.filter(item => item.status === 'written').length
  const unchanged = run.members.filter(item => item.status === 'unchanged').length
  const lines = [
    `契约 API 快照（TypeScript ${run.typescript}）：写了 ${written} 份，${unchanged} 份不变`,
  ]
  for (const item of run.members) lines.push(...writeLines(item))
  return lines
}

function writeLines(item: WriteStatus): string[] {
  switch (item.status) {
    case 'written':
      return [`  ${item.snapshotFile}`]
    case 'unchanged':
      return []
    case 'unbuilt':
      return [`  ${item.directory}：没有 dist，没写`]
    case 'invalid':
      return [`  ${item.directory}：${item.message}，没写`]
    default: {
      const _exhaustive: never = item
      return _exhaustive
    }
  }
}

export function renderDiff(run: DiffRun): string[] {
  const changed = run.members.filter(item => item.status !== 'compared' || item.change !== 'none')
  const lines = [
    `契约 API 相对 ${run.base}（${run.commit.slice(0, 9)}）：${run.change}` +
      `（${run.members.length} 个契约成员，${changed.length} 个有变化或读不出，只报告）`,
  ]
  for (const item of changed) {
    if (item.status === 'invalid') {
      lines.push(`  ${item.directory}：读不出，${item.message}`)
      continue
    }
    lines.push(`  ${item.directory}：${item.change}`)
    for (const difference of item.differences) lines.push(`    ${describeDifference(difference)}`)
  }
  return lines
}
