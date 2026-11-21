// @module-tag source-text
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = import.meta.dirname
/** The code alone: a comment may say "process" or "clock". */
const codeOf = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '')
const sources = readdirSync(join(here, '../src'))
  .filter(name => name.endsWith('.ts'))
  .map(name => ({ name, text: codeOf(readFileSync(join(here, '../src', name), 'utf8')) }))

describe('DY-14：这个成员是纯的', () => {
  it('九个部件加根入口，一个部件一个文件', () => {
    expect(sources.map(source => source.name).sort()).toEqual([
      'answer.ts',
      'catalog.ts',
      'floor.ts',
      'impact.ts',
      'index.ts',
      'reference.ts',
      'registry.ts',
      'rollout.ts',
      'tree.ts',
      'withdraw.ts',
    ])
  })

  it.each(sources)('$name 只导入本成员自己的文件', ({ text }) => {
    const specifiers = [...text.matchAll(/from '([^']+)'/g)].map(match => match[1])
    expect(specifiers.filter(specifier => !specifier?.startsWith('./'))).toEqual([])
    expect(text).not.toMatch(/\b(require|import)\(/)
  })

  it.each(sources)('$name 不读时钟、随机数、环境，也不排定时器', ({ text }) => {
    const banned =
      /\b(Date|performance|Math\.random|crypto|process|globalThis|setTimeout|setInterval|queueMicrotask|fetch)\b/
    expect(text).not.toMatch(banned)
    expect(text).not.toMatch(/\b(async|await|Promise)\b/)
  })

  it.each(sources)('$name 没有模块级的可变状态', ({ text }) => {
    expect(text).not.toMatch(/^(export )?(let|var) /m)
    expect(text).not.toMatch(/^(export )?const \w+[^=\n]*= new (Map|Set|WeakMap|WeakSet)\b/m)
  })

  it('包清单没有运行时依赖', () => {
    const manifest = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    expect(manifest.dependencies ?? {}).toEqual({})
    expect(manifest.peerDependencies ?? {}).toEqual({})
  })
})
