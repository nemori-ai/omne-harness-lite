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
  type ReviewReason,
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
  readonly members: string
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

export function parseContractMembers(text: string): string[] {
  const parsed: unknown = JSON.parse(text)
  const lines =
    typeof parsed === 'object' && parsed !== null && 'lines' in parsed ? parsed.lines : undefined
  if (!Array.isArray(lines)) throw new Error('契约成员表没有 lines 数组')
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
    throw new Error('契约成员表里每组的 contracts 须为路径数组')
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

export interface LocatedMember {
  readonly member: ContractMember
  readonly snapshotFile: string
}

export interface Contracts {
  readonly located: readonly LocatedMember[]
  readonly problems: readonly MemberProblem[]
}

export function locateContracts(
  read: ReadFile,
  config: ContractApiConfig,
  listMissing: 'throw' | 'empty',
): Contracts {
  const text = read(config.members)
  if (text === undefined && listMissing === 'throw')
    throw new Error(`没有契约成员表 ${config.members}`)
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

export function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export type WriteStatus =
  | {
      readonly directory: string
      readonly status: 'written' | 'unchanged'
      readonly snapshotFile: string
    }
  | { readonly directory: string; readonly status: 'unbuilt'; readonly snapshotFile: string }
  | { readonly directory: string; readonly status: 'invalid'; readonly message: string }

export interface WriteRun {
  readonly typescript: string
  readonly members: readonly WriteStatus[]
}

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

export type CheckStatus =
  | {
      readonly directory: string
      readonly status: 'match'
      readonly snapshotFile: string
      readonly sha256: string
    }
  | {
      readonly directory: string
      readonly status: 'differs'
      readonly snapshotFile: string
      readonly sha256: string
      readonly change: ApiChange
      readonly differences: readonly Difference[]
    }
  | {
      readonly directory: string
      readonly status: 'unreadable'
      readonly snapshotFile: string
      readonly sha256: string
      readonly message: string
    }
  | { readonly directory: string; readonly status: 'missing'; readonly snapshotFile: string }
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
      readonly before?: string
      readonly after?: string
      readonly change: ApiChange
      readonly differences: readonly Difference[]
    }
  | { readonly directory: string; readonly status: 'invalid'; readonly message: string }

export interface DiffRun {
  readonly base: string
  readonly commit: string
  readonly change: ApiChange
  readonly members: readonly DiffMember[]
}

export class BaseRevisionError extends Error {}

export function resolveCommit(root: string, base: string): string {
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

export function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    env: repositoryEnv(process.env),
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

export function revisionReader(root: string, commit: string): ReadFile {
  return path => {
    if (git(root, ['ls-tree', '-z', commit, '--', path]) === '') return undefined
    return git(root, ['cat-file', 'blob', `${commit}:${path}`])
  }
}

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
  const changes = members.map(item => (item.status === 'compared' ? item.change : 'review'))
  return { base, commit, change: strongest(changes), members }
}

export type Side =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly message: string }
  | {
      readonly kind: 'present'
      readonly file: string
      readonly packageName: string
      readonly text: string | undefined
    }

export function side(contracts: Contracts, read: ReadFile, directory: string): Side {
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

export function diffMember(context: ClassifyContext, before: Side, after: Side): DiffMember {
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

function sideDifferences(context: ClassifyContext, before: Side, after: Side): Difference[] {
  const { differences } = classifySnapshots(snapshotOn(before), snapshotOn(after), context)
  const renamed =
    before.kind === 'present' &&
    after.kind === 'present' &&
    before.packageName !== after.packageName
  if (!renamed || differences.some(item => item.kind === 'renamed')) return [...differences]
  return [
    {
      target: { scope: 'snapshot' },
      kind: 'renamed',
      change: 'review',
      reasons: [{ kind: 'outside-whitelist', why: '包名变了' }],
    },
    ...differences,
  ]
}

function describeTarget(target: DifferenceTarget): string {
  switch (target.scope) {
    case 'snapshot':
      return '整份快照'
    case 'entry':
      return `入口 \`${target.entry}\``
    case 'export':
      return `入口 \`${target.entry}\` · \`${target.name}\``
    case 'declaration':
      return `声明文件 \`${target.path}\` · \`${target.statement}\``
    default: {
      const _exhaustive: never = target
      return _exhaustive
    }
  }
}

function describeReason(reason: ReviewReason): string {
  switch (reason.kind) {
    case 'global-scope-change':
      return `全局作用域变了：${reason.why}`
    case 'outside-whitelist':
      return `白名单外：${reason.why}`
    case 'uncovered':
      return '没有任何比较覆盖'
    case 'direction': {
      const sides = `读方${reason.readers ? '不破坏' : '破坏'}，写方${reason.writers ? '不破坏' : '破坏'}`
      return reason.details[0] === undefined ? sides : `${sides}：${reason.details[0]}`
    }
    case 'incomplete':
      return `检查器未完成：${reason.details[0] ?? ''}`
    case 'truncated':
      return `类型参数实例 ${reason.total} 组，超过上限 ${reason.limit}，没有全部比较`
    case 'diagnostics':
      return `编译诊断：${reason.details[0] ?? ''}`
    default: {
      const _exhaustive: never = reason
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

export function describeDifference(item: Difference): string {
  const head = `${describeTarget(item.target)}：${KIND_WORDS[item.kind]}，${item.change}`
  if (item.change === 'additive')
    return item.proved === true ? `${head}（读方不破坏，写方不破坏）` : head
  return `${head}（${item.reasons.map(describeReason).join(' / ')}）`
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
