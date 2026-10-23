// 契约 API 快照的三个动作：写快照、核对快照与 dist、对比基线提交上的快照并粗分类。
// 契约成员清单取线归属表的 `contracts`，快照落点取 `repo-toolchain.config.json` 的 `contractApi` 一节。
// 核对与对比只报告：发现不让命令失败，命令只在用法、配置或工具出错时失败。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileAt, git } from '../core/git.ts'
import { readToolchainSection, toolchainConfigPath } from '../core/toolchain-config.ts'
import {
  classifySnapshots,
  strongest,
  type ApiChange,
  type ItemDifference,
} from './api-classify.ts'
import { compareCodePoints, readContractMember, snapshotContracts } from './api-snapshot.ts'

export interface ContractApiConfig {
  /** 线归属表的仓库相对路径；成员清单取各线 `contracts` 的并集。 */
  readonly members: string
  /** 快照路径模板：`{member}` 是成员目录，`{package}` 是不带 scope 的包名。 */
  readonly snapshot: string
}

export function parseContractApiConfig(raw: unknown): ContractApiConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('contractApi 一节须为对象')
  const extra = Object.keys(raw).filter(key => key !== 'members' && key !== 'snapshot')
  if (extra.length > 0) throw new Error(`contractApi 里有认不出的键：${extra.join('、')}`)
  const members = 'members' in raw ? raw.members : undefined
  const snapshot = 'snapshot' in raw ? raw.snapshot : undefined
  if (typeof members !== 'string' || members === '')
    throw new Error('contractApi.members 须为仓库相对路径')
  if (
    typeof snapshot !== 'string' ||
    !snapshot.endsWith('.md') ||
    (!snapshot.includes('{member}') && !snapshot.includes('{package}'))
  )
    throw new Error('contractApi.snapshot 须为以 .md 结尾、含 {member} 或 {package} 的路径模板')
  return { members, snapshot }
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
  const members = new Set<string>()
  for (const line of lines) {
    const contracts: unknown =
      typeof line === 'object' && line !== null && 'contracts' in line ? line.contracts : undefined
    if (
      !Array.isArray(contracts) ||
      !contracts.every(item => typeof item === 'string' && item !== '')
    )
      throw new Error('线归属表里每条线的 contracts 须为路径数组')
    for (const member of contracts) members.add(member)
  }
  return [...members].sort(compareCodePoints)
}

export function snapshotPath(config: ContractApiConfig, member: string, name: string): string {
  return config.snapshot
    .replaceAll('{member}', member)
    .replaceAll('{package}', name.replace(/^@[^/]+\//u, ''))
}

export type MemberStatus =
  /** 快照文件与 dist 现场生成的一致。 */
  | { readonly member: string; readonly path: string; readonly status: 'match' }
  /** `--write` 改写了快照文件（或新建）。 */
  | { readonly member: string; readonly path: string; readonly status: 'written' }
  /** 快照文件与 dist 不一致；`items` 是快照到 dist 的差异，规则同对比基线。 */
  | {
      readonly member: string
      readonly path: string
      readonly status: 'differs'
      readonly change: ApiChange
      readonly items: readonly ItemDifference[]
    }
  | { readonly member: string; readonly path: string; readonly status: 'missing' }
  /** 没有 dist：这次没生成，也没核对。 */
  | { readonly member: string; readonly path: string; readonly status: 'unbuilt' }
  /** package.json 或 dist 的声明不全。 */
  | {
      readonly member: string
      readonly path: string
      readonly status: 'invalid'
      readonly message: string
    }

export interface ContractApiRun {
  readonly typescript: string
  readonly members: readonly MemberStatus[]
}

interface Generated {
  readonly member: string
  readonly path: string
  readonly text: string
}

/** 按配置找出契约成员，从 dist 生成它们的快照；生成不了的成员带着原因返回。 */
function generate(
  root: string,
  config: ContractApiConfig,
): { typescript: string; generated: Generated[]; others: MemberStatus[] } {
  const listed = parseContractMembers(readFileSync(join(root, config.members), 'utf8'))
  const others: MemberStatus[] = []
  const paths = new Map<string, string>()
  for (const member of listed) {
    const read = readContractMember(root, member)
    if (!('entries' in read)) {
      others.push({ member, path: '', status: 'invalid', message: read.message })
      continue
    }
    const path = snapshotPath(config, member, read.name)
    const owner = paths.get(path)
    if (owner !== undefined)
      throw new Error(`快照路径 ${path} 同时属于 ${owner} 与 ${member}，改 contractApi.snapshot`)
    paths.set(path, member)
  }
  const run = snapshotContracts(root, [...paths.values()])
  const pathOf = new Map([...paths].map(([path, member]) => [member, path]))
  for (const member of run.unbuilt)
    others.push({ member, path: pathOf.get(member) ?? '', status: 'unbuilt' })
  for (const problem of run.problems)
    others.push({
      member: problem.member,
      path: pathOf.get(problem.member) ?? '',
      status: 'invalid',
      message: problem.message,
    })
  const generated = run.snapshots.map(snapshot => ({
    member: snapshot.member,
    path: pathOf.get(snapshot.member) ?? '',
    text: snapshot.text,
  }))
  return { typescript: run.typescript, generated, others }
}

function sorted(members: MemberStatus[]): MemberStatus[] {
  return members.sort((a, b) => compareCodePoints(a.member, b.member))
}

/** 从 dist 重写全部契约成员的快照；没有 dist 的成员不写，如实列出。 */
export function writeSnapshots(root: string, config: ContractApiConfig): ContractApiRun {
  const { typescript, generated, others } = generate(root, config)
  const members: MemberStatus[] = generated.map(({ member, path, text }) => {
    const target = join(root, path)
    const unchanged = existsSync(target) && readFileSync(target, 'utf8') === text
    if (!unchanged) {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, text)
    }
    return { member, path, status: unchanged ? 'match' : 'written' }
  })
  return { typescript, members: sorted([...members, ...others]) }
}

/** 拿 dist 现场生成的快照与快照文件比；不一致只报告，列出差异与粗分类。 */
export function checkSnapshots(root: string, config: ContractApiConfig): ContractApiRun {
  const { typescript, generated, others } = generate(root, config)
  const members: MemberStatus[] = generated.map(({ member, path, text }) => {
    const target = join(root, path)
    if (!existsSync(target)) return { member, path, status: 'missing' }
    const recorded = readFileSync(target, 'utf8')
    if (recorded === text) return { member, path, status: 'match' }
    const { change, items } = classifySnapshots(recorded, text)
    return { member, path, status: 'differs', change, items }
  })
  return { typescript, members: sorted([...members, ...others]) }
}

export interface MemberDifference {
  readonly member: string
  readonly path: string
  readonly change: ApiChange
  readonly items: readonly ItemDifference[]
}

export interface DiffRun {
  readonly base: string
  readonly change: ApiChange
  readonly members: readonly MemberDifference[]
}

/**
 * 基线提交上的快照文件对当前工作树的快照文件，逐成员粗分类。
 * 成员清单与快照路径按当前的配置与线归属表算；基线上没有快照文件的成员整份算新增。
 */
export function diffSnapshots(root: string, config: ContractApiConfig, base: string): DiffRun {
  let commit: string
  try {
    commit = git(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`])
  } catch {
    throw new Error(`基线 ${base} 不是这个仓库里的提交`)
  }
  const listed = parseContractMembers(readFileSync(join(root, config.members), 'utf8'))
  const members: MemberDifference[] = []
  for (const member of listed) {
    const read = readContractMember(root, member)
    if (!('entries' in read)) throw new Error(`${member}：${read.message}`)
    const path = snapshotPath(config, member, read.name)
    const target = join(root, path)
    const after = existsSync(target) ? readFileSync(target, 'utf8') : undefined
    const before = fileAt(root, commit, path)
    const { change, items } = classifySnapshots(before, after)
    members.push({ member, path, change, items })
  }
  return { base, change: strongest(members.map(item => item.change)), members }
}

function describeItem(item: ItemDifference): string {
  const where = item.section === '' ? '整份快照' : `${item.section} · ${item.item}`
  const kind = { added: '新增', removed: '删除', changed: '改动' }[item.kind]
  return `${where}：${kind}，${item.change}`
}

export function renderCheck(run: ContractApiRun): string[] {
  const count = (status: MemberStatus['status']) =>
    run.members.filter(item => item.status === status).length
  const lines = [
    `契约 API 快照（TypeScript ${run.typescript}）：${run.members.length} 个契约成员，` +
      `${count('match')} 个与 dist 一致，${count('differs')} 个不一致，${count('missing')} 个没有快照，` +
      `${count('unbuilt')} 个没有 dist，${count('invalid')} 个声明不全（只报告）`,
  ]
  for (const item of run.members) {
    if (item.status === 'differs') {
      lines.push(`  ${item.member}：${item.path} 与 dist 不一致，${item.change}`)
      for (const difference of item.items) lines.push(`    ${describeItem(difference)}`)
    } else if (item.status === 'missing') lines.push(`  ${item.member}：没有快照文件 ${item.path}`)
    else if (item.status === 'unbuilt') lines.push(`  ${item.member}：没有 dist，这次没核对`)
    else if (item.status === 'invalid') lines.push(`  ${item.member}：${item.message}`)
  }
  if (count('differs') + count('missing') > 0)
    lines.push('  公开面有意改动时运行 omne-contract-api --write 更新快照')
  return lines
}

export function renderWrite(run: ContractApiRun): string[] {
  const written = run.members.filter(item => item.status === 'written')
  const lines = [
    `契约 API 快照（TypeScript ${run.typescript}）：写了 ${written.length} 份，` +
      `${run.members.filter(item => item.status === 'match').length} 份不变`,
  ]
  for (const item of written) lines.push(`  ${item.path}`)
  for (const item of run.members)
    if (item.status === 'unbuilt') lines.push(`  ${item.member}：没有 dist，没写`)
    else if (item.status === 'invalid') lines.push(`  ${item.member}：${item.message}，没写`)
  return lines
}

export function renderDiff(run: DiffRun): string[] {
  const changed = run.members.filter(item => item.change !== 'none')
  const lines = [
    `契约 API 相对 ${run.base}：${run.change}（${run.members.length} 个契约成员，${changed.length} 个有变化，只报告）`,
  ]
  for (const item of changed) {
    lines.push(`  ${item.member}：${item.change}`)
    for (const difference of item.items) lines.push(`    ${describeItem(difference)}`)
  }
  return lines
}
