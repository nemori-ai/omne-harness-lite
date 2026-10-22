import { describe, expect, it } from 'vitest'
import { readCardAttributes } from '../src/delivery/attributes.ts'

const url = 'https://github.com/owner/repo/issues/7'
function identity(lines: string[]): string {
  return [
    '## 身份与责任',
    '',
    '- 交付层级：subtask',
    ...lines,
    '',
    '## 目标与范围',
    '',
    '正文。',
  ].join('\n')
}

describe('reading card attributes', () => {
  it('reads the three fields from「身份与责任」with the Issue milestone and labels', () => {
    const card = readCardAttributes(
      identity(['- 交付线：model', '- 性质：impl', '- 契约变更：additive']),
      { url, labels: ['line:model', 'kind:feature'], milestone: 'M1' },
    )
    expect(card).toEqual({
      issue: url,
      fields: { line: ['model'], nature: ['impl'], contractChange: ['additive'] },
      milestone: 'M1',
      labels: ['line:model', 'kind:feature'],
    })
  })

  it('keeps missing and repeated fields visible and ignores fields outside the section', () => {
    const body = `${identity(['- 交付线：model', '- 交付线：platform'])}\n- 性质：impl`
    expect(readCardAttributes(body, { url, labels: [] })).toMatchObject({
      fields: { line: ['model', 'platform'], nature: [], contractChange: [] },
      milestone: undefined,
    })
  })
})
