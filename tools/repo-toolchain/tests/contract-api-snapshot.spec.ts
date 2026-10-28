import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { renderSnapshot, type ApiSnapshot } from '../src/declarations/api-format.ts'
import { snapshotContracts } from '../src/declarations/api-snapshot.ts'
import {
  checkSnapshots,
  parseContractApiConfig,
  parseContractMembers,
  renderCheck,
  writeSnapshots,
} from '../src/declarations/contract-api.ts'
import {
  CONFIG,
  contractCheckout,
  membersOf,
  setDist,
  snapshotOf,
} from './fixtures/contract-api.ts'
import { removeTemporaries } from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const SHAPES = {
  'index.d.ts': [
    "export { area, type Shape } from './shape.ts';",
    "export { Registry as ShapeRegistry } from './registry.ts';",
    "export type { Unit } from './unit.ts';",
    "export type { Id } from '@fixture/base';",
    "import './augment.ts';",
  ].join('\n'),
  'shape.d.ts': [
    '/** A shape. */',
    'export interface Shape {',
    '    readonly side: number;   // trailing comment',
    '    readonly box: Box;',
    '}',
    'interface Box { readonly width: number }',
    'export declare function area(shape: Shape): number;',
    'export declare function area(shape: Shape, unit: string): number;',
  ].join('\n'),
  'registry.d.ts':
    'export declare class Registry {\n  private items;\n  add(shape: unknown): void;\n}\n',
  'unit.d.ts': "export declare const Unit: { readonly metre: 'm' };\nexport type Unit = 'm';\n",
  'facility.d.ts': 'export interface Facilities {\n}\n',
  'augment.d.ts': [
    "declare module './facility.ts' {",
    '    interface Facilities { files: string }',
    '}',
    "declare module '@fixture/base' {",
    '    interface Blocks { shape: number }',
    '}',
    'export {};',
  ].join('\n'),
}

const BASE = {
  name: '@fixture/base',
  exports: { '.': 'index.d.ts' },
  dist: { 'index.d.ts': 'export type Id = string;\nexport interface Blocks {\n}\n' },
}

const MEMBERS = ['packages/x/base', 'packages/x/shapes']

function shapesCheckout(): string {
  return contractCheckout({
    'packages/x/shapes': { name: '@fixture/shapes', exports: { '.': 'index.d.ts' }, dist: SHAPES },
    'packages/x/base': BASE,
  })
}

function texts(root: string, directories: readonly string[]): Map<string, string> {
  return new Map(
    snapshotContracts(root, membersOf(root, directories)).results.flatMap(result =>
      result.kind === 'snapshot' ? [[result.directory, renderSnapshot(result.snapshot)]] : [],
    ),
  )
}

const exportsOf = (snapshot: ApiSnapshot, subpath = '.') =>
  snapshot.entries.find(entry => entry.subpath === subpath)?.exports ?? []

// Each case builds a real TypeScript 6 program over the fixture dist, which takes about a second.
describe('contract API snapshots', { timeout: 60_000 }, () => {
  // Slow: builds a real TypeScript 6 program over the fixture dist. 1.8 s on the full-admission fast-tier ledger, 4.4 s under load, which is over the 2.5 s per-case budget (tools/test-runner/README_ZH.md「归层」).
  it(
    'lists the exports of each entry and every declaration file of the dist, normalized',
    { tags: ['slow'] },
    () => {
      const root = shapesCheckout()
      const shapes = texts(root, MEMBERS).get('packages/x/shapes') ?? ''
      expect(shapes.match(/^- .*$/gmu)).toEqual([
        '- `Id` · 包 `@fixture/base`',
        '- `Shape` · `shape.d.ts`',
        '- `ShapeRegistry` = `Registry` · `registry.d.ts`',
        '- `Unit` 仅类型 · `unit.d.ts`',
        '- `area` · `shape.d.ts`',
      ])
      // Every declaration file, also one reached only as an augmentation target; comments and layout removed.
      expect(shapes.match(/^## 声明文件 .*$/gmu)).toEqual([
        '## 声明文件 `augment.d.ts`',
        '## 声明文件 `facility.d.ts`',
        '## 声明文件 `index.d.ts`',
        '## 声明文件 `registry.d.ts`',
        '## 声明文件 `shape.d.ts`',
        '## 声明文件 `unit.d.ts`',
      ])
      expect(shapes).not.toContain('comment')
      expect(shapes).not.toContain('A shape')
      expect(shapes).toContain(
        'export interface Shape {\n    readonly side: number;\n    readonly box: Box;\n}\ninterface Box {\n    readonly width: number;\n}',
      )
      expect(shapes).toContain(
        "declare module './facility.ts' {\n    interface Facilities {\n        files: string;\n    }\n}",
      )
      // The augmenting member's interface does not leak into the augmented member's snapshot.
      const base = texts(root, MEMBERS).get('packages/x/base') ?? ''
      expect(base).toContain('export interface Blocks {\n}')
      expect(base).not.toContain('shape: number')
    },
  )

  // Slow: builds real TypeScript 6 programs over two fixture dists. 1.7 s on the full-admission fast-tier ledger, 6.0 s under load, which is over the 2.5 s per-case budget (tools/test-runner/README_ZH.md「归层」).
  it(
    'gives byte-identical output for the same dist, and ignores comments and member order',
    { tags: ['slow'] },
    () => {
      const root = shapesCheckout()
      expect(texts(root, [...MEMBERS].reverse())).toEqual(texts(root, MEMBERS))
      const plain = snapshotOf({
        'index.d.ts': 'export interface A {\n    b: string;\n    c?: number;\n}\n',
      })
      const noisy = snapshotOf({
        'index.d.ts': '/** doc */\nexport interface A {\n  // note\n  b: string\n  c?: number\n}\n',
      })
      expect(renderSnapshot(noisy)).toBe(renderSnapshot(plain))
    },
  )

  it('marks values that only arrive through export type * as type-only, several stars deep', () => {
    const snapshot = snapshotOf({
      'index.d.ts': "export * from './mid.ts';\nexport * from './plain.ts';\n",
      'mid.d.ts': "export type * from './a.ts';\n",
      'a.d.ts':
        'export declare class Foo {\n    x: string;\n}\nexport declare const bar: number;\n',
      'plain.d.ts': 'export declare const baz: number;\n',
    })
    expect(exportsOf(snapshot).map(item => [item.name, item.typeOnly])).toEqual([
      ['Foo', true],
      ['bar', true],
      ['baz', false],
    ])
  })

  it('lists export * as ns and its members', () => {
    const snapshot = snapshotOf({
      'index.d.ts': "export * as ns from './a.ts';\n",
      'a.d.ts': 'export interface A { a: string }\nexport type B = 1;\n',
    })
    expect(exportsOf(snapshot).map(item => [item.name, item.origin])).toEqual([
      ['ns', { kind: 'namespace', path: 'a.d.ts' }],
      ['ns.A', { kind: 'file', path: 'a.d.ts' }],
      ['ns.B', { kind: 'file', path: 'a.d.ts' }],
    ])
  })

  it('does not snapshot a member whose dist has compile diagnostics, such as an unresolved re-export', () => {
    const root = contractCheckout({
      'packages/x/a': {
        name: '@fixture/a',
        exports: { '.': 'index.d.ts' },
        dist: { 'index.d.ts': "export { Id } from '@fixture/notbuilt';\nexport type Own = 1;\n" },
      },
    })
    const [result] = snapshotContracts(root, membersOf(root, ['packages/x/a'])).results
    expect(result).toMatchObject({ kind: 'invalid', directory: 'packages/x/a' })
    expect(result?.kind === 'invalid' ? result.message : '').toMatch(/dist 有编译诊断：.*TS2307/u)
  })

  it('reports unbuilt members and missing entry files without throwing', () => {
    const root = contractCheckout({
      'packages/x/built': {
        name: '@fixture/built',
        exports: { '.': 'index.d.ts' },
        dist: { 'index.d.ts': 'export type A = 1;\n' },
      },
      'packages/x/unbuilt': { name: '@fixture/unbuilt', exports: { '.': 'index.d.ts' } },
      'packages/x/partial': {
        name: '@fixture/partial',
        exports: { '.': 'index.d.ts', './more': 'more.d.ts' },
        dist: { 'index.d.ts': 'export {};\n' },
      },
    })
    const { results } = snapshotContracts(
      root,
      membersOf(root, ['packages/x/built', 'packages/x/unbuilt', 'packages/x/partial']),
    )
    expect(results.map(item => [item.directory, item.kind])).toEqual([
      ['packages/x/built', 'snapshot'],
      ['packages/x/partial', 'invalid'],
      ['packages/x/unbuilt', 'unbuilt'],
    ])
    expect(results[1]).toMatchObject({ message: '入口 ./more 的 ./dist/more.d.ts 不存在' })
  })

  // Slow: builds real TypeScript 6 programs over the fixture dist, twice. 3.6 s on the full-admission fast-tier ledger, over the 2.5 s per-case budget (6.5 s under load) (tools/test-runner/README_ZH.md「归层」).
  it(
    'writes the configured path, then reports a member whose dist moved away from it',
    { tags: ['slow'] },
    () => {
      const root = shapesCheckout()
      expect(writeSnapshots(root, CONFIG).members).toEqual([
        {
          directory: 'packages/x/base',
          status: 'written',
          snapshotFile: 'packages/x/base/api/base.api.md',
        },
        {
          directory: 'packages/x/shapes',
          status: 'written',
          snapshotFile: 'packages/x/shapes/api/shapes.api.md',
        },
      ])
      expect(readFileSync(join(root, 'packages/x/base/api/base.api.md'), 'utf8')).toContain(
        '# @fixture/base 的 API 快照',
      )
      expect(writeSnapshots(root, CONFIG).members.every(item => item.status === 'unchanged')).toBe(
        true,
      )
      const clean = checkSnapshots(root, CONFIG).members
      expect(clean.every(item => item.status === 'match')).toBe(true)
      expect(clean[0]).toMatchObject({ sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) })

      setDist(root, 'packages/x/base', {
        'index.d.ts':
          'export type Id = number;\nexport interface Blocks {\n}\nexport type Extra = 1;\n',
      })
      const run = checkSnapshots(root, CONFIG)
      expect(run.members[0]).toMatchObject({
        directory: 'packages/x/base',
        status: 'differs',
        change: 'review',
        differences: [
          {
            target: { scope: 'export', entry: '.', name: 'Extra' },
            kind: 'added',
            change: 'additive',
          },
          {
            target: { scope: 'declaration', path: 'index.d.ts', statement: 'type Id' },
            kind: 'changed',
            change: 'review',
            reasons: [{ kind: 'outside-whitelist', why: '改动不是新增可选属性' }],
          },
          {
            target: { scope: 'export', entry: '.', name: 'Id' },
            kind: 'changed',
            change: 'review',
            reasons: [{ kind: 'direction', readers: false, writers: false }],
          },
        ],
      })
      const text = renderCheck(run).join('\n')
      expect(text).toContain(
        'packages/x/base：packages/x/base/api/base.api.md 与 dist 不一致，review',
      )
      expect(text).toContain(
        '入口 `.` · `Id`：改动，review（读方破坏，写方破坏：实例 （无类型参数）：',
      )
      expect(text).toContain('1 个不一致')

      setDist(root, 'packages/x/base', undefined)
      expect(checkSnapshots(root, CONFIG).members[0]).toMatchObject({
        directory: 'packages/x/base',
        status: 'unbuilt',
      })
    },
  )

  it('does not rewrite a member whose dependency is unbuilt', () => {
    const root = contractCheckout({
      'packages/x/a': {
        name: '@fixture/a',
        exports: { '.': 'index.d.ts' },
        dist: { 'index.d.ts': 'export type A = 1;\n' },
      },
      'packages/x/b': {
        name: '@fixture/b',
        exports: { '.': 'index.d.ts' },
        dist: { 'index.d.ts': "export { A } from '@fixture/a';\nexport type B = 1;\n" },
      },
    })
    writeSnapshots(root, CONFIG)
    const good = readFileSync(join(root, 'packages/x/b/api/b.api.md'), 'utf8')
    setDist(root, 'packages/x/a', undefined)
    expect(writeSnapshots(root, CONFIG).members.map(item => [item.directory, item.status])).toEqual(
      [
        ['packages/x/a', 'unbuilt'],
        ['packages/x/b', 'invalid'],
      ],
    )
    expect(readFileSync(join(root, 'packages/x/b/api/b.api.md'), 'utf8')).toBe(good)
  })

  it('reports a snapshot written in another format version as unreadable', () => {
    const root = shapesCheckout()
    writeSnapshots(root, CONFIG)
    const path = join(root, 'packages/x/base/api/base.api.md')
    setDist(root, 'packages/x/base', {
      'index.d.ts': 'export type Id = number;\nexport interface Blocks {\n}\n',
    })
    writeFileSync(path, readFileSync(path, 'utf8').replace('快照格式 1', '快照格式 0'))
    expect(checkSnapshots(root, CONFIG).members[0]).toMatchObject({
      status: 'unreadable',
      message: expect.stringMatching(/格式 0/u),
    })
  })

  it('reads the member list from every line and rejects malformed configuration', () => {
    expect(
      parseContractMembers(
        JSON.stringify({
          lines: [{ contracts: ['b', 'a'] }, { contracts: [] }, { contracts: ['a'] }],
        }),
      ),
    ).toEqual(['a', 'b'])
    expect(() => parseContractMembers(JSON.stringify({ lines: [{ id: 'x' }] }))).toThrow(
      /contracts/u,
    )
    expect(() => parseContractMembers(JSON.stringify({}))).toThrow(/lines/u)
    expect(parseContractApiConfig(CONFIG)).toEqual(CONFIG)
    expect(() => parseContractApiConfig([])).toThrow(/须为对象/u)
    expect(() => parseContractApiConfig({ ...CONFIG, extra: 1 })).toThrow(/认不出的键：extra/u)
    expect(() => parseContractApiConfig({ ...CONFIG, members: '' })).toThrow(/members/u)
    expect(() => parseContractApiConfig({ ...CONFIG, snapshot: 'api/all.api.md' })).toThrow(
      /\{member\}/u,
    )
    expect(() => parseContractApiConfig({ ...CONFIG, snapshot: '{member}/api.txt' })).toThrow(
      /\.md/u,
    )
    expect(() => parseContractApiConfig({ members: CONFIG.members })).toThrow(/snapshot/u)
  })
})
