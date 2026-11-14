import { execFileSync } from 'node:child_process'
import { inspectHistoricalApproval } from './historical-approvals.ts'
import type { HistoricalApproval } from './historical-approvals.data.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repositoryEnv } from '../core/git-environment.ts'
import { readCommits, type CommitRecord } from '../commits.ts'
import { auditRanges, baselines } from '../core/task-context.ts'
import { readToolchainSection, toolchainConfigPath } from '../core/toolchain-config.ts'

export interface AcceptanceLockConfig {
  readonly memberRoots: readonly string[]
  readonly directory: string
  readonly ownerRoles: readonly string[]
}

function names(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(item => typeof item === 'string' && item !== '' && !item.includes('/'))
  )
    throw new Error(`${name} 须为非空的名字数组，名字里不带斜杠`)
  return value
}

export function parseAcceptanceLockConfig(raw: unknown): AcceptanceLockConfig {
  if (typeof raw !== 'object' || raw === null) throw new Error('验收锁的配置须为对象')
  const { memberRoots, directory, ownerRoles } = raw as Record<string, unknown>
  if (typeof directory !== 'string' || directory === '' || directory.includes('/'))
    throw new Error('directory 须为一个不带斜杠的目录名')
  return {
    memberRoots: names(memberRoots, 'memberRoots'),
    directory,
    ownerRoles: names(ownerRoles, 'ownerRoles'),
  }
}

export function readAcceptanceLockConfig(
  path: string = toolchainConfigPath(),
): AcceptanceLockConfig {
  return parseAcceptanceLockConfig(readToolchainSection('acceptanceLock', path))
}

export function isAcceptancePath(path: string, config: AcceptanceLockConfig): boolean {
  const segments = path.split('/')
  return (
    config.memberRoots.includes(segments[0] ?? '') &&
    !segments.includes('node_modules') &&
    segments.slice(1, -1).includes(config.directory)
  )
}

export const PLACEHOLDER_MARKER = '<!-- documentation:placeholder -->'
const ENTRY_NAMES = new Set(['README.md', 'index.md'])

function isEntryName(path: string): boolean {
  return ENTRY_NAMES.has(path.slice(path.lastIndexOf('/') + 1))
}

export function isPlaceholderEntry(path: string, content: string | undefined): boolean {
  if (!isEntryName(path) || content === undefined) return false
  return content.split('\n').some(line => line.trim() === PLACEHOLDER_MARKER)
}

export function agentRole(message: string): string | undefined {
  let role: string | undefined
  for (const line of message.split('\n')) {
    const found = /^Agent-Role:\s*(\S.*?)\s*$/u.exec(line)
    if (found !== null) role = found[1]
  }
  return role
}

export interface TouchingCommit {
  readonly sha: string
  readonly subject: string
  readonly author: string
  readonly role: string | undefined
  readonly files: readonly string[]
  readonly allowed: boolean
}

export interface FileChange {
  readonly status: 'added' | 'modified' | 'deleted'
  readonly path: string
}

export interface LockReport {
  readonly base: string
  readonly mergeBase: string
  readonly changes: readonly FileChange[]
  readonly commits: readonly TouchingCommit[]
  readonly uncommitted: readonly string[]
  readonly violations: readonly string[]
  readonly approvedExceptions: readonly HistoricalApproval[]
  readonly unresolvedViolations: readonly string[]
}

export interface CommitTouch {
  readonly record: CommitRecord
  readonly files: readonly string[]
}

export function judge(
  touches: readonly CommitTouch[],
  uncommitted: readonly string[],
  config: AcceptanceLockConfig,
): Pick<LockReport, 'commits' | 'violations'> {
  const commits = touches.map(({ record, files }): TouchingCommit => {
    const role = agentRole(record.message)
    return {
      sha: record.sha,
      subject: record.message.split('\n', 1)[0] ?? '',
      author: record.authorName,
      role,
      files,
      allowed: role === undefined || config.ownerRoles.includes(role),
    }
  })
  const violations = commits
    .filter(commit => !commit.allowed)
    .map(
      commit =>
        `提交 ${commit.sha.slice(0, 9)}（Agent-Role: ${commit.role}）改了验收文件：${commit.files.join('、')}`,
    )
  if (uncommitted.length > 0)
    violations.push(
      `工作树里有未提交的验收改动，说不清是谁改的：${uncommitted.join('、')}。由验收的拥有者提交，或还原`,
    )
  return { commits, violations }
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    env: repositoryEnv(process.env),
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd()
}

function lines(text: string): string[] {
  return text.split('\n').filter(line => line !== '')
}

function contentAt(root: string, revision: string, path: string): string | undefined {
  try {
    return git(root, ['show', `${revision}:${path}`])
  } catch (error) {
    if (git(root, ['ls-tree', revision, '--', path]) === '') return undefined
    throw error
  }
}

function contentsAt(root: string, specs: readonly string[]): Map<string, string | undefined> {
  const found = new Map<string, string | undefined>()
  const unique = [...new Set(specs)]
  if (unique.length === 0) return found
  const output = execFileSync('git', ['cat-file', '--batch'], {
    env: repositoryEnv(process.env),
    cwd: root,
    input: unique.map(spec => `${spec}\n`).join(''),
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let offset = 0
  for (const spec of unique) {
    const end = output.indexOf(0x0a, offset)
    if (end < 0) throw new Error(`git cat-file --batch 的输出在 ${spec} 处中断`)
    const header = output.subarray(offset, end).toString('utf8')
    offset = end + 1
    if (header === `${spec} missing`) {
      found.set(spec, undefined)
      continue
    }
    const object = /^[0-9a-f]+ blob (\d+)$/u.exec(header)
    if (object === null) throw new Error(`读 ${spec} 时认不出的 git cat-file 输出：${header}`)
    const size = Number(object[1])
    found.set(
      spec,
      output
        .subarray(offset, offset + size)
        .toString('utf8')
        .trimEnd(),
    )
    offset += size + 1
  }
  return found
}

function worktreeContent(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), 'utf8')
  } catch {
    return undefined
  }
}

const STATUS = { A: 'added', M: 'modified', D: 'deleted', T: 'modified' } as const

function changesSince(
  root: string,
  mergeBase: string,
  config: AcceptanceLockConfig,
  head = 'HEAD',
): FileChange[] {
  const changes: FileChange[] = []
  for (const line of lines(
    git(root, [
      'diff',
      '--no-renames',
      '--name-status',
      mergeBase,
      ...(head === 'HEAD' ? [] : [head]),
    ]),
  )) {
    const [code, path] = line.split('\t')
    const status = STATUS[code as keyof typeof STATUS]
    if (path === undefined || status === undefined) throw new Error(`认不出的 git diff 行：${line}`)
    if (!isAcceptancePath(path, config)) continue
    const content =
      status === 'deleted'
        ? contentAt(root, mergeBase, path)
        : head === 'HEAD'
          ? worktreeContent(root, path)
          : contentAt(root, head, path)
    if (!isPlaceholderEntry(path, content)) changes.push({ status, path })
  }
  for (const path of head === 'HEAD'
    ? lines(git(root, ['ls-files', '--others', '--exclude-standard']))
    : [])
    if (isAcceptancePath(path, config) && !isPlaceholderEntry(path, worktreeContent(root, path)))
      changes.push({ status: 'added', path })
  return changes.sort((a, b) => a.path.localeCompare(b.path))
}

function uncommittedPaths(root: string, config: AcceptanceLockConfig): string[] {
  const tracked = lines(git(root, ['diff', '--no-renames', '--name-only', 'HEAD']))
  const untracked = lines(git(root, ['ls-files', '--others', '--exclude-standard']))
  return [...new Set([...tracked, ...untracked])]
    .filter(path => isAcceptancePath(path, config))
    .filter(
      path =>
        !isPlaceholderEntry(path, worktreeContent(root, path) ?? contentAt(root, 'HEAD', path)),
    )
    .sort()
}

const COMMIT_MARK = '\u001e'

export function namesByCommit(
  root: string,
  range: string,
  integration: boolean,
): Map<string, Set<string>> {
  const output = git(root, [
    '-c',
    'log.showRoot=false',
    '-c',
    'log.diffMerges=separate',
    'log',
    '--no-show-signature',
    `--format=${COMMIT_MARK}%H`,
    '--name-only',
    '--no-renames',
    '-r',
    ...(integration ? ['--cc'] : ['-m']),
    range,
  ])
  const names = new Map<string, Set<string>>()
  for (const block of output.split(COMMIT_MARK)) {
    const [sha, ...paths] = block.split('\n')
    if (sha === undefined || sha === '') continue
    const seen = names.get(sha) ?? new Set<string>()
    for (const path of paths) if (path !== '') seen.add(path)
    names.set(sha, seen)
  }
  return names
}

function touchesSince(
  root: string,
  mergeBase: string,
  config: AcceptanceLockConfig,
  head = 'HEAD',
  integration = false,
): CommitTouch[] {
  const range = `${mergeBase}..${head}`
  const names = namesByCommit(root, range, integration)
  const touched = readCommits(root, range).map(record => ({
    record,
    files: [...(names.get(record.sha) ?? [])].filter(path => isAcceptancePath(path, config)),
  }))
  const entries = touched.flatMap(({ record, files }) =>
    files.filter(isEntryName).map(path => ({ sha: record.sha, path })),
  )
  const after = contentsAt(
    root,
    entries.map(({ sha, path }) => `${sha}:${path}`),
  )
  const before = contentsAt(
    root,
    entries
      .filter(({ sha, path }) => after.get(`${sha}:${path}`) === undefined)
      .map(({ sha, path }) => `${sha}^:${path}`),
  )
  const content = (sha: string, path: string) =>
    after.get(`${sha}:${path}`) ?? before.get(`${sha}^:${path}`)
  return touched.flatMap(({ record, files }) => {
    const kept = files
      .filter(path => !isEntryName(path) || !isPlaceholderEntry(path, content(record.sha, path)))
      .sort()
    return kept.length > 0 ? [{ record, files: kept }] : []
  })
}

export function inspect(
  root: string,
  base: string,
  config: AcceptanceLockConfig,
  head = 'HEAD',
  integration = false,
): LockReport {
  const mergeBase = git(root, ['merge-base', base, head])
  const uncommitted = head === 'HEAD' ? uncommittedPaths(root, config) : []
  const touches = touchesSince(root, mergeBase, config, head, integration)
  const original = judge(touches, uncommitted, config)
  const approvedExceptions = original.commits.flatMap(commit =>
    commit.allowed ? [] : inspectHistoricalApproval(root, commit.sha, commit.files),
  )
  const unresolvedTouches = touches.flatMap(touch => {
    const files = touch.files.filter(
      path =>
        !approvedExceptions.some(item => item.commit === touch.record.sha && item.path === path),
    )
    return files.length === 0 ? [] : [{ ...touch, files }]
  })
  return {
    base,
    mergeBase,
    changes: changesSince(root, mergeBase, config, head),
    uncommitted,
    ...original,
    approvedExceptions,
    unresolvedViolations: judge(unresolvedTouches, uncommitted, config).violations,
  }
}

const STATUS_WORD = { added: '新增', modified: '修改', deleted: '删除' } as const

export function render(report: LockReport, config: AcceptanceLockConfig): string[] {
  const out = [
    `验收锁（基线 ${report.base}，合并点 ${report.mergeBase.slice(0, 9)}；可以改验收的角色：${config.ownerRoles.join('、')}，以及没有来源 trailer 的提交）`,
  ]
  if (report.changes.length === 0 && report.commits.length === 0) {
    out.push('  基线以来没有验收文件被改动。')
    return out
  }
  out.push(`  基线到当前工作树，验收文件的变化 ${report.changes.length} 处：`)
  for (const change of report.changes) out.push(`    ${STATUS_WORD[change.status]}  ${change.path}`)
  out.push(`  碰过验收文件的提交 ${report.commits.length} 个：`)
  for (const commit of report.commits) {
    const role =
      commit.role === undefined ? '无来源 trailer，按人写的算' : `Agent-Role: ${commit.role}`
    out.push(
      `    ${commit.allowed ? '  ' : '✗ '}${commit.sha.slice(0, 9)}  ${commit.author}  ${role}  ${commit.subject}`,
    )
    for (const file of commit.files) out.push(`        ${file}`)
  }
  if (report.violations.length === 0) out.push('  没有不该改验收的角色动过它。')
  else {
    out.push(`  原始违规（锁被破 ${report.violations.length} 处）：`)
    for (const violation of report.violations) out.push(`    ${violation}`)
  }
  out.push(`  已批准历史例外 ${report.approvedExceptions.length} 处：`)
  for (const approval of report.approvedExceptions) {
    out.push(`    ${approval.commit}  ${approval.path}`, `      决定：${approval.decisionUrl}`)
    out.push(`      parent: ${approval.parent}`, `      oldBlob: ${approval.oldBlob}`)
    out.push(`      newBlob: ${approval.newBlob}`, `      diffSha256: ${approval.diffSha256}`)
  }
  out.push(`  未解决违规 ${report.unresolvedViolations.length} 处：`)
  for (const violation of report.unresolvedViolations) out.push(`    ${violation}`)
  return out
}

export function auditHistory(
  root: string,
  explicitBase: string | undefined,
  config: AcceptanceLockConfig,
) {
  const bound = baselines(root, explicitBase).state === 'bound'
  return auditRanges(root, explicitBase).map(range => ({
    ...range,
    acceptance: inspect(root, range.base, config, range.head, bound),
  }))
}
