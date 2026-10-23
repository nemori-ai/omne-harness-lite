import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { snapshotContracts } from '../src/declarations/api-snapshot.ts'
import {
  checkSnapshots,
  parseContractApiConfig,
  parseContractMembers,
  renderCheck,
  writeSnapshots,
} from '../src/declarations/contract-api.ts'
import { CONFIG, contractCheckout, setDist, snapshotOf } from './fixtures/contract-api.ts'
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

function shapesCheckout(): string {
  return contractCheckout(
    {
      'packages/x/shapes': {
        name: '@fixture/shapes',
        exports: { '.': 'index.d.ts' },
        dist: SHAPES,
      },
      'packages/x/base': BASE,
    },
    ['packages/x/shapes', 'packages/x/base'],
  )
}

// Each case builds a real TypeScript 6 program over the fixture dist, which takes about a second.
describe('contract API snapshots', { timeout: 60_000 }, () => {
  it('lists each entry with normalized declarations, internal references and augmentations', () => {
    const root = shapesCheckout()
    const run = snapshotContracts(root, ['packages/x/shapes', 'packages/x/base'])
    expect(run.unbuilt).toEqual([])
    expect(run.problems).toEqual([])
    const shapes = run.snapshots.find(item => item.member === 'packages/x/shapes')?.text ?? ''
    // Comments and the source layout are gone; the printer layout is fixed.
    expect(shapes).not.toContain('comment')
    expect(shapes).not.toContain('A shape')
    expect(shapes).toContain(
      '### `Shape`\n\n```ts\ninterface Shape {\n    readonly side: number;\n    readonly box: Box;\n}\n```',
    )
    // Overloads stay together; an export under another name keeps both names.
    expect(shapes).toMatch(
      /function area\(shape: Shape\): number;\nfunction area\(shape: Shape, unit: string\): number;/u,
    )
    expect(shapes).toContain('### `ShapeRegistry` = `Registry`')
    // A value exported with `export type` is usable as a type only.
    expect(shapes).toContain('### `Unit` 仅类型')
    // A re-export of another package's declaration points at that package instead of copying it.
    expect(shapes).toContain("export { Id } from '@fixture/base';")
    // An unexported type that a public declaration references is part of the public shape.
    expect(shapes).toMatch(
      /## 内部引用\n\n### `Box`\n\n```ts\ninterface Box \{\n {4}readonly width: number;\n\}/u,
    )
    // Augmentations are listed under their target, relative targets rewritten inside the member.
    expect(shapes).toContain(
      '## 模块扩充 `./facility.ts`\n\n### `Facilities`\n\n```ts\ninterface Facilities {\n    files: string;\n}',
    )
    expect(shapes).toContain('## 模块扩充 `@fixture/base`\n\n### `Blocks`')
    // The augmenting member's interface does not leak into the augmented member's snapshot.
    const base = run.snapshots.find(item => item.member === 'packages/x/base')?.text ?? ''
    expect(base).toContain('interface Blocks {\n}')
    expect(base).not.toContain('shape: number')
  })

  it('gives byte-identical output for the same dist, and ignores comments and member order', () => {
    const root = shapesCheckout()
    const once = snapshotContracts(root, ['packages/x/shapes', 'packages/x/base'])
    const twice = snapshotContracts(root, ['packages/x/base', 'packages/x/shapes'])
    expect(twice.snapshots.map(item => item.text).sort()).toEqual(
      once.snapshots.map(item => item.text).sort(),
    )
    const plain = snapshotOf({
      'index.d.ts': 'export interface A { b: string; c?: number }\nexport type Z = 1;\n',
    })
    const noisy = snapshotOf({
      'index.d.ts':
        'export type Z = 1\n/** doc */\nexport interface A {\n  // note\n  b: string\n  c?: number\n}\n',
    })
    expect(noisy).toBe(plain)
  })

  it('reports unbuilt members and incomplete declarations without throwing', () => {
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
    const run = snapshotContracts(root, [
      'packages/x/built',
      'packages/x/unbuilt',
      'packages/x/partial',
    ])
    expect(run.snapshots.map(item => item.member)).toEqual(['packages/x/built'])
    expect(run.unbuilt).toEqual(['packages/x/unbuilt'])
    expect(run.problems).toEqual([
      { member: 'packages/x/partial', message: '入口 ./more 的 ./dist/more.d.ts 不存在' },
    ])
  })

  it('writes the configured path, then reports a member whose dist moved away from it', () => {
    const root = shapesCheckout()
    const written = writeSnapshots(root, CONFIG)
    expect(written.members.map(item => [item.member, item.status, item.path])).toEqual([
      ['packages/x/base', 'written', 'packages/x/base/api/base.api.md'],
      ['packages/x/shapes', 'written', 'packages/x/shapes/api/shapes.api.md'],
    ])
    expect(readFileSync(join(root, 'packages/x/base/api/base.api.md'), 'utf8')).toContain(
      '# @fixture/base 的 API 快照',
    )
    expect(writeSnapshots(root, CONFIG).members.every(item => item.status === 'match')).toBe(true)
    expect(checkSnapshots(root, CONFIG).members.every(item => item.status === 'match')).toBe(true)

    setDist(root, 'packages/x/base', {
      'index.d.ts':
        'export type Id = number;\nexport interface Blocks {\n}\nexport type Extra = 1;\n',
    })
    const run = checkSnapshots(root, CONFIG)
    expect(run.members).toContainEqual({
      member: 'packages/x/base',
      path: 'packages/x/base/api/base.api.md',
      status: 'differs',
      change: 'review',
      items: [
        { section: '入口 `.`', item: '`Extra`', kind: 'added', change: 'additive' },
        { section: '入口 `.`', item: '`Id`', kind: 'changed', change: 'review' },
      ],
    })
    const text = renderCheck(run).join('\n')
    expect(text).toContain(
      'packages/x/base：packages/x/base/api/base.api.md 与 dist 不一致，review',
    )
    expect(text).toContain('入口 `.` · `Id`：改动，review')
    expect(text).toContain('1 个不一致')

    setDist(root, 'packages/x/base', undefined)
    expect(checkSnapshots(root, CONFIG).members).toContainEqual({
      member: 'packages/x/base',
      path: 'packages/x/base/api/base.api.md',
      status: 'unbuilt',
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
    expect(parseContractApiConfig(CONFIG)).toEqual(CONFIG)
    expect(() => parseContractApiConfig({ ...CONFIG, extra: 1 })).toThrow(/认不出的键：extra/u)
    expect(() => parseContractApiConfig({ ...CONFIG, snapshot: 'api/all.api.md' })).toThrow(
      /\{member\}/u,
    )
    expect(() => parseContractApiConfig({ members: CONFIG.members })).toThrow(/snapshot/u)
  })
})
