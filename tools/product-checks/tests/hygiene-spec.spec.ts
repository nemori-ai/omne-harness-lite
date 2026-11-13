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

  it('reports the line of the hit', () => {
    const [found] = specContentViolations([{ path: PATH, text: '# 标题\n\n见 #1249' }])
    expect(found).toMatchObject({ rule: 'hygiene-spec-content', path: PATH, line: 3 })
  })
})
