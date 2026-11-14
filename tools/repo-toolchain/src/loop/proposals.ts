import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeFunction, type FunctionRow } from '../metrics/report.ts'
import { BAND_WORDS, type Lines } from './bands.ts'
import { BUDGET_LABELS, type MemberBudget } from './budget.ts'
import { BUDGET_ITEMS, type BudgetItem } from './config.ts'
import type { CaseWithoutAssertion } from './sensors/assertions.ts'
import type { Clone } from './sensors/duplication.ts'

export const CLEANUP_SECTIONS = [
  '## 目标成员',
  '## 要清理的条目',
  '## 行为锁',
  '## 解除条件',
  '## 不许动的',
  '## 状态',
] as const

export const fixed = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

export function describeClone(clone: Clone): string {
  return (
    `${clone.a.path}:${clone.a.start}-${clone.a.end} ↔ ${clone.b.path}:${clone.b.start}-${clone.b.end}（${clone.lines} 行` +
    `${clone.bEndEstimated ? '；后一端止行按前一端行数推算' : ''}）`
  )
}

export interface ProposalInput {
  readonly budget: MemberBudget
  readonly lines: Readonly<Record<BudgetItem, Lines>>
  readonly commit: string
  readonly dirty: boolean
  readonly functions: readonly FunctionRow[]
  readonly clones: readonly Clone[]
  readonly casesWithoutAssertions: readonly CaseWithoutAssertion[]
}

export function renderProposal(input: ProposalInput): string {
  const { budget } = input
  const [target, items, lock, release, untouchable, status] = CLEANUP_SECTIONS
  const out: string[] = [`# 清理草稿：${budget.member}`, '', target, '']
  out.push(`- 成员：\`${budget.member}\``)
  out.push(`- 度量所在提交：\`${input.commit}\`${input.dirty ? '（工作树不干净）' : ''}`)
  out.push(`- 超预算的项：${budget.over.map(item => BUDGET_LABELS[item]).join('、')}`)
  out.push('', items, '')
  const list = (title: string, entries: readonly string[]) => {
    out.push(`### ${title}（${entries.length}）`, '')
    if (entries.length === 0) out.push('无', '')
    else out.push(...entries.map(entry => `- ${entry}`), '')
  }
  list(
    '超过 alert 的函数',
    input.functions.map(row => describeFunction(row)),
  )
  list('克隆', input.clones.map(describeClone))
  list(
    '没有断言的测试',
    input.casesWithoutAssertions.map(found => `${found.path}:${found.line} ${found.name}`),
  )
  out.push(lock, '', '该成员现有测试只读，清理前后 `pnpm run test:affected` 都要全过。', '')
  out.push(release, '')
  for (const item of BUDGET_ITEMS) {
    const value = budget.values[item]
    const band = budget.bands[item]
    const line = input.lines[item]
    out.push(
      value === undefined || band === undefined
        ? `- ${BUDGET_LABELS[item]}：这次没有数据；解除线 ${fixed(line.release)}`
        : `- ${BUDGET_LABELS[item]}：当前 ${fixed(value)}（${BAND_WORDS[band]}）；解除线 ${fixed(line.release)}` +
            (band === 'act' ? '，须回落到它及以下' : ''),
    )
  }
  out.push('', untouchable, '')
  out.push('公开入口（`package.json` 的 `exports`）、别的成员、`acceptance/`、契约与规格。', '')
  out.push(status, '', '草稿：等负责人批准后才派发。', '')
  return out.join('\n')
}

export function proposalPath(dir: string, member: string): string {
  return join(dir, `${member.replaceAll('/', '-')}.md`)
}

export function writeProposal(dir: string, input: ProposalInput): string {
  mkdirSync(dir, { recursive: true })
  const path = proposalPath(dir, input.budget.member)
  writeFileSync(path, renderProposal(input))
  return path
}
