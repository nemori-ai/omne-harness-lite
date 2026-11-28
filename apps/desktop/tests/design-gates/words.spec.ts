// @module-tag source-text
import { describe, expect, it } from 'vitest'

import { ratchet, tally } from './ratchet.ts'
import { FILES } from './scope.ts'

/**
 * FE-I32: the interface does not narrate what the system is doing, and a normal state does not ask for attention.
 * These five words say exactly that, so none of them appears in the text of a scanned file. Each occurrence is
 * counted, and the count only shrinks.
 */
const FORBIDDEN = ['正在生成', '正在等回复', '已连接', '强提醒', '弱提醒'] as const

export function forbiddenWords(text: string): string[] {
  return FORBIDDEN.flatMap(word => Array.from({ length: text.split(word).length - 1 }, () => word))
}

describe('words gate', () => {
  it('adds no forbidden word to any scanned file', () => {
    const found = FILES.flatMap(file =>
      forbiddenWords(file.text).map(word => `${file.path} | ${word}`),
    )
    const report = ratchet('words', tally(found))
    expect(report.missing, 'no baseline: write it once with DESIGN_GATES_SEED=1').toBe(false)
    expect(report.added, 'forbidden words: say the fact, or say nothing').toEqual([])
    expect(report.stale, 'words removed; shrink words.json with DESIGN_GATES_SHRINK=1').toEqual([])
  })

  it('counts each forbidden word every time it occurs and nothing else', () => {
    const source = `const a = '正在生成'; const b = <p>正在等回复的内容，已连接。已连接</p>
      const level = { strong: '强提醒', weak: '弱提醒' }; const fine = '生成中，等待回复，连接中，提醒'`
    expect(forbiddenWords(source)).toEqual([
      '正在生成',
      '正在等回复',
      '已连接',
      '已连接',
      '强提醒',
      '弱提醒',
    ])
  })
})
