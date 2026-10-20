// 对照表的条数：合约定的计数、不合约定的报出位置与原文、文件不存在报没数据；对回全表的三种对不上；
// 以及仓库里真实的 docs/clean-loop.md（存在时）合约定。
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  countCategories,
  crossCheck,
  entryNames,
  parseTables,
  readCatalogue,
} from '../src/loop/catalogue.ts'
import { readLoopConfig } from '../src/loop/config.ts'

const CATALOGUE = [
  '# 对照',
  '',
  '| 归类 | 意思 |',
  '|---|---|',
  '| 传感器 | 有确定性的检查 |',
  '',
  '| 条目 | 归类 | 落点 |',
  '| --- | :---: | --- |',
  '| 小函数 | 传感器 | `pnpm run metrics` |',
  '| 结对 | 评审问法 | 检查表 3 |',
  '| 估算 | 归 人 | 负责人 |',
  '| 含竖线\\|的条目 | 不采 | x |',
  '',
  '```',
  '| 条目 | 归类 |',
  '|---|---|',
  '| 代码块里的 | 乱写 |',
  '```',
].join('\n')

describe('对照表', () => {
  it('解析表：表头、数据行的行号；`\\|` 不切格；代码块里的不算', () => {
    const tables = parseTables(CATALOGUE)
    expect(tables.map(table => table.header)).toEqual([
      ['归类', '意思'],
      ['条目', '归类', '落点'],
    ])
    expect(tables[1]?.rows.map(row => [row.line, row.cells[0]])).toEqual([
      [9, '小函数'],
      [10, '结对'],
      [11, '估算'],
      [12, '含竖线\\|的条目'],
    ])
  })

  it('合约定的按五类计数；不合约定的报出文件、行号与那一格的原文', () => {
    const { counts, invalid } = countCategories('docs/x.md', CATALOGUE)
    expect(counts).toEqual({ 传感器: 2, 评审问法: 1, 归人: 0, 不适用: 0, 不采: 1 })
    expect(invalid).toEqual([{ path: 'docs/x.md', line: 11, cell: '归 人' }])
  })

  it('对回全表按出现次数比：全表里同名两行、对照表也两行不报；对照表少了算缺，多了算多出', () => {
    const doctrine = ['对 agent', '对 agent', '命名']
    expect(crossCheck(doctrine, ['对 agent', '对 agent', '命名'])).toEqual({
      missing: [],
      unknown: [],
      repeated: [],
    })
    expect(crossCheck(doctrine, ['对 agent', '命名'])).toEqual({
      missing: ['对 agent'],
      unknown: [],
      repeated: [],
    })
    expect(crossCheck(doctrine, ['对 agent', '对 agent', '对 agent', '命名']).repeated).toEqual([
      '对 agent',
    ])
  })

  it('对回全表：缺的、多的、重复的分别列出', () => {
    expect(crossCheck(['小函数', '结对', '命名'], ['小函数', '结对', '结对', '估算'])).toEqual({
      missing: ['命名'],
      unknown: ['估算'],
      repeated: ['结对'],
    })
    expect(entryNames(CATALOGUE)).toEqual(['小函数', '结对', '估算', '含竖线\\|的条目'])
  })

  describe('读文件', () => {
    const made: string[] = []
    afterEach(() => {
      for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
    })

    it('对照表不存在：没数据，原因是还没写；全表不存在：对回全表没数据', () => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'loop-catalogue-')))
      made.push(root)
      expect(readCatalogue(root, 'docs/c.md', 'research/d.md')).toEqual({
        categories: { status: 'no-data', reason: '对照表还没写' },
        crossCheck: { status: 'no-data', reason: '对照表还没写' },
      })
      mkdirSync(join(root, 'docs'))
      writeFileSync(join(root, 'docs/c.md'), CATALOGUE)
      const read = readCatalogue(root, 'docs/c.md', 'research/d.md')
      expect(read.categories.status).toBe('data')
      expect(read.crossCheck).toEqual({
        status: 'no-data',
        reason: '条目全表 research/d.md 不存在',
      })
    })
  })

  it('仓库里真实的对照表：没有不合约定的行，五类条数之和大于 0（文件还没写就跳过）', ({ skip }) => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const { path, doctrinePath } = readLoopConfig().sensors.catalogue
    if (statSync(join(root, path), { throwIfNoEntry: false }) === undefined) skip()
    const read = readCatalogue(root, path, doctrinePath)
    if (read.categories.status !== 'data') throw new Error(read.categories.reason)
    const { counts, invalid } = read.categories.data
    expect(invalid).toEqual([])
    expect(CATEGORIES.reduce((sum, name) => sum + counts[name], 0)).toBeGreaterThan(0)
  })
})
