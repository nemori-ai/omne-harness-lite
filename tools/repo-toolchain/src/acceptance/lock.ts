// 验收锁：验收文件归负责的人与主线，实施的 agent 只能运行它，不能改它。
// 这里核对的是「自任务基线以来，谁动过验收文件」：基线提交就是当时的清单（Git 按内容寻址，不必另存一份哈希），
// 交回时拿它与当前工作树比，并把这段范围里碰过验收文件的提交逐个列出、按来源 trailer 判断是不是验收的拥有者改的。
// 谁算拥有者、哪个目录算验收，只在 `acceptance-lock.config.json` 里定一次。
import { execFileSync } from 'node:child_process'
import { repositoryEnv } from '../core/git-environment.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readCommits, type CommitRecord } from '../commits.ts'
import { auditRanges, baselines } from '../core/task-context.ts'

export interface AcceptanceLockConfig {
  /** 成员所在的根目录；只有它们下面的验收目录受这把锁管。 */
  readonly memberRoots: readonly string[]
  /** 验收目录的名字：路径里有一段等于它的文件就是验收文件。 */
  readonly directory: string
  /** 可以改验收的角色（来源 trailer `Agent-Role` 的值）。没有这条 trailer 的提交按人写的算。 */
  readonly ownerRoles: readonly string[]
}

const CONFIG_PATH = fileURLToPath(new URL('../../acceptance-lock.config.json', import.meta.url))

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

export function readAcceptanceLockConfig(path: string = CONFIG_PATH): AcceptanceLockConfig {
  return parseAcceptanceLockConfig(JSON.parse(readFileSync(path, 'utf8')))
}

export function isAcceptancePath(path: string, config: AcceptanceLockConfig): boolean {
  const segments = path.split('/')
  return (
    config.memberRoots.includes(segments[0] ?? '') &&
    !segments.includes('node_modules') &&
    segments.slice(1, -1).includes(config.directory)
  )
}

/** 提交信息里最后一条 `Agent-Role:` 的值；没有则为 undefined。 */
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
  /** 来源 trailer 写的角色；没写的按人写的算。 */
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
  /** 基线到当前工作树，验收文件的净变化（含未提交与未跟踪）。 */
  readonly changes: readonly FileChange[]
  /** 基线之后碰过验收文件的提交，新的在前。 */
  readonly commits: readonly TouchingCommit[]
  /** 工作树里还没提交的验收改动：说不清是谁改的。 */
  readonly uncommitted: readonly string[]
  readonly violations: readonly string[]
}

export interface CommitTouch {
  readonly record: CommitRecord
  readonly files: readonly string[]
}

/** 纯函数：给碰过验收文件的提交与未提交的改动，判断这把锁有没有被破。 */
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
    if (isAcceptancePath(path, config)) changes.push({ status, path })
  }
  for (const path of head === 'HEAD'
    ? lines(git(root, ['ls-files', '--others', '--exclude-standard']))
    : [])
    if (isAcceptancePath(path, config)) changes.push({ status: 'added', path })
  return changes.sort((a, b) => a.path.localeCompare(b.path))
}

function uncommittedPaths(root: string, config: AcceptanceLockConfig): string[] {
  const tracked = lines(git(root, ['diff', '--no-renames', '--name-only', 'HEAD']))
  const untracked = lines(git(root, ['ls-files', '--others', '--exclude-standard']))
  return [...new Set([...tracked, ...untracked])]
    .filter(path => isAcceptancePath(path, config))
    .sort()
}

function touchesSince(
  root: string,
  mergeBase: string,
  config: AcceptanceLockConfig,
  head = 'HEAD',
  integration = false,
): CommitTouch[] {
  const touches: CommitTouch[] = []
  for (const record of readCommits(root, `${mergeBase}..${head}`)) {
    // `-m` 让合并提交相对每个父提交各列一次，路径去重后即「这个提交带进来的验收改动」。
    const names = git(root, [
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '--no-renames',
      '-r',
      ...(integration ? ['--cc'] : ['-m']),
      record.sha,
    ])
    const files = [...new Set(lines(names))].filter(path => isAcceptancePath(path, config)).sort()
    if (files.length > 0) touches.push({ record, files })
  }
  return touches
}

/** 读 Git：基线到当前工作树之间，验收文件发生了什么、谁改的。 */
export function inspect(
  root: string,
  base: string,
  config: AcceptanceLockConfig,
  head = 'HEAD',
  integration = false,
): LockReport {
  const mergeBase = git(root, ['merge-base', base, head])
  const uncommitted = head === 'HEAD' ? uncommittedPaths(root, config) : []
  return {
    base,
    mergeBase,
    changes: changesSince(root, mergeBase, config, head),
    uncommitted,
    ...judge(touchesSince(root, mergeBase, config, head, integration), uncommitted, config),
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
    out.push(`  锁被破 ${report.violations.length} 处：`)
    for (const violation of report.violations) out.push(`    ${violation}`)
  }
  return out
}

/** Every audit range of this tree with the acceptance edits it carries. */
export function auditHistory(
  root: string,
  explicitBase: string | undefined,
  config: AcceptanceLockConfig,
) {
  const adopted = baselines(root, explicitBase).state === 'adopted'
  return auditRanges(root, explicitBase).map(range => ({
    ...range,
    acceptance: inspect(root, range.base, config, range.head, adopted),
  }))
}
