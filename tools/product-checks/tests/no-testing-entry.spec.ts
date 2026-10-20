import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { collectSources, runRules } from '@omne-harness/repo-toolchain/core/scan'
import { afterEach, describe, expect, it } from 'vitest'
import { RULES, rulesForRoot } from '../src/rules/index.ts'
import { collectTestingEntries } from '../src/testing-entries.ts'

const IMPORT = "import { clock } from '@omne-harness/a/testing'\n"
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-testing-entry-')))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}
const manifest = (testing: unknown): string =>
  JSON.stringify({
    name: '@omne-harness/b',
    exports: { '.': './src/index.ts', './testing': testing },
  })
/** 与 CLI 对每个扫描根的做法一致：该根的源码按该根的规则检查。 */
function testingViolations(root: string): string[] {
  return runRules(collectSources(root), rulesForRoot(root))
    .filter(item => item.rule === 'no-testing-import')
    .map(item => `${item.path}:${item.line}`)
}

describe('no-testing-import 与包声明的 ./testing 入口', () => {
  it('声明的入口文件可 import 别包的 ./testing；同包其他文件仍红，含入口自己 import 的辅助文件', () => {
    const root = fixture({
      'packages/b/package.json': manifest({
        source: './src/testing.ts',
        types: './dist/testing.d.ts',
      }),
      'packages/b/src/testing.ts': IMPORT,
      'packages/b/src/testing-helper.ts': IMPORT,
      'packages/b/src/runtime.ts': IMPORT,
    })
    expect(testingViolations(root)).toEqual([
      'packages/b/src/runtime.ts:1',
      'packages/b/src/testing-helper.ts:1',
    ])
  })

  it('字符串形式的 ./testing 导出也算声明', () => {
    const root = fixture({
      'packages/b/package.json': manifest('./src/testing.ts'),
      'packages/b/src/testing.ts': IMPORT,
      'packages/b/src/other.ts': IMPORT,
    })
    expect(testingViolations(root)).toEqual(['packages/b/src/other.ts:1'])
  })

  it('没有 source 时只在 import 指向 .ts 源时采用它，指向构建产物则不豁免', () => {
    const root = fixture({
      'packages/b/package.json': manifest({ import: './src/testing.ts' }),
      'packages/b/src/testing.ts': IMPORT,
      'packages/c/package.json': manifest({
        import: './dist/testing.js',
        types: './dist/testing.d.ts',
      }),
      'packages/c/src/testing.ts': IMPORT,
    })
    expect(testingViolations(root)).toEqual(['packages/c/src/testing.ts:1'])
  })

  it('包没有 ./testing 导出就没有豁免，即使文件叫 testing.ts', () => {
    const root = fixture({
      'packages/b/package.json': JSON.stringify({
        name: '@omne-harness/b',
        exports: { '.': './src/index.ts' },
      }),
      'packages/b/src/testing.ts': IMPORT,
    })
    expect(testingViolations(root)).toEqual(['packages/b/src/testing.ts:1'])
  })

  it('入口只对声明它的包生效：别包同名路径不豁免', () => {
    const root = fixture({
      'packages/b/package.json': manifest({ source: './src/testing.ts' }),
      'packages/b/src/testing.ts': IMPORT,
      'packages/c/package.json': JSON.stringify({ name: '@omne-harness/c' }),
      'packages/c/src/testing.ts': IMPORT,
    })
    expect(testingViolations(root)).toEqual(['packages/c/src/testing.ts:1'])
  })

  it('无法解析的 package.json 被报出，而不是当作没有入口', () => {
    const root = fixture({
      'packages/b/package.json': '{ "exports": ',
      'packages/b/src/testing.ts': IMPORT,
    })
    expect(testingViolations(root)).toEqual([
      'packages/b/package.json:1',
      'packages/b/src/testing.ts:1',
    ])
  })

  it('不读 node_modules、dist 与归档目录里的 package.json', () => {
    const declared = manifest({ source: './src/testing.ts' })
    const root = fixture({
      'packages/node_modules/x/package.json': declared,
      'packages/dist/package.json': declared,
      'packages/old.legacy/package.json': '{ broken',
    })
    expect(collectTestingEntries(root)).toEqual({
      entries: new Set(),
      acceptanceDirectories: new Set(),
      unparsable: [],
    })
  })

  it('入口集合按扫描根各自计算：一个根的声明不豁免另一个根里同一相对路径', () => {
    const declaring = fixture({
      'packages/b/package.json': manifest({ source: './src/testing.ts' }),
      'packages/b/src/testing.ts': IMPORT,
    })
    const other = fixture({ 'packages/b/src/testing.ts': IMPORT })
    expect(testingViolations(declaring)).toEqual([])
    expect(testingViolations(other)).toEqual(['packages/b/src/testing.ts:1'])
  })

  it('默认规则列表不带入口：没有声明时 RULES 里的 no-testing-import 仍只豁免测试路径', () => {
    const file = { path: 'packages/b/src/testing.ts', text: IMPORT }
    const rule = RULES.find(item => item.id === 'no-testing-import')
    expect(rule?.check([file])).toHaveLength(1)
  })
})

describe('no-testing-import 与成员根 acceptance', () => {
  it.each([
    ['packages', 'domain/b'],
    ['apps', 'b'],
    ['.', '.'],
  ])('扫描根 %s 内的成员 %s 直接验收目录及 fixtures 可导入 testing', (scanRoot, member) => {
    const root = fixture({
      [join(scanRoot, member, 'package.json')]: JSON.stringify({ name: '@omne-harness/b' }),
      [join(scanRoot, member, 'acceptance/001.scenario.ts')]: IMPORT,
      [join(scanRoot, member, 'acceptance/fixtures/runtime.ts')]: IMPORT,
      [join(scanRoot, member, 'src/runtime.ts')]: IMPORT,
      [join(scanRoot, member, 'src/acceptance/runtime.ts')]: IMPORT,
      [join(scanRoot, member, 'acceptance-other/runtime.ts')]: IMPORT,
      [join(scanRoot, member, 'acceptance.ts')]: IMPORT,
    })
    expect(testingViolations(join(root, scanRoot))).toEqual(
      [
        'acceptance-other/runtime.ts',
        'acceptance.ts',
        'src/acceptance/runtime.ts',
        'src/runtime.ts',
      ].map(path => `${join(member, path).replaceAll('\\', '/')}:1`),
    )
  })

  it('只按本次扫描根的成员事实豁免，未声明的相邻路径继续拒绝', () => {
    const declaring = fixture({
      'b/package.json': JSON.stringify({ name: '@omne-harness/b' }),
      'b/acceptance/fixtures/runtime.ts': IMPORT,
      'b-other/acceptance/fixtures/runtime.ts': IMPORT,
    })
    const other = fixture({ 'b/acceptance/fixtures/runtime.ts': IMPORT })
    expect(testingViolations(declaring)).toEqual(['b-other/acceptance/fixtures/runtime.ts:1'])
    expect(testingViolations(other)).toEqual(['b/acceptance/fixtures/runtime.ts:1'])
  })

  it.each(['null', '[]', '"member"', '{}', '{"name": 1}', '{"name": ""}'])(
    '无有效成员对象的 manifest %s 不能授予验收豁免',
    text => {
      const root = fixture({
        'b/package.json': text,
        'b/acceptance/fixtures/runtime.ts': IMPORT,
      })
      expect(testingViolations(root)).toEqual(['b/acceptance/fixtures/runtime.ts:1'])
    },
  )

  it('无法解析 manifest 时保留诊断，验收目录也不豁免', () => {
    const root = fixture({
      'b/package.json': '{ broken',
      'b/acceptance/fixtures/runtime.ts': IMPORT,
    })
    expect(testingViolations(root)).toEqual([
      'b/package.json:1',
      'b/acceptance/fixtures/runtime.ts:1',
    ])
  })

  it('默认规则没有扫描根事实，acceptance 路径仍拒绝', () => {
    const rule = RULES.find(item => item.id === 'no-testing-import')
    expect(rule?.check([{ path: 'b/acceptance/fixtures/runtime.ts', text: IMPORT }])).toHaveLength(
      1,
    )
  })
})
