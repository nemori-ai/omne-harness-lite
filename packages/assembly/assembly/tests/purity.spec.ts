// @module-tag source-text
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = import.meta.dirname
/** The code alone: a comment may say "process" or "clock". */
const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const sources = readdirSync(join(here, '../src'))
  .filter(name => name.endsWith('.ts'))
  .map(name => ({ name, text: codeOf(readFileSync(join(here, '../src', name), 'utf8')) }))
/** The parts that are values and functions from values to values; the close protocol is given its clock. */
const pure = sources.filter(source => !['close-protocol.ts', 'index.ts'].includes(source.name))

describe('assembly 是纯的：不认识 Cordis，不读时钟，不取随机数', () => {
  it.each(sources)('$name 只导入本成员自己的文件', ({ text }) => {
    const specifiers = [...text.matchAll(/from '([^']+)'/g)].map(match => match[1])
    expect(specifiers.filter(specifier => !specifier?.startsWith('./'))).toEqual([])
    expect(text).not.toMatch(/\b(require|import)\(/)
  })

  it.each(sources)('$name 不读时钟、随机数、环境，也不排定时器', ({ text }) => {
    const banned =
      /\b(Date|performance|Math\.random|crypto|process|globalThis|setTimeout|setInterval|queueMicrotask|fetch)\b/
    expect(text).not.toMatch(banned)
  })

  it.each(pure)('$name 是值到值的函数：没有异步，没有模块级的可变状态', ({ text }) => {
    expect(text).not.toMatch(/\b(async|await|Promise)\b/)
    expect(text).not.toMatch(/^(export )?(let|var) /m)
    expect(text).not.toMatch(/^(export )?const \w+[^=\n]*= new (Map|Set|WeakMap|WeakSet)\b/m)
  })
})
