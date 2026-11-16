import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const src = join(import.meta.dirname, '..', 'src')

function sources(): readonly { readonly path: string; readonly text: string }[] {
  return readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter(path => /\.(ts|tsx|css)$/.test(path))
    .map(path => ({ path, text: readFileSync(join(src, path), 'utf8') }))
}

const ALLOWED = new Set([
  'react',
  '@omne-harness/client-assembly/cordis',
  '@omne-harness/shell-contract',
  '@omne-harness/shell-contract/cordis',
  '@omne-harness/ui-kit',
  '@omne-harness/sdk/core',
  '@omne-harness/public-contract',
  '@omne-harness/session-protocol',
  '@omne-harness/utc-instant',
])

it('只导入客户端装配、外壳契约、共用界面件、SDK 的客户端核心、公开契约、会话的协议契约与共用纯定义', () => {
  const outside = sources()
    .flatMap(({ text }) => [...text.matchAll(/from '([^']+)'/g)].map(match => match[1] ?? ''))
    .filter(name => !name.startsWith('.'))
  expect(outside.filter(name => !ALLOWED.has(name))).toEqual([])
})

it('根入口的源码闭包不含 Cordis 绑定', () => {
  const seen = new Set<string>()
  const pending = ['index.ts']
  const reached: string[] = []
  while (pending.length > 0) {
    const file = pending.pop() ?? ''
    if (seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(join(src, file), 'utf8')
    for (const match of text.matchAll(/from '([^']+)'/g)) {
      const name = match[1] ?? ''
      if (name.startsWith('.')) pending.push(join(file, '..', name))
      else reached.push(name)
    }
  }
  expect(reached.filter(name => name.endsWith('/cordis') || name.includes('cordis'))).toEqual([])
})

it('没有自己的按钮、徽标、提示、输入框这一类基础样式，也没有 --pe- 前缀', () => {
  for (const { path, text } of sources()) {
    expect(text, path).not.toMatch(/--pe-/)
    expect(text, path).not.toMatch(/omne-(button|badge|notice|link|input)\b/)
  }
})
