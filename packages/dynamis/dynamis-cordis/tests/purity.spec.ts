// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = import.meta.dirname
const codeOf = (name: string): string =>
  readFileSync(join(here, '../src', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const importsOf = (text: string): string[] =>
  [...text.matchAll(/from '([^']+)'/g)].map(match => match[1] ?? '')

describe('根入口是纯的（DC-4 的前提）', () => {
  it.each(['index.ts', 'seat.ts'])('%s 只导入 dynamis 与本成员的座位', name => {
    const outside = importsOf(codeOf(name)).filter(specifier => specifier !== './seat.ts')
    expect(new Set(outside)).toEqual(
      name === 'seat.ts' ? new Set(['@omne-harness/dynamis']) : new Set(),
    )
  })

  it('seat.ts 不读时钟、随机数、环境，也不排定时器', () => {
    const text = codeOf('seat.ts')
    const banned =
      /\b(Date|performance|Math\.random|crypto|process|globalThis|setTimeout|setInterval|queueMicrotask|fetch)\b/
    expect(text).not.toMatch(banned)
    expect(text).not.toMatch(/\b(async|await|Promise)\b/)
    expect(text).not.toMatch(/^(export )?(let|var)\s/m)
  })

  it('Cordis 只在 ./cordis 入口里', () => {
    expect(importsOf(codeOf('cordis.ts'))).toContain('@deepseek-ai/cordis')
    for (const name of ['index.ts', 'seat.ts'])
      expect(codeOf(name)).not.toContain('@deepseek-ai/cordis')
  })
})
