// 里程碑的契约基线：评论里的 `json omne-contract-baseline:v1` 机读区块。
// `writeBaseline` 从一个提交生成区块内容，`checkBaseline` 逐成员从它登记的提交比到工作树的快照。
// 本工具不读 GitHub：区块从文件读入，评论的读取与合并归 dev-flow。
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { repositoryEnv } from '../core/git-environment.ts'
import { strongest, type ApiChange } from './api-classify.ts'
import { byCodeUnit } from './api-format.ts'
import { readWorkingFile, type ReadFile } from './api-snapshot.ts'
import {
  describeDifference,
  diffMember,
  digest,
  git,
  locateContracts,
  resolveCommit,
  revisionReader,
  side,
  type ContractApiConfig,
  type Contracts,
  type DiffMember,
  type Side,
} from './contract-api.ts'

export const BASELINE_MARKER = 'omne-contract-baseline:v1'

/** 一个契约成员的基线登记。 */
export interface BaselineMember {
  /** 成员目录，仓库相对。 */
  readonly path: string
  /** 这个成员的基线提交，40 位小写十六进制。 */
  readonly commit: string
  /** 该提交上快照文件字节的 SHA-256，口径同 `--check --json`。 */
  readonly sha256: string
  /** `git rev-parse <commit>:<path>/api` 的树号。 */
  readonly apiTree: string
}

export interface ContractBaseline {
  /** 里程碑名；生成时没给 `--milestone` 为 null。 */
  readonly milestone: string | null
  /** 按 `path` 排序，`path` 不重复。 */
  readonly members: readonly BaselineMember[]
  /** 承接破坏性改动的 integration 卡；调度者在破坏性裁定读回后补登记。 */
  readonly breakingCards?: readonly string[]
}

export class BaselineFormatError extends Error {}

const TOP_KEYS = ['milestone', 'members', 'breakingCards']
const MEMBER_KEYS = ['path', 'commit', 'sha256', 'apiTree']
const OBJECT_ID = /^[0-9a-f]{40}$/u
const SHA256 = /^[0-9a-f]{64}$/u

function fail(message: string): never {
  throw new BaselineFormatError(`基线区块不合格：${message}`)
}

function record(value: unknown, where: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${where} 须为对象`)
  const extra = Object.keys(value).filter(key => !keys.includes(key))
  if (extra.length > 0) fail(`${where} 有认不出的键 ${extra.join('、')}`)
  return value as Record<string, unknown>
}

function text(value: unknown, where: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value === '') fail(`${where} 须为非空字符串`)
  if (pattern !== undefined && !pattern.test(value)) fail(`${where} 的格式不对：${value}`)
  return value
}

function relativePath(value: unknown, where: string): string {
  const path = text(value, where)
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some(part => part === '' || part === '.' || part === '..')
  )
    fail(`${where} 须为仓库相对路径：${path}`)
  return path
}

function parseMember(value: unknown, index: number): BaselineMember {
  const where = `members[${index}]`
  const raw = record(value, where, MEMBER_KEYS)
  return {
    path: relativePath(raw.path, `${where}.path`),
    commit: text(raw.commit, `${where}.commit`, OBJECT_ID),
    sha256: text(raw.sha256, `${where}.sha256`, SHA256),
    apiTree: text(raw.apiTree, `${where}.apiTree`, OBJECT_ID),
  }
}

/** 校验区块的 JSON 值：键、成员的格式、`path` 不重复、`breakingCards` 是不重复的非空字符串。 */
export function parseBaseline(value: unknown): ContractBaseline {
  const raw = record(value, '区块', TOP_KEYS)
  if (!('milestone' in raw)) fail('缺 milestone（没有里程碑时写 null）')
  const milestone = raw.milestone === null ? null : text(raw.milestone, 'milestone')
  if (!Array.isArray(raw.members) || raw.members.length === 0) fail('members 须为非空数组')
  const members = raw.members.map(parseMember)
  const paths = members.map(member => member.path)
  const repeated = paths.find((path, index) => paths.indexOf(path) !== index)
  if (repeated !== undefined) fail(`成员 ${repeated} 出现两次`)
  const sorted = [...members].sort((a, b) => byCodeUnit(a.path, b.path))
  if (!('breakingCards' in raw)) return { milestone, members: sorted }
  if (!Array.isArray(raw.breakingCards)) fail('breakingCards 须为数组')
  const cards = raw.breakingCards.map((card, index) => text(card, `breakingCards[${index}]`))
  if (new Set(cards).size !== cards.length) fail('breakingCards 有重复项')
  return { milestone, members: sorted, breakingCards: cards }
}

const FENCE = new RegExp(`^\`\`\`json ${BASELINE_MARKER}\\s*$`, 'u')

/**
 * 读区块：整段文本是 JSON 时按 JSON 读，否则须恰好含一个 `json omne-contract-baseline:v1` 围栏，
 * 例如一条登记评论的正文。没有或多于一个围栏、JSON 不合格时抛 BaselineFormatError。
 */
export function parseBaselineText(input: string): ContractBaseline {
  const trimmed = input.trim()
  if (trimmed.startsWith('{')) return parseBaseline(parseJson(trimmed))
  const lines = input.split('\n')
  const starts = lines.flatMap((line, index) => (FENCE.test(line) ? [index] : []))
  if (starts.length !== 1) fail(`须恰好有一个 ${BASELINE_MARKER} 区块，找到 ${starts.length} 个`)
  const start = starts[0] ?? 0
  const end = lines.findIndex((line, index) => index > start && line.trim() === '```')
  if (end < 0) fail('区块没有结束的 ```')
  return parseBaseline(parseJson(lines.slice(start + 1, end).join('\n')))
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch (error) {
    return fail(`不是 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 评论里用的围栏区块；键的顺序固定，成员按 `path` 排序。 */
export function renderBaselineBlock(baseline: ContractBaseline): string {
  const ordered = {
    milestone: baseline.milestone,
    members: [...baseline.members]
      .sort((a, b) => byCodeUnit(a.path, b.path))
      .map(({ path, commit, sha256, apiTree }) => ({ path, commit, sha256, apiTree })),
    ...(baseline.breakingCards === undefined ? {} : { breakingCards: baseline.breakingCards }),
  }
  return `\`\`\`json ${BASELINE_MARKER}\n${JSON.stringify(ordered, null, 2)}\n\`\`\`\n`
}

/** 提交上一个文件的原始字节；路径不在那棵树里时为 undefined。 */
function blobBytes(root: string, commit: string, path: string): Buffer | undefined {
  if (git(root, ['ls-tree', '-z', commit, '--', path]) === '') return undefined
  return execFileSync('git', ['cat-file', 'blob', `${commit}:${path}`], {
    env: repositoryEnv(process.env),
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** `<commit>:<directory>/api` 的树号；没有这棵树时为 undefined。 */
function apiTreeOf(root: string, commit: string, directory: string): string | undefined {
  const path = `${directory}/api`
  const entry = git(root, ['ls-tree', commit, '--', path]).trim()
  if (!entry.startsWith('040000 tree ')) return undefined
  return git(root, ['rev-parse', '--verify', `${commit}:${path}`]).trim()
}

/**
 * 从提交 `ref` 生成基线：成员取那个提交的线归属表，`members` 给出时只写这些成员。
 * 成员不是那个提交的契约成员、声明不全、没有快照文件或没有 `api` 目录时抛出。
 */
export function writeBaseline(
  root: string,
  config: ContractApiConfig,
  ref: string,
  options: { milestone: string | null; members?: readonly string[] },
): ContractBaseline {
  const commit = resolveCommit(root, ref)
  const contracts = locateContracts(revisionReader(root, commit), config, 'throw')
  const known = new Map(contracts.located.map(item => [item.member.directory, item]))
  const wanted = options.members ?? [
    ...known.keys(),
    ...contracts.problems.map(item => item.directory),
  ]
  const members = [...new Set(wanted)].sort(byCodeUnit).map(directory => {
    const problem = contracts.problems.find(item => item.directory === directory)
    if (problem !== undefined) throw new Error(`${commit} 上 ${directory}：${problem.message}`)
    const located = known.get(directory)
    if (located === undefined) throw new Error(`${directory} 不是 ${commit} 上的契约成员`)
    const bytes = blobBytes(root, commit, located.snapshotFile)
    if (bytes === undefined)
      throw new Error(`${commit} 上 ${directory} 没有快照文件 ${located.snapshotFile}`)
    const apiTree = apiTreeOf(root, commit, directory)
    if (apiTree === undefined) throw new Error(`${commit} 上 ${directory} 没有 api 目录`)
    return { path: directory, commit, sha256: digest(bytes), apiTree }
  })
  return { milestone: options.milestone, members }
}

/** 一条登记与它的提交对不上：只报告，不改变分类与退出码。 */
export interface RegistrationFinding {
  readonly path: string
  readonly code: 'sha256-mismatch' | 'api-tree-mismatch' | 'not-a-contract-member'
  readonly registered: string
  readonly actual: string | null
}

/** 一个成员的核对结果；`commit` 是登记的基线提交，基线之后加入的成员为 null。 */
export type BaselineMemberRun = DiffMember & { readonly commit: string | null }

export interface BaselineRun {
  readonly milestone: string | null
  readonly change: ApiChange
  readonly breakingCards: readonly string[]
  /** 分类为 review 且没有 breakingCards。 */
  readonly refused: boolean
  readonly members: readonly BaselineMemberRun[]
  readonly registration: readonly RegistrationFinding[]
}

interface CommitSide {
  readonly read: ReadFile
  readonly contracts: Contracts
}

/**
 * 逐成员从登记的提交比到工作树的快照，分类与 `--diff` 相同。成员取登记与当前线归属表的并集：
 * 只在当前表里的成员是基线之后加入的，基线一侧没有快照，整份算新增；只在登记里的成员整份算删除。
 * 登记的提交上快照的 sha256 或 api 树与登记不同时，记在 `registration`。
 */
export function checkBaseline(
  root: string,
  config: ContractApiConfig,
  baseline: ContractBaseline,
): BaselineRun {
  const realRoot = realpathSync(root)
  const working = readWorkingFile(root)
  const now = locateContracts(working, config, 'throw')
  const commits = new Map<string, CommitSide>()
  const atCommit = (commit: string): CommitSide => {
    const cached = commits.get(commit)
    if (cached !== undefined) return cached
    const read = revisionReader(root, resolveCommit(root, commit))
    const sideOf = { read, contracts: locateContracts(read, config, 'empty') }
    commits.set(commit, sideOf)
    return sideOf
  }
  const registered = new Map(baseline.members.map(member => [member.path, member]))
  const directories = new Set([
    ...registered.keys(),
    ...now.located.map(item => item.member.directory),
    ...now.problems.map(item => item.directory),
  ])
  const registration: RegistrationFinding[] = []
  const members = [...directories].sort(byCodeUnit).map(directory => {
    const entry = registered.get(directory)
    let before: Side = { kind: 'absent' }
    if (entry !== undefined) {
      const then = atCommit(entry.commit)
      before = side(then.contracts, then.read, directory)
      registration.push(...registrationFindings(root, entry, before))
    }
    const compared = diffMember(
      { root: realRoot, directory },
      before,
      side(now, working, directory),
    )
    return { ...compared, commit: entry?.commit ?? null }
  })
  const change = strongest(
    members.map(item => (item.status === 'compared' ? item.change : 'review')),
  )
  const breakingCards = baseline.breakingCards ?? []
  return {
    milestone: baseline.milestone,
    change,
    breakingCards,
    refused: change === 'review' && breakingCards.length === 0,
    members,
    registration,
  }
}

function registrationFindings(
  root: string,
  entry: BaselineMember,
  before: Side,
): RegistrationFinding[] {
  if (before.kind !== 'present')
    return [
      { path: entry.path, code: 'not-a-contract-member', registered: entry.commit, actual: null },
    ]
  const findings: RegistrationFinding[] = []
  const bytes = blobBytes(root, entry.commit, before.file)
  const sha256 = bytes === undefined ? null : digest(bytes)
  if (sha256 !== entry.sha256)
    findings.push({
      path: entry.path,
      code: 'sha256-mismatch',
      registered: entry.sha256,
      actual: sha256,
    })
  const apiTree = apiTreeOf(root, entry.commit, entry.path) ?? null
  if (apiTree !== entry.apiTree)
    findings.push({
      path: entry.path,
      code: 'api-tree-mismatch',
      registered: entry.apiTree,
      actual: apiTree,
    })
  return findings
}

const REGISTRATION_WORDS: Readonly<Record<RegistrationFinding['code'], string>> = {
  'sha256-mismatch': '快照的 sha256 与登记不同',
  'api-tree-mismatch': 'api 树与登记不同',
  'not-a-contract-member': '登记的提交上不是契约成员',
}

export function renderBaseline(run: BaselineRun): string[] {
  const changed = run.members.filter(item => item.status !== 'compared' || item.change !== 'none')
  const verdict = run.refused
    ? '拒绝：有 review 而基线没有登记 breakingCards'
    : run.change === 'review'
      ? `放行：review 由 ${run.breakingCards.join('、')} 承接`
      : '通过'
  const lines = [
    `契约 API 相对里程碑 ${run.milestone ?? '（未命名）'} 的基线：${run.change}` +
      `（${run.members.length} 个契约成员，${changed.length} 个有变化或读不出）。${verdict}`,
  ]
  for (const item of changed) {
    const base = item.commit === null ? '基线之后加入' : `基线 ${item.commit.slice(0, 9)}`
    if (item.status === 'invalid') {
      lines.push(`  ${item.directory}（${base}）：读不出，${item.message}`)
      continue
    }
    lines.push(`  ${item.directory}（${base}）：${item.change}`)
    for (const difference of item.differences) lines.push(`    ${describeDifference(difference)}`)
  }
  for (const finding of run.registration)
    lines.push(
      `  登记 ${finding.path}：${finding.code}，${REGISTRATION_WORDS[finding.code]}` +
        `（登记 ${finding.registered}，实际 ${finding.actual ?? '无'}，只报告）`,
    )
  return lines
}
