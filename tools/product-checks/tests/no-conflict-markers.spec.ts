import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectTrackedText, noConflictMarkers } from '../src/rules/no-conflict-markers.ts'

const OURS = `${'<'.repeat(7)} HEAD`
const THEIRS = `${'>'.repeat(7)} 69450e86f`
const check = (text: string, path = 'docs/page.md') => noConflictMarkers.check([{ path, text }])

describe('merge conflict marker lines', () => {
  it('reports each marker line by its line number, in any tracked text file', () => {
    const text = ['# 页', OURS, '一种说法', '=======', '另一种说法', THEIRS, ''].join('\n')
    expect(check(text)).toEqual([
      expect.objectContaining({ rule: 'no-conflict-markers', path: 'docs/page.md', line: 2 }),
      expect.objectContaining({ rule: 'no-conflict-markers', path: 'docs/page.md', line: 6 }),
    ])
    expect(check(`{\n${OURS}\n}`, 'config/data.json')).toHaveLength(1)
    expect(check(`a: 1\n${THEIRS}\n`, 'ops/values.yaml')).toHaveLength(1)
  })

  it('leaves alone what only looks like one: a heading rule, an indented or longer run, no space after', () => {
    const lookalikes = [
      '标题',
      '=======',
      `  ${OURS}`,
      `${'<'.repeat(8)} HEAD`,
      `${'>'.repeat(6)} branch`,
      '<'.repeat(7),
      `${'<'.repeat(7)}HEAD`,
      `text ${THEIRS}`,
    ]
    expect(check(lookalikes.join('\n'))).toEqual([])
  })
})

describe('the tracked text files of a checkout', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })
  const git = (root: string, ...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' })

  it('are the files Git tracks that read as text: untracked and binary ones are not scanned', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'conflict-markers-')))
    roots.push(root)
    git(root, 'init', '-q')
    writeFileSync(join(root, 'page.md'), `${OURS}\n`)
    writeFileSync(join(root, 'notes.txt'), `${THEIRS}\n`)
    writeFileSync(join(root, 'image.bin'), Buffer.from([0x3c, 0x00, 0x3c, 0x0a]))
    writeFileSync(join(root, 'untracked.md'), `${OURS}\n`)
    git(root, 'add', 'page.md', 'notes.txt', 'image.bin')
    const files = collectTrackedText(root)
    expect(files.map(file => file.path).sort()).toEqual(['notes.txt', 'page.md'])
    expect(noConflictMarkers.check(files).map(found => [found.path, found.line])).toEqual([
      ['notes.txt', 1],
      ['page.md', 1],
    ])
  })
})
