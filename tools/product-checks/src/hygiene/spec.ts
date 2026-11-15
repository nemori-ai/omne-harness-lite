import type { Violation } from '@omne-harness/repo-toolchain/core/rule'

export const SPEC_PATH = /^(?:packages|apps|tools)\/[^/]+\/SPEC\.md$/u

export const SPEC_SECTIONS = [
  '总体架构',
  '领域边界',
  '心智模型',
  '应然设计',
  '原则与约束',
  '不变式',
] as const

export const SHAPE_RULE = 'hygiene-spec-shape'
export const CONTENT_RULE = 'hygiene-spec-content'

const FORBIDDEN_HEADINGS = new Set(['依据', '修订', '修订记录', '后继', '待办', '未决', '实现状态'])

const FORBIDDEN_FORMS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: '日期', pattern: /20\d\d-\d\d-\d\d/u },
  { name: '提交号', pattern: /`[0-9a-fA-F]{7,40}`/u },
  { name: '卡号或 PR 号', pattern: /#\d{3,}/u },
  { name: '决定编号', pattern: /R\d+-D\d+|\bD-\d+|RFC-\d+/u },
  {
    name: '状态词',
    pattern:
      /已实现|未实现|尚未|待补|待定|暂缺|TODO|draft|候选(?:方案|设计|规格|正文|稿)|阶段 ?\d/u,
  },
]

export interface SpecFile {
  readonly path: string
  readonly text: string
}

interface Line {
  readonly number: number
  readonly text: string
  readonly inFence: boolean
}

function lines(text: string): Line[] {
  const rows = text.split('\n')
  if (rows.at(-1) === '') rows.pop()
  let fence: string | undefined
  return rows.map((row, index) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/u.exec(row)?.[1]
    if (fence === undefined) {
      if (marker !== undefined) {
        fence = marker
        return { number: index + 1, text: row, inFence: true }
      }
      return { number: index + 1, text: row, inFence: false }
    }
    if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length)
      fence = undefined
    return { number: index + 1, text: row, inFence: true }
  })
}

function heading(row: Line): { level: number; title: string } | undefined {
  if (row.inFence) return undefined
  const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/u.exec(row.text)
  return match === null ? undefined : { level: match[1]?.length ?? 0, title: match[2] ?? '' }
}

export function specShapeViolations(files: readonly SpecFile[], specLines: number): Violation[] {
  const out: Violation[] = []
  for (const file of files) {
    const rows = lines(file.text)
    const report = (line: number, message: string) =>
      out.push({ rule: SHAPE_RULE, path: file.path, line, message })
    const headings = rows.flatMap(row => {
      const found = heading(row)
      return found === undefined ? [] : [{ ...found, line: row.number }]
    })
    const ones = headings.filter(item => item.level === 1)
    if (ones.length !== 1) report(ones[1]?.line ?? 1, `一级标题须正好一个，实际 ${ones.length} 个`)
    const twos = headings.filter(item => item.level === 2)
    const mismatch = twos.findIndex((item, index) => item.title !== SPEC_SECTIONS[index])
    if (twos.length !== SPEC_SECTIONS.length || mismatch !== -1)
      report(
        twos[mismatch === -1 ? SPEC_SECTIONS.length : mismatch]?.line ?? 1,
        `二级标题须恰为 ${SPEC_SECTIONS.join('、')}，次序不变；实际 ${twos.map(item => item.title).join('、') || '无'}`,
      )
    if (rows.length > specLines) report(1, `规格 ${rows.length} 行，超过上限 ${specLines} 行`)
  }
  return out
}

export function specContentViolations(files: readonly SpecFile[]): Violation[] {
  const out: Violation[] = []
  for (const file of files) {
    for (const row of lines(file.text)) {
      if (row.inFence) continue
      for (const form of FORBIDDEN_FORMS) {
        const hit = form.pattern.exec(row.text)
        if (hit !== null)
          out.push({
            rule: CONTENT_RULE,
            path: file.path,
            line: row.number,
            message: `规格正文不许出现${form.name}：${hit[0]}`,
          })
      }
      const title = heading(row)?.title
      if (title !== undefined && FORBIDDEN_HEADINGS.has(title))
        out.push({
          rule: CONTENT_RULE,
          path: file.path,
          line: row.number,
          message: `规格不许有标题「${title}」`,
        })
    }
  }
  return out
}
