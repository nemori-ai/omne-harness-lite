// 执行环境守卫与对象命名共用的文件根判定：根内（含根本身）为真；`..` 逃逸、根外绝对路径、以根为前缀的兄弟目录为假。
// 守卫按请求核对每个路径值（L3 评审 N4）：cwd、`path`、`move`/`copy` 的 `target.path`、`commitBatch` 的 `entries[].path`。
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { confinedToRoot, withinRoot } from '../../../src/rows/tool-runtime/environment.ts'

const ROOT = resolve('/tool-b-files')

describe('the files root of the release execution environment', () => {
  it('accepts the root itself, a path inside it, and a relative path resolved against it', async () => {
    expect(withinRoot(ROOT, ROOT)).toBe(true)
    expect(withinRoot(ROOT, join(ROOT, 'a', 'b.txt'))).toBe(true)
    expect(withinRoot(ROOT, 'a/b.txt')).toBe(true)
  })

  it('refuses a parent escape, an absolute path outside, and a sibling that shares the prefix', async () => {
    expect(withinRoot(ROOT, '..')).toBe(false)
    expect(withinRoot(ROOT, join(ROOT, '..', 'outside.txt'))).toBe(false)
    expect(withinRoot(ROOT, 'a/../../outside.txt')).toBe(false)
    expect(withinRoot(ROOT, resolve('/elsewhere/x.txt'))).toBe(false)
    expect(withinRoot(ROOT, `${ROOT}2${'/x.txt'}`)).toBe(false)
  })
})

describe('the guard checks every path of a facility request (N4)', () => {
  const inside = join(ROOT, 'in.txt')
  const outside = resolve('/elsewhere/out.txt')

  it('move and copy: the target path must be inside the root too', async () => {
    expect(await confinedToRoot(ROOT, 'files', { path: inside, target: { path: inside } })).toBe(
      true,
    )
    expect(await confinedToRoot(ROOT, 'files', { path: inside, target: { path: outside } })).toBe(
      false,
    )
    expect(await confinedToRoot(ROOT, 'files', { path: inside, target: { named: null } })).toBe(
      false,
    )
    expect(await confinedToRoot(ROOT, 'files', { path: inside, target: 'x' })).toBe(false)
  })

  it('commitBatch: every entry path must be inside the root', async () => {
    const entry = (path: unknown) => ({ path, named: null })
    expect(await confinedToRoot(ROOT, 'files', { entries: [entry(inside), entry(inside)] })).toBe(
      true,
    )
    expect(await confinedToRoot(ROOT, 'files', { entries: [entry(inside), entry(outside)] })).toBe(
      false,
    )
    expect(await confinedToRoot(ROOT, 'files', { entries: [entry(inside), 'x'] })).toBe(false)
    expect(await confinedToRoot(ROOT, 'files', { entries: { path: inside } })).toBe(false)
  })

  it('cwd for every facility; a path outside the root for files', async () => {
    expect(await confinedToRoot(ROOT, 'command', { cwd: ROOT })).toBe(true)
    expect(await confinedToRoot(ROOT, 'command', { cwd: outside })).toBe(false)
    expect(await confinedToRoot(ROOT, 'files', { path: outside })).toBe(false)
    expect(await confinedToRoot(ROOT, 'files', { path: 7 })).toBe(false)
  })
})
