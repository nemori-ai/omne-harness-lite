// 回放：对一条分支上最近的若干个 first-parent 提交，各以父提交为基线、以它本身为改动算一次计划（只算不跑）。
// 成员清单取那个提交上的（当时的 workspace），路径规则取现在的配置——回放量的是现行规则放在过去会怎么判。
// 受影响的成员由 turbo 比较父提交与该提交给出；turbo 的包依赖图取当前工作树的，这是一个近似：
// 那之后改过的依赖关系会按现在的算。
// 用来在改规则前后看「判全量的有几个、是不是该全量」，不进 `make check`。
import { git, nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import { planCheck, sample, type CheckPlan } from './scope.ts'
import { affectedMembers } from './turbo.ts'
import type { AffectedRules } from './config.ts'
import {
  fileTree,
  gitTree,
  listWorkspaceMembers,
  type WorkspaceMember,
} from '@omne-harness/repo-toolchain/core/workspace'

export interface ReplayRow {
  readonly commit: string
  readonly subject: string
  readonly files: number
  readonly mode: CheckPlan['mode'] | 'error'
  readonly tests: number
  readonly python: boolean
  readonly reason: string
  /** 判全量时命中全局或未归类的文件（全量才有）。 */
  readonly fullBecause?: readonly string[]
}

/** 一个提交相对它第一个父提交改动的路径（改名拆成删与增，两侧都算）。 */
export function commitChanges(root: string, commit: string): string[] {
  return nulSeparated(
    git(root, ['diff', '--no-renames', '--name-only', '-z', `${commit}^1`, commit]),
  )
}

/** 现行规则放到过去：那时还不存在的成员从读者与常驻构建里拿掉（那时没有这个读者），其余照旧。 */
export function rulesAt(rules: AffectedRules, members: readonly WorkspaceMember[]): AffectedRules {
  const known = new Set(members.map(member => member.path))
  return {
    ...rules,
    readers: rules.readers.map(reader => ({
      ...reader,
      members: reader.members.filter(member => known.has(member)),
    })),
    residentBuild: rules.residentBuild.filter(entry => known.has(entry.member)),
  }
}

export function replay(
  root: string,
  ref: string,
  count: number,
  rules: AffectedRules,
): ReplayRow[] {
  const current = listWorkspaceMembers(fileTree(root), rules.excludeRoots)
  const commits = git(root, ['rev-list', '--first-parent', `--max-count=${count}`, ref])
    .split('\n')
    .filter(line => line !== '')
  return commits.map(commit => {
    const subject = git(root, ['log', '-1', '--format=%s', commit])
    const short = commit.slice(0, 9)
    const changed = commitChanges(root, commit)
    try {
      const members = listWorkspaceMembers(gitTree(root, commit), rules.excludeRoots)
      const known = new Set(members.map(member => member.path))
      const affected = new Set(
        [...affectedMembers(root, current, `${commit}^1`, commit)].filter(path => known.has(path)),
      )
      const plan = planCheck(changed, members, rulesAt(rules, members), affected)
      const because = plan.files
        .filter(file => file.category === 'global' || file.category === 'unclassified')
        .map(file => file.path)
      return {
        commit: short,
        subject,
        files: changed.length,
        mode: plan.mode,
        tests: plan.test.length,
        python: plan.python.run,
        reason: plan.reason,
        ...(plan.mode === 'full' ? { fullBecause: because } : {}),
      }
    } catch (error) {
      return {
        commit: short,
        subject,
        files: changed.length,
        mode: 'error' as const,
        tests: 0,
        python: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ')

/** Markdown 表格，最后一行是各模式的计数。 */
export function replayTable(rows: readonly ReplayRow[]): string[] {
  const lines = [
    '| 提交 | 主题 | 改动文件 | 模式 | 测试成员数 | pytest | 理由摘要 |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(
      row =>
        `| ${row.commit} | ${cell(row.subject.slice(0, 60))} | ${row.files} | ${row.mode} | ${row.tests} | ${row.python ? '跑' : '—'} | ${cell(
          row.fullBecause === undefined || row.fullBecause.length === 0
            ? row.reason
            : `${row.reason}；全局或未归类：${sample(row.fullBecause, 3)}`,
        )} |`,
    ),
  ]
  const count = (mode: ReplayRow['mode']) => rows.filter(row => row.mode === mode).length
  const residentOnly = rows.filter(
    row => row.mode === 'scoped' && row.tests === 0 && !row.python,
  ).length
  lines.push(
    '',
    `共 ${rows.length} 个提交：全量 ${count('full')}，按影响面 ${count('scoped')}（其中只需常驻检查 ${residentOnly}），引擎出错 ${count('error')}`,
  )
  return lines
}
