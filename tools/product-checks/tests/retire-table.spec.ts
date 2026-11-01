import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TABLE_PATH,
  isDue,
  parseRetireTable,
  readRetireTable,
  TableError,
  WAVES,
  type RetireItem,
} from '../src/retire/table.ts'

const item = (over: Partial<Record<keyof RetireItem, unknown>> = {}) => ({
  id: 'FX-01',
  category: 'B',
  exports: ['createFixtureDouble'],
  exists: true,
  retireWave: 'A',
  dueBy: 'B',
  ownerKind: 'reduce',
  note: '',
  ...over,
})
const table = (items: unknown[] = [item()], header: Record<string, unknown> = {}) =>
  JSON.stringify({
    source: { file: 'retire.json', sha256: 'a'.repeat(64), ref: 'b'.repeat(40) },
    refreshedAt: 'c'.repeat(40),
    items,
    ...header,
  })

describe('退役表的读取与自检', () => {
  it('合法的表读出每一项的全部字段', () => {
    const parsed = parseRetireTable(table())
    expect(parsed.items).toEqual([item()])
    expect(parsed.source.file).toBe('retire.json')
    expect(parsed.refreshedAt).toBe('c'.repeat(40))
  })

  it('C 类与 none 类可以没有到期波次与负责人', () => {
    const parsed = parseRetireTable(
      table([
        item({ id: 'FX-C', category: 'C', retireWave: null, dueBy: null, ownerKind: null }),
        item({
          id: 'FX-N',
          category: 'none',
          exports: [],
          exists: false,
          retireWave: null,
          dueBy: null,
          ownerKind: null,
        }),
      ]),
    )
    expect(parsed.items.map(entry => entry.dueBy)).toEqual([null, null])
  })

  const broken: [string, string, RegExp][] = [
    ['不是 JSON', '{not json', /JSON/u],
    ['顶层不是对象', '[]', /顶层/u],
    ['没有来源头部', JSON.stringify({ items: [item()] }), /source/u],
    [
      '来源 SHA256 不是 64 位十六进制',
      table([item()], { source: { file: 'x', sha256: 'zz', ref: 'b'.repeat(40) } }),
      /sha256/u,
    ],
    ['没有刷新提交', table([item()], { refreshedAt: undefined }), /refreshedAt/u],
    ['没有任何项', table([]), /items/u],
    ['缺字段', table([{ ...item(), exports: undefined }]), /FX-01.*exports/u],
    ['类别非法', table([item({ category: 'Z' })]), /category/u],
    ['exports 里有空串', table([item({ exports: [''] })]), /exports/u],
    ['retireWave 非法', table([item({ retireWave: 'E' })]), /retireWave/u],
    ['dueBy 非法', table([item({ dueBy: 'F' })]), /dueBy/u],
    ['dueBy 不是字符串也不是 null', table([item({ dueBy: 3 })]), /dueBy/u],
    ['ownerKind 非法', table([item({ ownerKind: 'nobody' })]), /ownerKind/u],
    ['C 类却有到期波次', table([item({ category: 'C' })]), /不到期/u],
    ['id 重复', table([item(), item()]), /重复/u],
  ]
  it.each(broken)('坏表被拒绝并说明原因：%s', (_name, text, message) => {
    expect(() => parseRetireTable(text)).toThrow(TableError)
    expect(() => parseRetireTable(text)).toThrow(message)
  })

  it('表文件缺失时抛 TableError，不返回空表', () => {
    expect(() => readRetireTable('Z:/no/such/retire-doubles.json')).toThrow(TableError)
  })

  it('isDue 按放行波次的先后判定到期，没有 dueBy 的项永不到期', () => {
    const parsed = parseRetireTable(table([item({ dueBy: 'C' })]))
    const [only] = parsed.items
    expect(WAVES).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(only && ['A', 'B', 'C', 'D', 'E'].map(wave => isDue(only, wave as never))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ])
    const never = parseRetireTable(
      table([item({ category: 'C', retireWave: null, dueBy: null, ownerKind: null })]),
    ).items[0]
    expect(never && isDue(never, 'E')).toBe(false)
  })
})

describe('仓库里的退役表副本', () => {
  const NEXT: Record<string, string> = { A: 'B', B: 'C', C: 'D', D: 'E' }
  const real = readRetireTable(DEFAULT_TABLE_PATH)
  const raw = readFileSync(
    fileURLToPath(new URL('../retire-doubles.json', import.meta.url)),
    'utf8',
  )

  it('头部记录来源文件、来源 SHA256 与刷新所用的提交', () => {
    expect(real.source.file).toBe('retire.json')
    expect(real.source.sha256).toBe(
      '800071d18d9dabad0e42f69947eda5789bb21473f022cd30aa11a7c7a7d48f5b',
    )
    expect(real.source.ref).toMatch(/^[0-9a-f]{40}$/u)
    expect(real.refreshedAt).toMatch(/^[0-9a-f]{40}$/u)
  })

  it('42 项齐全：含 none 类与尚无替身的项，id 不重复', () => {
    expect(real.items).toHaveLength(42)
    expect(new Set(real.items.map(entry => entry.id)).size).toBe(42)
    const count = (category: string) => real.items.filter(i => i.category === category).length
    expect([count('A'), count('B'), count('C'), count('none')]).toEqual([2, 34, 3, 3])
    expect(real.items.some(entry => entry.category === 'none')).toBe(true)
    expect(real.items.some(entry => !entry.exists)).toBe(true)
  })

  it('dueBy 按到期规则写明：line 同波，reduce 下一波，D 之后写 E，C 与 none 不到期', () => {
    for (const entry of real.items) {
      if (entry.category === 'C' || entry.category === 'none' || entry.retireWave === null) {
        expect([entry.id, entry.dueBy]).toEqual([entry.id, null])
      } else {
        const expected = entry.ownerKind === 'line' ? entry.retireWave : NEXT[entry.retireWave]
        expect([entry.id, entry.dueBy]).toEqual([entry.id, expected])
      }
    }
  })

  it('文件以换行结尾且没有 CRLF', () => {
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw.includes('\r')).toBe(false)
  })
})
