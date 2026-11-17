import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { longestFirst, memberHistory } from '../src/testing/member-history.ts'

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

type Row = { member: string; wallSeconds: number; files: number; exitCode: number }

function home(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'member-history-')))
  homes.push(dir)
  return dir
}

function ledger(root: string, run: string, age: number, members: Row[] | string): void {
  const dir = join(root, 'abc123def', run)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'ledger.json')
  writeFileSync(path, typeof members === 'string' ? members : JSON.stringify({ members }))
  const at = new Date(Date.now() - age * 1000)
  utimesSync(path, at, at)
}

describe('成员上一次的读数', () => {
  it('取这一层最近一次通过的运行里的用时与文件数；别的层、失败的运行不算', () => {
    const root = home()
    ledger(root, '20261116-100000-fast', 300, [
      { member: 'packages/a', wallSeconds: 40, files: 9, exitCode: 0 },
      { member: 'packages/b', wallSeconds: 5, files: 2, exitCode: 0 },
    ])
    ledger(root, '20261116-110000-fast', 100, [
      { member: 'packages/a', wallSeconds: 55, files: 11, exitCode: 0 },
      { member: 'packages/b', wallSeconds: 99, files: 3, exitCode: 1 },
    ])
    ledger(root, '20261116-120000-slow', 10, [
      { member: 'packages/a', wallSeconds: 900, files: 1, exitCode: 0 },
    ])
    ledger(root, '20261116-130000', 5, [
      { member: 'packages/a', wallSeconds: 7, files: 1, exitCode: 0 },
    ])
    expect(Object.fromEntries(memberHistory(root, 'fast'))).toEqual({
      'packages/a': { seconds: 55, files: 11 },
      'packages/b': { seconds: 5, files: 2 },
    })
    expect(Object.fromEntries(memberHistory(root, 'slow'))).toEqual({
      'packages/a': { seconds: 900, files: 1 },
    })
    expect(Object.fromEntries(memberHistory(root, 'all'))).toEqual({
      'packages/a': { seconds: 7, files: 1 },
    })
  })

  it('读不出的账本、没有账本的运行目录、不认得的目录名都跳过；账本目录不在时是空表', () => {
    const root = home()
    ledger(root, '20261116-100000-fast', 50, '{ not json')
    ledger(root, 'scratch', 40, [{ member: 'packages/x', wallSeconds: 1, files: 1, exitCode: 0 }])
    mkdirSync(join(root, 'abc123def', '20261116-110000-fast'), { recursive: true })
    ledger(root, '20261116-090000-fast', 500, [
      { member: 'packages/a', wallSeconds: 3, files: 1, exitCode: 0 },
    ])
    expect(Object.fromEntries(memberHistory(root, 'fast'))).toEqual({
      'packages/a': { seconds: 3, files: 1 },
    })
    expect(memberHistory(join(root, 'missing'), 'fast').size).toBe(0)
  })

  it('只翻最近的二十份账本', () => {
    const root = home()
    ledger(root, '20261101-000000-fast', 10_000, [
      { member: 'packages/old', wallSeconds: 1, files: 1, exitCode: 0 },
    ])
    for (let index = 0; index < 20; index += 1)
      ledger(root, `202611${String(index + 2).padStart(2, '0')}-000000-fast`, 100 - index, [
        { member: 'packages/new', wallSeconds: index, files: 1, exitCode: 0 },
      ])
    expect([...memberHistory(root, 'fast').keys()]).toEqual(['packages/new'])
  })

  it('排队次序：上一次用时长的在前，没有读数的排最前，同样长的保持原次序', () => {
    const history = new Map([
      ['packages/short', { seconds: 2, files: 1 }],
      ['packages/long', { seconds: 90, files: 1 }],
      ['packages/same', { seconds: 2, files: 1 }],
    ])
    const members = ['packages/short', 'packages/same', 'packages/new', 'packages/long'].map(
      path => ({ path }),
    )
    expect(longestFirst(members, history).map(member => member.path)).toEqual([
      'packages/new',
      'packages/long',
      'packages/short',
      'packages/same',
    ])
  })
})
