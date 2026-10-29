// 被检树是不是运行检查器的仓库自己：解析符号链接后比较，OMNE_RUNNER_ROOT 缺省时就是同一棵树。
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { subjectIsRunner } from '../src/core/subject.ts'

const made: string[] = []
function directory(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-subject-')))
  made.push(root)
  return root
}
afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('subjectIsRunner', () => {
  it('runner 与被检树是同一个目录：是', () => {
    const root = directory()
    expect(subjectIsRunner(root, { OMNE_RUNNER_ROOT: root })).toBe(true)
  })

  it('其中一个经符号链接给出，解析后是同一个目录：是', () => {
    const root = directory()
    const link = join(directory(), 'link')
    symlinkSync(root, link)
    expect(subjectIsRunner(link, { OMNE_RUNNER_ROOT: root })).toBe(true)
    expect(subjectIsRunner(root, { OMNE_RUNNER_ROOT: link })).toBe(true)
  })

  it('两个不同的目录，哪怕一个在另一个里面：否', () => {
    const root = directory()
    const inner = join(root, 'inner')
    mkdirSync(inner)
    expect(subjectIsRunner(inner, { OMNE_RUNNER_ROOT: root })).toBe(false)
    expect(subjectIsRunner(directory(), { OMNE_RUNNER_ROOT: root })).toBe(false)
  })

  it('没有 OMNE_RUNNER_ROOT 时 runner 就是被检树自己：是', () => {
    const root = directory()
    expect(subjectIsRunner(root, { OMNE_SUBJECT_ROOT: root })).toBe(true)
  })
})
