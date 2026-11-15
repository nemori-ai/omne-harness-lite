import { git, nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import { lockfileImpactBetween } from './steps.ts'
import { planCheck, sample, type CheckPlan } from './scope.ts'
import { affectedMembers, dependentMembers } from './turbo.ts'
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
  readonly fullBecause?: readonly string[]
}

export function commitChanges(root: string, commit: string): string[] {
  return nulSeparated(
    git(root, ['diff', '--no-renames', '--name-only', '-z', `${commit}^1`, commit]),
  )
}

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
      const now = new Set(current.map(member => member.path))
      const affected = new Set(
        [...affectedMembers(root, current, `${commit}^1`, commit)].filter(path => known.has(path)),
      )
      const plan = planCheck(
        changed,
        members,
        rulesAt(rules, members),
        affected,
        false,
        paths =>
          new Set(
            [
              ...dependentMembers(
                root,
                current,
                paths.filter(path => now.has(path)),
              ),
            ].filter(path => known.has(path)),
          ),
        () => lockfileImpactBetween(root, `${commit}^1`, commit, members),
      )
      const because = plan.files
        .filter(
          file =>
            file.category === 'global' ||
            file.category === 'lockfile' ||
            file.category === 'unclassified',
        )
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
