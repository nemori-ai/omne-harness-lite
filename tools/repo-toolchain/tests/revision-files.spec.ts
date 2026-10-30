// @module-tag slow
// Exact revision reads use temporary Git repositories and real subprocesses.
import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { readRevisionTexts } from '../src/core/revision-files.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

/**
 * 只把内容写进索引，不落工作树：被测的是按提交读，不碰工作树；而换行、制表符、`:`、`*`
 * 这些字符在 Windows 上不能出现在文件名里。
 */
function stage(root: string, path: string, text: string): void {
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: root,
    input: text,
    encoding: 'utf8',
  }).trim()
  // Windows 版 Git 在 core.protectNTFS 下拒收 NTFS 放不下的文件名；POSIX 版不按 Win32 文件名规则查
  // 这些路径。这里只写索引、不落工作树，关掉它不影响被测的读取。
  git(
    root,
    '-c',
    'core.protectNTFS=false',
    'update-index',
    '--add',
    '--cacheinfo',
    `100644,${blob},${path}`,
  )
}

describe('batch revision text reads', () => {
  it('keeps byte framing for Unicode, newlines, tabs, empty and repeated blobs', () => {
    const root = repository()
    const paths = ['目录/一\n\t.ts', 'empty.ts', 'copy.ts', ':(glob)**.ts']
    const text = '自然人🌍\n0123456789 blob 999\n\0end\n'
    stage(root, paths[0]!, text)
    stage(root, paths[1]!, '')
    stage(root, paths[2]!, text)
    stage(root, paths[3]!, 'literal path\n')
    // 直接提交索引：commit() 先 `add -A`，会把工作树里没有的这几项当作删除。
    git(root, 'commit', '-q', '-m', 'byte boundaries')
    const base = git(root, 'rev-parse', 'HEAD')
    expect([...readRevisionTexts(root, base, paths)]).toEqual([
      [paths[0], text],
      [paths[1], ''],
      [paths[2], text],
      [paths[3], 'literal path\n'],
    ])
    expect([...readRevisionTexts(root, base, [paths[0]!, paths[0]!])]).toEqual([[paths[0], text]])
  })

  it('keeps the fixed tree after HEAD and a named anchor advance; missing old paths fail', () => {
    const root = repository()
    write(root, 'src/old.ts', 'before\n')
    const base = commit(root, 'before')
    git(root, 'tag', 'anchor')
    write(root, 'src/old.ts', 'after\n')
    write(root, 'src/new.ts', 'new\n')
    const head = commit(root, 'after')
    git(root, 'tag', '-f', 'anchor', head)
    write(root, 'src/old.ts', 'dirty\n')
    expect(readRevisionTexts(root, base, ['src/old.ts']).get('src/old.ts')).toBe('before\n')
    expect(readRevisionTexts(root, 'anchor', ['src/old.ts']).get('src/old.ts')).toBe('after\n')
    expect(() => readRevisionTexts(root, base, ['src/new.ts'])).toThrow('fixed commit')
    expect(() => readRevisionTexts(root, 'missing-revision', ['src/old.ts'])).toThrow()
  })

  it('rejects non-blob paths and does not start Git for an empty selection', () => {
    const root = repository()
    const head = git(root, 'rev-parse', 'HEAD')
    git(root, 'update-index', '--add', '--cacheinfo', `160000,${head},submodule.ts`)
    git(root, 'commit', '-q', '-m', 'gitlink')
    expect(() => readRevisionTexts(root, 'HEAD', ['submodule.ts'])).toThrow('Not a Git blob')
    expect(readRevisionTexts('/not/a/repository', 'missing', [])).toEqual(new Map())
  })

  it('rejects a lost Git blob even when the current worktree still has the file', () => {
    const root = repository()
    write(root, 'lost.ts', 'export const onlyInThisBlob = 42\n')
    const base = commit(root, 'lost blob')
    const id = git(root, 'rev-parse', `${base}:lost.ts`)
    rmSync(join(root, '.git/objects', id.slice(0, 2), id.slice(2)))
    expect(() => readRevisionTexts(root, base, ['lost.ts'])).toThrow(
      'Cannot read complete Git blob',
    )
  })
})
