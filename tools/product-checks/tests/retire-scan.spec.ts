import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanRetire, type ScanResult } from '../src/retire/scan.ts'
import { renderText } from '../src/retire/render.ts'
import { parseRetireTable, type Wave } from '../src/retire/table.ts'

const made: string[] = []
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
})

/** 在临时目录里 git init 一个小仓库，文件全部提交；git grep 是真实的。 */
function repository(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'retire-scan-')))
  made.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: root,
      encoding: 'utf8',
    })
    if (result.status !== 0) throw new Error(result.stderr)
  }
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'fixture')
  return root
}

const manifest = (name: string) =>
  JSON.stringify({
    name,
    exports: {
      './testing': { source: './src/testing/index.ts', import: './dist/testing/index.js' },
    },
  })

const row = (over: Record<string, unknown>) => ({
  id: 'FX-01',
  category: 'B',
  exports: ['createDoubleOne'],
  exists: true,
  retireWave: 'A',
  dueBy: 'B',
  ownerKind: 'reduce',
  note: '',
  ...over,
})
const tableOf = (...items: unknown[]) =>
  parseRetireTable(
    JSON.stringify({
      source: { file: 'retire.json', sha256: 'a'.repeat(64), ref: 'b'.repeat(40) },
      refreshedAt: 'c'.repeat(40),
      items,
    }),
  )
const scan = (root: string, wave: Wave, ...items: unknown[]): ScanResult =>
  scanRetire({ root, wave, table: tableOf(...items) })

/** 一个有 createDoubleOne 的成员：定义在 one.ts（第 2 行），经 testing/index.ts 导出。 */
const BASE = {
  'packages/alpha/package.json': manifest('@fx/alpha'),
  'packages/alpha/src/testing/index.ts': "export { createDoubleOne } from './one.ts'\n",
  'packages/alpha/src/testing/one.ts':
    '// 替身\nexport function createDoubleOne() {\n  return 1\n}\n',
}

describe('应删未删', () => {
  it('已到期的 B 类替身导出仍在 ./testing：报告 id、导出名、定义文件与行号', () => {
    const result = scan(repository(BASE), 'B', row({}))
    expect(result.findings).toEqual([
      expect.objectContaining({
        kind: 'overdue',
        id: 'FX-01',
        name: 'createDoubleOne',
        path: 'packages/alpha/src/testing/one.ts',
        line: 2,
      }),
    ])
    expect(renderText(result)).toContain('createDoubleOne')
    expect(renderText(result)).toContain('packages/alpha/src/testing/one.ts:2')
  })

  it('未到期的同类替身不报', () => {
    const result = scan(repository(BASE), 'A', row({}))
    expect(result.findings).toEqual([])
  })

  it('放行波次往后，到期过的项仍然到期', () => {
    expect(scan(repository(BASE), 'E', row({})).findings.map(f => f.kind)).toEqual(['overdue'])
  })

  it('C 类与 none 类没有 dueBy，不会应删', () => {
    const result = scan(
      repository(BASE),
      'E',
      row({ category: 'C', retireWave: null, dueBy: null, ownerKind: null }),
    )
    expect(result.findings).toEqual([])
  })
})

describe('已退役仍被引用', () => {
  const GONE = {
    'packages/alpha/package.json': manifest('@fx/alpha'),
    'packages/alpha/src/testing/index.ts': 'export const other = 1\n',
    'packages/alpha/tests/uses.spec.ts':
      "import { createDoubleOne } from '../src/testing/index.ts'\nexport const x = createDoubleOne()\n",
    'packages/alpha/src/product.ts': 'export const y = 2\n',
  }

  it('名字已从 ./testing 删除而测试仍在引用：每个文件报首次出现的行与处数，不报应删', () => {
    const result = scan(repository(GONE), 'B', row({}))
    expect(result.stale).toEqual([])
    expect(result.findings).toEqual([
      expect.objectContaining({
        kind: 'retired-referenced',
        path: 'packages/alpha/tests/uses.spec.ts',
        line: 1,
        detail: '该文件共 2 处',
      }),
    ])
  })

  it('产品源码里的悬空引用同样报告', () => {
    const result = scan(
      repository({ ...GONE, 'packages/alpha/src/product.ts': 'const z = createDoubleOne\n' }),
      'B',
      row({}),
    )
    expect(result.findings.map(f => f.path)).toContain('packages/alpha/src/product.ts')
  })

  it('定义文件与导出它的入口自身的引用不算：只报定义和外部引用', () => {
    const files = {
      ...BASE,
      'packages/alpha/src/testing/one.ts':
        'export function createDoubleOne() {\n  return createDoubleOne.name\n}\n',
      'packages/alpha/tests/uses.spec.ts':
        "import { createDoubleOne } from '../src/testing/index.ts'\n",
    }
    const result = scan(repository(files), 'B', row({}))
    expect(result.findings.map(f => [f.kind, f.path])).toEqual([
      ['overdue', 'packages/alpha/src/testing/one.ts'],
      ['retired-referenced', 'packages/alpha/tests/uses.spec.ts'],
    ])
  })

  it('测试文件里的同名局部声明不算定义：名字仍按已删处理', () => {
    const result = scan(
      repository({
        ...GONE,
        'packages/alpha/tests/uses.spec.ts':
          'function createDoubleOne() {}\nexport const x = createDoubleOne()\n',
      }),
      'B',
      row({}),
    )
    expect(result.findings.map(f => f.kind)).toEqual(['retired-referenced'])
  })

  it('名字没有定义也没有引用的到期项是干净退役：既无发现也不算过期', () => {
    const result = scan(
      repository({ ...GONE, 'packages/alpha/tests/uses.spec.ts': '' }),
      'B',
      row({}),
    )
    expect(result.findings).toEqual([])
    expect(result.stale).toEqual([])
  })

  it('只按完整标识符匹配：前后缀相同的名字不算引用，同一行点名多个名字时也不串', () => {
    const files = {
      ...GONE,
      'packages/alpha/src/testing/index.ts':
        'export const createDoubleOneMore = 1\nexport const createDoubleOneSibling = 2\n',
      'packages/alpha/tests/uses.spec.ts':
        'export const a = createDoubleOneMore + xcreateDoubleOne\nexport const b = createDoubleOneSibling\n',
    }
    const result = scan(
      repository(files),
      'B',
      row({ id: 'FX-ONE' }),
      row({ id: 'FX-MORE', exports: ['createDoubleOneMore'] }),
    )
    const refs = result.findings.filter(f => f.kind === 'retired-referenced')
    expect(refs.map(f => [f.id, f.name, f.line])).toEqual([['FX-MORE', 'createDoubleOneMore', 1]])
  })
})

describe('误接装配', () => {
  const WIRED = {
    ...BASE,
    'packages/alpha/tests/uses.spec.ts':
      "import { createDoubleOne } from '../src/testing/index.ts'\n",
    'packages/alpha/src/testing/helper.ts': 'export const h = createDoubleOne()\n',
  }
  const kinds = (result: ScanResult) => result.findings.map(f => [f.kind, f.path, f.line])

  it('只出现在测试与 src/testing/ 里的 B、C 类名字不报', () => {
    expect(kinds(scan(repository(WIRED), 'A', row({})))).toEqual([])
    expect(
      kinds(
        scan(
          repository(WIRED),
          'E',
          row({ category: 'C', dueBy: null, retireWave: null, ownerKind: null }),
        ),
      ),
    ).toEqual([])
  })

  it('packages 产品源码引用 B 类名字：报告文件与行号，不要求到期', () => {
    const files = { ...WIRED, 'packages/beta/src/wire.ts': '\nexport const w = createDoubleOne\n' }
    expect(kinds(scan(repository(files), 'A', row({})))).toEqual([
      ['misassembled', 'packages/beta/src/wire.ts', 2],
    ])
  })

  it('apps 产品源码引用 C 类名字同样报告', () => {
    const files = { ...WIRED, 'apps/host/src/main.ts': 'export const w = createDoubleOne\n' }
    const result = scan(
      repository(files),
      'A',
      row({ category: 'C', dueBy: null, retireWave: null, ownerKind: null }),
    )
    expect(kinds(result)).toEqual([['misassembled', 'apps/host/src/main.ts', 1]])
  })

  it('src 下的 testing.ts 与 testing-*.ts 属于测试设施，不报；非 src 的目录与 A 类不查', () => {
    const files = {
      ...WIRED,
      'packages/beta/src/testing.ts': 'export const a = createDoubleOne\n',
      'packages/beta/src/testing-more.ts': 'export const b = createDoubleOne\n',
      'packages/beta/scripts/tool.ts': 'export const c = createDoubleOne\n',
    }
    expect(kinds(scan(repository(files), 'A', row({})))).toEqual([])
    const wired = { ...WIRED, 'packages/beta/src/wire.ts': 'export const w = createDoubleOne\n' }
    expect(
      kinds(scan(repository(wired), 'A', row({ category: 'A', exports: ['createDoubleOne'] }))),
    ).toEqual([])
  })

  it('src 下的测试文件不算产品源码', () => {
    const files = {
      ...WIRED,
      'packages/beta/src/wire.spec.ts': 'export const w = createDoubleOne\n',
    }
    expect(kinds(scan(repository(files), 'A', row({})))).toEqual([])
  })
})

describe('表自检：未知不报成功', () => {
  it('表里的导出名找不到定义，且项尚未到期：报表过期', () => {
    const result = scan(repository(BASE), 'A', row({ exports: ['createDoubleOne', 'renamedAway'] }))
    expect(result.stale).toEqual([{ id: 'FX-01', name: 'renamedAway' }])
    expect(renderText(result)).toContain('表过期')
  })

  it('C 类导出名找不到定义同样过期，不论波次', () => {
    const result = scan(
      repository(BASE),
      'E',
      row({ category: 'C', exports: ['nowhere'], dueBy: null, retireWave: null, ownerKind: null }),
    )
    expect(result.stale).toEqual([{ id: 'FX-01', name: 'nowhere' }])
  })

  it('已存在却没有导出名的 B、C 类项进未映射；尚不存在、A 类与 none 类不进', () => {
    const result = scan(
      repository(BASE),
      'A',
      row({ id: 'U-B', exports: [], exists: true }),
      row({
        id: 'U-C',
        category: 'C',
        exports: [],
        exists: true,
        dueBy: null,
        retireWave: null,
        ownerKind: null,
      }),
      row({ id: 'U-NEW', exports: [], exists: false }),
      row({ id: 'U-A', category: 'A', exports: [], exists: true }),
      row({
        id: 'U-N',
        category: 'none',
        exports: [],
        exists: true,
        dueBy: null,
        retireWave: null,
        ownerKind: null,
      }),
    )
    expect(result.unmapped).toEqual([
      { id: 'U-B', category: 'B' },
      { id: 'U-C', category: 'C' },
    ])
    expect(renderText(result)).toContain('未映射')
  })

  it('导出名在 ./testing 里没有、却由非测试源码的顶层声明定义：算有定义', () => {
    const files = {
      ...BASE,
      'packages/alpha/src/legacy.ts': 'export const keptElsewhere = 1\n',
    }
    const result = scan(repository(files), 'A', row({ exports: ['keptElsewhere'] }))
    expect(result.stale).toEqual([])
  })
})

describe('清点表', () => {
  const FILES = {
    'packages/alpha/package.json': manifest('@fx/alpha'),
    'packages/alpha/src/testing/index.ts':
      "export { createDoubleOne, createOutside } from './impl.ts'\nexport * from './extra.ts'\n",
    'packages/alpha/src/testing/impl.ts':
      'export function createDoubleOne() {}\nexport function createOutside() {}\n',
    'packages/alpha/src/testing/extra.ts': 'export const unusedExport = 1\n',
    'packages/alpha/tests/one.spec.ts': 'createDoubleOne()\ncreateOutside()\n',
    'packages/alpha/tests/two.spec.ts': 'createOutside()\n',
    'packages/beta/src/wire.ts': 'createDoubleOne()\ncreateDoubleOne()\n',
    'packages/gamma/package.json': JSON.stringify({ name: '@fx/gamma' }),
  }

  it('列出声明了 ./testing 入口的成员、导出名与测试、产品源码引用文件数', () => {
    const result = scan(repository(FILES), 'A', row({}))
    expect(result.inventory).toHaveLength(1)
    const [member] = result.inventory
    expect(member?.member).toBe('packages/alpha')
    expect(member?.entry).toBe('packages/alpha/src/testing/index.ts')
    expect(member?.exports).toEqual([
      { name: 'createDoubleOne', inTable: true, ids: ['FX-01'], testFiles: 1, productFiles: 1 },
      { name: 'createOutside', inTable: false, ids: [], testFiles: 2, productFiles: 0 },
      { name: 'unusedExport', inTable: false, ids: [], testFiles: 0, productFiles: 0 },
    ])
  })

  it('表外的导出单列，不产生任何发现', () => {
    const result = scan(repository(FILES), 'A', row({}))
    expect(new Set(result.findings.map(f => f.kind))).toEqual(new Set(['misassembled']))
    expect(result.findings.every(f => f.name === 'createDoubleOne')).toBe(true)
    expect(renderText(result)).toMatch(/表外/u)
  })

  it('没有任何 ./testing 入口时清点表为空，不是错误', () => {
    const result = scan(
      repository({ 'packages/gamma/package.json': '{"name":"@fx/gamma"}' }),
      'A',
      row({ exports: [], exists: false }),
    )
    expect(result.inventory).toEqual([])
  })

  it('入口经 export * 与重命名导出的值都被解析，纯类型不进清点表', () => {
    const files = {
      'packages/alpha/package.json': manifest('@fx/alpha'),
      'packages/alpha/src/testing/index.ts':
        "export { original as renamed } from './impl.ts'\nexport * from './all.ts'\n",
      'packages/alpha/src/testing/impl.ts': 'export const original = 1\n',
      'packages/alpha/src/testing/all.ts':
        'export const fromStar = 1\nexport type FromType = number\n',
    }
    const names = scan(
      repository(files),
      'A',
      row({ exports: [], exists: false }),
    ).inventory[0]?.exports.map(e => e.name)
    expect(names).toEqual(['fromStar', 'renamed'])
  })
})
