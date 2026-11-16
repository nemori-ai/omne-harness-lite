import { describe, expect, it } from 'vitest'
import {
  SPEC_PATH,
  SPEC_SECTIONS,
  specContentViolations,
  specShapeViolations,
} from '../src/hygiene/spec.ts'

const PATH = 'packages/group/SPEC.md'
const good = ['# 标题', ...SPEC_SECTIONS.flatMap(title => [`## ${title}`, '正文'])].join('\n')
const shape = (text: string, limit = 600) => specShapeViolations([{ path: PATH, text }], limit)
const content = (text: string) =>
  specContentViolations([{ path: PATH, text: `${good}\n${text}` }]).map(v => v.message)

describe('hygiene-spec-shape', () => {
  it('matches only group-level specs', () => {
    expect(SPEC_PATH.test(PATH)).toBe(true)
    expect(SPEC_PATH.test('packages/group/member/SPEC.md')).toBe(false)
  })

  it('matches the spec of an application and of a tool, and no deeper path', () => {
    for (const path of ['apps/cli/SPEC.md', 'tools/dev-flow/SPEC.md'])
      expect(SPEC_PATH.test(path), path).toBe(true)
    for (const path of [
      'apps/cli/docs/SPEC.md',
      'tools/repo-toolchain/src/arch/SPEC.md',
      'apps/SPEC.md',
    ])
      expect(SPEC_PATH.test(path), path).toBe(false)
    const missing = good.replace('## 不变式\n正文', '')
    const violations = specShapeViolations([{ path: 'apps/cli/SPEC.md', text: missing }], 600)
    expect(violations.map(v => [v.rule, v.path])).toEqual([
      ['hygiene-spec-shape', 'apps/cli/SPEC.md'],
    ])
  })

  it('accepts one title and the six sections in order', () => {
    expect(shape(good)).toEqual([])
  })

  it('rejects a missing, extra or reordered section', () => {
    expect(shape(good.replace('## 不变式\n正文', ''))).toHaveLength(1)
    expect(shape(`${good}\n## 附录`)).toHaveLength(1)
    const swapped = good
      .replace('## 领域边界', '## 临时')
      .replace('## 心智模型', '## 领域边界')
      .replace('## 临时', '## 心智模型')
    expect(shape(swapped)).toHaveLength(1)
  })

  it('rejects zero or several first-level titles', () => {
    expect(shape(good.replace('# 标题\n', ''))).toHaveLength(1)
    expect(shape(`${good}\n# 另一个`)).toHaveLength(1)
  })

  it('ignores headings inside code fences', () => {
    expect(shape(`${good}\n\`\`\`md\n## 附录\n# 另一个\n\`\`\``)).toEqual([])
  })

  it('reads a heading only at the start of a line', () => {
    expect(shape(`${good}\n正文里的 # 不是标题`)).toEqual([])
  })

  it('reports the line of the offending heading', () => {
    expect(shape(`${good}\n# 另一个`)[0]?.line).toBe(14)
    expect(shape(good.replace('# 标题\n', ''))[0]?.line).toBe(1)
    expect(shape(`${good}\n## 附录`)[0]?.line).toBe(14)
    expect(shape(good.replace('\n## 不变式\n正文', ''))[0]?.line).toBe(1)
    const swapped = good
      .replace('## 领域边界', '## 临时')
      .replace('## 心智模型', '## 领域边界')
      .replace('## 临时', '## 心智模型')
    expect(shape(swapped)[0]?.line).toBe(4)
  })

  it('counts lines without the trailing newline and accepts a spec exactly at the limit', () => {
    expect(shape(good, 13)).toEqual([])
    expect(shape(`${good}\n`, 13)).toEqual([])
    expect(shape(`${good}\n行`, 13)).toHaveLength(1)
  })

  it('rejects a spec over the line limit', () => {
    const long = `${good}\n${Array.from({ length: 600 }, () => '行').join('\n')}`
    const violations = shape(long)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.message).toContain('超过上限')
    expect(shape(good, 5)).toHaveLength(1)
  })
})

describe('hygiene-spec-content', () => {
  it('accepts plain prose and invariant numbers', () => {
    expect(content('不变式 I-3 与 INV-7 成立。')).toEqual([])
  })

  it('accepts the domain word 候选 and rejects it only as the status of a text', () => {
    expect(content('请求候选是对一组输入算出的结果；终态候选在提交之前固定。')).toEqual([])
    expect(content('本节是候选设计。')).toHaveLength(1)
  })

  it.each([
    ['日期', '生效于 2026-11-12。'],
    ['提交号', '见 `0c1f2f4cc`。'],
    ['卡号', '见 #1249。'],
    ['决定编号', '依 R12-D3。'],
    ['决定编号', '依 D-89。'],
    ['决定编号', '依 RFC-7。'],
    ['状态词', '这一项尚未完成。'],
    ['状态词', '这里 TODO。'],
    ['状态词', '候选方案。'],
    ['状态词', '阶段 2 提供。'],
    ['状态词', '这是 draft。'],
  ])('rejects %s: %s', (_, text) => {
    expect(content(text)).toHaveLength(1)
  })

  it.each(['依据', '修订', '修订记录', '后继', '待办', '未决', '实现状态'])(
    'rejects the heading %s at any level',
    title => {
      expect(content(`### ${title}`)).toHaveLength(1)
    },
  )

  it('lets similar headings and fenced text through', () => {
    expect(content('### 依据与取舍')).toEqual([])
    expect(content('```\n2026-11-12 TODO #1249\n### 待办\n```')).toEqual([])
  })

  it('checks the text after a closed fence and keeps a fence open until its own marker', () => {
    expect(content('```\n正文\n```\n见 #1249')).toHaveLength(1)
    expect(content('```\n~~~\n见 #1249\n```')).toEqual([])
    expect(content('````\n```\n见 #1249\n````')).toEqual([])
    expect(content('```见 #1249\n```')).toEqual([])
    expect(content('  ```\n见 #1249\n  ```')).toEqual([])
  })

  it('reports the line of the hit', () => {
    const [found] = specContentViolations([{ path: PATH, text: '# 标题\n\n见 #1249' }])
    expect(found).toMatchObject({ rule: 'hygiene-spec-content', path: PATH, line: 3 })
  })
})
