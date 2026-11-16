import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runnerRoot, sameTree } from '../src/core/subject.ts'

const made: string[] = []
function directory(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-subject-')))
  made.push(root)
  return root
}
afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('sameTree', () => {
  it('同一个目录：是', () => {
    const root = directory()
    expect(sameTree(root, root)).toBe(true)
  })

  it('其中一个经符号链接给出，解析后是同一个目录：是', () => {
    const root = directory()
    const link = join(directory(), 'link')
    symlinkSync(root, link)
    expect(sameTree(link, root)).toBe(true)
    expect(sameTree(root, link)).toBe(true)
  })

  it('两个不同的目录，哪怕一个在另一个里面：否', () => {
    const root = directory()
    const inner = join(root, 'inner')
    mkdirSync(inner)
    expect(sameTree(inner, root)).toBe(false)
    expect(sameTree(directory(), root)).toBe(false)
  })
})

describe('runnerRoot', () => {
  it('没有 OMNE_RUNNER_ROOT 时 runner 就是被检树自己', () => {
    const root = directory()
    expect(sameTree(runnerRoot({ OMNE_SUBJECT_ROOT: root }), root)).toBe(true)
  })
})
