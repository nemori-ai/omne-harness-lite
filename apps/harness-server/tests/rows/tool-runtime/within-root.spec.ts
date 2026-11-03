// 执行环境守卫与对象命名共用的文件根判定：根内（含根本身）为真；`..` 逃逸、根外绝对路径、以根为前缀的兄弟目录为假。
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withinRoot } from '../../../src/rows/tool-runtime/environment.ts'

const ROOT = resolve('/tool-b-files')

describe('the files root of the release execution environment', () => {
  it('accepts the root itself, a path inside it, and a relative path resolved against it', () => {
    expect(withinRoot(ROOT, ROOT)).toBe(true)
    expect(withinRoot(ROOT, join(ROOT, 'a', 'b.txt'))).toBe(true)
    expect(withinRoot(ROOT, 'a/b.txt')).toBe(true)
  })

  it('refuses a parent escape, an absolute path outside, and a sibling that shares the prefix', () => {
    expect(withinRoot(ROOT, '..')).toBe(false)
    expect(withinRoot(ROOT, join(ROOT, '..', 'outside.txt'))).toBe(false)
    expect(withinRoot(ROOT, 'a/../../outside.txt')).toBe(false)
    expect(withinRoot(ROOT, resolve('/elsewhere/x.txt'))).toBe(false)
    expect(withinRoot(ROOT, `${ROOT}2${'/x.txt'}`)).toBe(false)
  })
})
