// 分类规则的正反例。形状的判断来自 TypeScript 检查器的双向可赋值性：
// readers = 新值能否交给按旧形状写的读方（新 → 旧），writers = 旧写方的值能否被新声明接受（旧 → 新）。
import { afterEach, describe, expect, it } from 'vitest'
import { classifySnapshots } from '../src/declarations/api-classify.ts'
import { classifyDists, contractCheckout, snapshotOf } from './fixtures/contract-api.ts'
import { removeTemporaries } from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const exported = (name: string, entry = '.') => ({ scope: 'export', entry, name }) as const

/** 加一个可选成员 `b`，`use` 是同一个成员里读 Options 的写法。 */
const optionalAdded = (use: string) =>
  classifyDists(
    `export interface Options { a?: string }\n${use}`,
    `export interface Options { a?: string; b?: number }\n${use}`,
  )

// Each case builds two snapshots and a two-sided program with real TypeScript 6.
describe('contract API change classes', { timeout: 60_000 }, () => {
  it('is none when only comments, layout, declaration order or parameter names change', () => {
    expect(
      classifyDists(
        '/** a */\nexport declare function f(a: string): void;\nexport type Z = 1;\n',
        'export type Z = 1;\nexport declare function f(b: string): void;\n',
      ),
    ).toEqual({
      change: 'none',
      differences: [],
    })
  })

  it('is additive for a new export, a new entry and new optional members, with both directions safe', () => {
    expect(
      classifyDists(
        'export interface A { a: string }\n',
        'export interface A { a: string }\nexport interface B { b: string }\n',
      ),
    ).toEqual({
      change: 'additive',
      differences: [{ target: exported('B'), kind: 'added', change: 'additive' }],
    })
    expect(
      classifyDists(
        'export interface O { a: string }\n',
        'export interface O { a: string; b?: number }\n',
      ).differences,
    ).toEqual([
      { target: exported('O'), kind: 'changed', change: 'additive', readers: true, writers: true },
    ])
    expect(
      classifyDists(
        'export interface Port { a(): void }\n',
        'export interface Port { a(): void; b?(): void }\n',
      ).change,
    ).toBe('additive')
    expect(
      classifyDists(
        'export interface Box<T> { v: T }\n',
        'export interface Box<T> { v: T; w?: T }\n',
      ).change,
    ).toBe('additive')
    expect(
      classifyDists(
        'export declare function on(cb: (e: { a: string }) => void): void;\n',
        'export declare function on(cb: (e: { a: string; b?: number }) => void): void;\n',
      ).change,
    ).toBe('additive')
    // Omit drops a key without reading the rest, so the derived type grows the same way.
    expect(optionalAdded("export type W = Omit<Options, 'a'>;\n").change).toBe('additive')
    const entry = classifyDists(
      { 'index.d.ts': 'export type A = 1;\n' },
      { 'index.d.ts': 'export type A = 1;\n', 'more.d.ts': 'export type More = 1;\n' },
      { after: { '.': 'index.d.ts', './more': 'more.d.ts' } },
    )
    expect(entry).toEqual({
      change: 'additive',
      differences: [
        { target: { scope: 'entry', entry: './more' }, kind: 'added', change: 'additive' },
      ],
    })
  })

  it('is review for a removed export, a changed signature, a new required member, and says which side breaks', () => {
    expect(
      classifyDists(
        'export interface A { a: string }\nexport type B = 1;\n',
        'export interface A { a: string }\n',
      ).differences,
    ).toEqual([{ target: exported('B'), kind: 'removed', change: 'review' }])
    // A new required member keeps old values readable but breaks every writer.
    expect(
      classifyDists(
        'export interface O { a: string }\n',
        'export interface O { a: string; b: number }\n',
      ).differences,
    ).toEqual([
      {
        target: exported('O'),
        kind: 'changed',
        change: 'review',
        readers: true,
        writers: false,
        notes: ['实例 （无类型参数）：旧写方的值不被新声明接受'],
      },
    ])
    // Required to optional breaks readers; a wider union breaks readers; a narrower one breaks writers.
    expect(
      classifyDists('export interface O { a: string }\n', 'export interface O { a?: string }\n')
        .differences[0],
    ).toMatchObject({ readers: false, writers: true })
    expect(
      classifyDists("export type U = 'a' | 'b';\n", "export type U = 'a' | 'b' | 'c';\n")
        .differences[0],
    ).toMatchObject({ readers: false, writers: true })
    expect(
      classifyDists("export type U = 'a' | 'b';\n", "export type U = 'a';\n").differences[0],
    ).toMatchObject({ readers: true, writers: false })
    // A widened parameter: implementations and doubles of the old function no longer fit.
    expect(
      classifyDists(
        'export declare function f(a: string): void;\n',
        'export declare function f(a: string | number): void;\n',
      ).change,
    ).toBe('review')
    // Method parameters are compared without bivariance.
    expect(
      classifyDists(
        'export interface H { handle(x: string): void }\n',
        'export interface H { handle(x: string | number): void }\n',
      ).change,
    ).toBe('review')
    expect(
      classifyDists('export interface O { a: string }\n', 'export interface O { a: any }\n')
        .differences[0]?.notes,
    ).toContain('新增了 any')
    const overloads = (a: string, b: string) =>
      `export declare function f(x: ${a}): void;\nexport declare function f(x: ${b}): void;\n`
    expect(
      classifyDists(overloads('string', 'number'), overloads('number', 'string')).differences[0]
        ?.notes,
    ).toContain('重载的顺序变了，调用按顺序选重载')
    expect(
      classifyDists(
        'export interface Box<T extends string> { v: T }\n',
        "export interface Box<T extends 'a'> { v: T }\n",
      ).change,
    ).toBe('review')
  })

  it('removing an entry counts even when the entry exports nothing', () => {
    const empty = { 'index.d.ts': 'export type A = 1;\n', 'aug.d.ts': 'export {};\n' }
    const result = classifyDists(empty, empty, {
      before: { '.': 'index.d.ts', './augment': 'aug.d.ts' },
    })
    expect(result).toEqual({
      change: 'review',
      differences: [
        { target: { scope: 'entry', entry: './augment' }, kind: 'removed', change: 'review' },
      ],
    })
  })

  it('sees through derived types: keyof, index access, mapped types, Required, Record, helpers', () => {
    expect(optionalAdded('export type Key = keyof Options;\n').change).toBe('review')
    expect(optionalAdded('export type Value = Options[keyof Options];\n').change).toBe('review')
    // A homomorphic mapped type keeps the new member optional; with `-?` it becomes required.
    expect(optionalAdded('export type Each = { [K in keyof Options]: 1 };\n').change).toBe(
      'additive',
    )
    expect(optionalAdded('export type Each = { [K in keyof Options]-?: 1 };\n').change).toBe(
      'review',
    )
    expect(optionalAdded('export type Resolved = Required<Options>;\n').change).toBe('review')
    expect(optionalAdded('export type Table = Record<keyof Options, 1>;\n').change).toBe('review')
    // Reached through a local helper, a helper from another package, or a typed constant.
    expect(optionalAdded('type Keys<T> = keyof T;\nexport type K = Keys<Options>;\n').change).toBe(
      'review',
    )
    expect(
      classifyDists(
        "import type { KeysOf } from 'x';\nexport interface Options { a?: string }\nexport type K = KeysOf<Options>;\n",
        "import type { KeysOf } from 'x';\nexport interface Options { a?: string; b?: number }\nexport type K = KeysOf<Options>;\n",
      ).change,
    ).toBe('review')
    expect(
      optionalAdded(
        'export declare const defaults: Options;\nexport type K = keyof typeof defaults;\n',
      ).change,
    ).toBe('review')
  })

  it('a self-augmentation that grows a registry breaks writers that must list every key', () => {
    const facility = (files: string) => ({
      'index.d.ts':
        "export type { Facilities, FacilityKey, FacilityOperation } from './facility.ts';\nexport { describeFacility } from './facility.ts';\nexport type { FilesFacility } from './files.ts';\n",
      'facility.d.ts':
        "export interface Facilities {\n}\nexport type FacilityKey = keyof Facilities & string;\nexport type FacilityOperation<K extends FacilityKey> = keyof Facilities[K] & string;\nexport declare function describeFacility<K extends FacilityKey>(key: K, operations: {\n    readonly [O in FacilityOperation<K>]: 'guarded' | 'open';\n}): void;\n",
      'files.d.ts': `export interface FilesFacility {\n    read(): string;${files}\n}\ndeclare module './facility.ts' {\n    interface Facilities {\n        files: FilesFacility;\n    }\n}\n`,
    })
    const result = classifyDists(facility(''), facility('\n    stat?(): number;'))
    expect(result.change).toBe('review')
    expect(result.differences).toContainEqual(
      expect.objectContaining({
        target: exported('FacilityOperation'),
        change: 'review',
        readers: false,
      }),
    )
    expect(result.differences).toContainEqual({
      target: exported('FilesFacility'),
      kind: 'changed',
      change: 'additive',
      readers: true,
      writers: true,
    })
  })

  it('an optional member that narrows an inherited one, or that a check reads, is review', () => {
    expect(
      classifyDists(
        "export interface Base { mode?: 'a' | 'b' }\nexport interface Options extends Base {}\n",
        "export interface Base { mode?: 'a' | 'b' }\nexport interface Options extends Base { mode?: 'a' }\n",
      ).change,
    ).toBe('review')
    expect(
      classifyDists(
        "export interface Base { mode: 'a' | 'b' }\nexport type Options = Base & { extra?: string };\n",
        "export interface Base { mode: 'a' | 'b' }\nexport type Options = Base & { extra?: string; mode?: 'a' };\n",
      ).change,
    ).toBe('review')
    expect(
      classifyDists(
        'export type IsOpt<T> = T extends { a: string } ? true : false;\n',
        'export type IsOpt<T> = T extends { a: string; b?: number } ? true : false;\n',
      ).change,
    ).toBe('review')
  })

  it('follows unexported declarations: an internal type that changes, or becomes an export with a new required member', () => {
    expect(
      classifyDists(
        'interface Bar { a: string }\nexport interface Foo { x: Bar }\nexport {};\n',
        'interface Bar { a: string; b: number }\nexport interface Foo { x: Bar }\nexport {};\n',
      ).change,
    ).toBe('review')
    expect(
      classifyDists(
        'interface Bar { a: string }\nexport interface Foo { x: Bar }\nexport {};\n',
        'export interface Bar { a: string; b: number }\nexport interface Foo { x: Bar }\n',
      ).change,
    ).toBe('review')
    // Two same-named internal types in same-named files: only the changed one matters.
    const boxes = (extra: string) => ({
      'index.d.ts':
        "import type { Box as B1 } from './a/types.ts';\nimport type { Box as B2 } from './b/types.ts';\nexport interface Foo { x: B1; y: B2 }\n",
      'a/types.d.ts': `export interface Box { a: string${extra} }\n`,
      'b/types.d.ts': 'export interface Box { b: string }\n',
    })
    expect(classifyDists(boxes(''), boxes('; c: number')).differences).toEqual([
      expect.objectContaining({ target: exported('Foo'), change: 'review', writers: false }),
    ])
    expect(
      classifyDists(
        {
          'index.d.ts': 'export declare const value: import("./h.ts").Hidden;\n',
          'h.d.ts': 'export interface Hidden { a: string }\n',
        },
        {
          'index.d.ts': 'export declare const value: import("./h.ts").Hidden;\n',
          'h.d.ts': 'export interface Hidden { a: number }\n',
        },
      ).change,
    ).toBe('review')
    // An internal type that only gains an optional member: compatible, but not nothing.
    expect(
      classifyDists(
        'interface Bar { a: string }\nexport interface Foo { x: Bar }\nexport {};\n',
        'interface Bar { a: string; b?: number }\nexport interface Foo { x: Bar }\nexport {};\n',
      ),
    ).toEqual({
      change: 'additive',
      differences: [
        {
          target: { scope: 'snapshot' },
          kind: 'changed',
          change: 'additive',
          notes: ['声明有变化，检查器没有发现不兼容'],
        },
      ],
    })
  })

  it('compares augmentations of other modules after merging them', () => {
    const journal = (members: string) =>
      `export interface Journal { open(): void }\ndeclare module 'x' {\n    interface Context {\n${members}\n    }\n}\n`
    const context = { scope: 'augmentation', target: 'x', name: 'Context' }
    expect(
      classifyDists(
        journal('        journal: Journal;'),
        journal('        journal: Journal;\n        clock?: Journal;'),
      ).differences,
    ).toEqual([
      { target: context, kind: 'changed', change: 'additive', readers: true, writers: true },
    ])
    expect(
      classifyDists(
        journal('        journal: Journal;'),
        journal('        journal: Journal;\n        clock: Journal;'),
      ).differences,
    ).toEqual([
      {
        target: context,
        kind: 'changed',
        change: 'review',
        readers: true,
        writers: false,
        notes: ['扩充（合并后）：旧写方的值不被新声明接受'],
      },
    ])
    expect(
      classifyDists(
        'export {};\ndeclare global {\n    var hook: (a: string) => void;\n}\n',
        'export {};\ndeclare global {\n    var hook: (a: number) => void;\n}\n',
      ).change,
    ).toBe('review')
    expect(
      classifyDists(
        'export {};\n',
        'export {};\ndeclare global {\n    interface Reg<T extends { a: string }> { x?: T }\n}\n',
      ).change,
    ).toBe('additive')
    expect(
      classifyDists(
        'export {};\n',
        'export {};\ndeclare global {\n    interface Reg<T extends { a: string }> { x: T }\n}\n',
      ).change,
    ).toBe('review')
  })

  it('export type * turns values type-only, which is review', () => {
    const a = { 'a.d.ts': 'export declare const v: number;\nexport type A = 1;\n' }
    expect(
      classifyDists(
        { 'index.d.ts': "export * from './a.ts';\n", ...a },
        { 'index.d.ts': "export type * from './a.ts';\n", ...a },
      ).differences,
    ).toEqual([{ target: exported('v'), kind: 'marked', change: 'review' }])
  })

  it('treats a missing snapshot on either side as a whole-member addition, removal or gap', () => {
    const context = { root: '/', directory: 'packages/x/a' }
    const snapshot = snapshotOf({ 'index.d.ts': 'export type A = 1;\n' })
    expect(classifySnapshots(undefined, snapshot, context).change).toBe('additive')
    expect(classifySnapshots(snapshot, undefined, context).change).toBe('review')
    expect(classifySnapshots(undefined, undefined, context)).toEqual({
      change: 'review',
      differences: [{ target: { scope: 'snapshot' }, kind: 'missing', change: 'review' }],
    })
    expect(
      classifySnapshots(snapshot, { ...snapshot, packageName: '@fixture/renamed' }, context),
    ).toEqual({
      change: 'review',
      differences: [{ target: { scope: 'snapshot' }, kind: 'renamed', change: 'review' }],
    })
  })

  it('does not trust the checker when the restored declarations do not compile', () => {
    // A recorded snapshot whose declarations import a package that this checkout does not have.
    const before = snapshotOf({ 'index.d.ts': 'export type A = 1;\n' })
    const code = "import type { Q } from '@fixture/missing';\nexport type A = Q;"
    const after = { ...before, files: before.files.map(file => ({ ...file, code })) }
    const root = contractCheckout({
      'packages/x/a': {
        name: '@fixture/a',
        exports: { '.': 'index.d.ts' },
        dist: { 'index.d.ts': 'export type A = 1;\n' },
      },
    })
    const result = classifySnapshots(before, after, { root, directory: 'packages/x/a' })
    expect(result.change).toBe('review')
    expect(result.differences).toContainEqual(
      expect.objectContaining({
        target: { scope: 'snapshot' },
        kind: 'unresolved',
        change: 'review',
      }),
    )
  })
})
