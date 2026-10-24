// 分类规则的正反例：白名单门。只有正证据成立才是 additive：每处差异都在「可加改动」表的白名单里
// （新增导出；接口、类型字面量或扩充接口里新增可选属性），并且检查器对涉及的导出用同一种写法证明两个方向都可赋值。
// 其余一律 review，附注写明命中哪一条。每条用例只给两份声明，断言分类与附注种类。
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifySnapshots,
  type Difference,
  type ReviewReason,
  type SnapshotDifference,
} from '../src/declarations/api-classify.ts'
import { classifyDists, contractCheckout, snapshotOf } from './fixtures/contract-api.ts'
import { removeTemporaries } from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const exported = (name: string, entry = '.') => ({ scope: 'export', entry, name }) as const
const declared = (statement: string, path = 'index.d.ts') =>
  ({ scope: 'declaration', path, statement }) as const

/** 一份结果里出现过的附注种类（去重、按出现顺序）。 */
function reasonKinds(result: SnapshotDifference): ReviewReason['kind'][] {
  const kinds = result.differences.flatMap(item =>
    item.change === 'review' ? item.reasons.map(reason => reason.kind) : [],
  )
  return [...new Set(kinds)]
}

function reasonsOf(result: SnapshotDifference, target: Difference['target']): ReviewReason[] {
  return result.differences.flatMap(item =>
    item.change === 'review' && JSON.stringify(item.target) === JSON.stringify(target)
      ? item.reasons
      : [],
  )
}

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
    ).toEqual({ change: 'none', differences: [] })
  })

  it('does not let normalization turn a review into none: a `this` parameter is not a parameter name', () => {
    // `f(this: Foo, a)` has one parameter and a this type; `f(self: Foo, a)` has two parameters.
    const result = classifyDists(
      'export interface Foo { n: number }\nexport declare function f(this: Foo, a: string): void;\n',
      'export interface Foo { n: number }\nexport declare function f(self: Foo, a: string): void;\n',
    )
    expect(result.change).toBe('review')
    expect(reasonKinds(result)).toContain('outside-whitelist')
  })

  it('whitelist (a): a new export or a new entry is additive when existing declarations keep their text', () => {
    expect(
      classifyDists(
        'export interface A { a: string }\n',
        'export interface A { a: string }\nexport interface B { b: string }\n',
      ),
    ).toEqual({
      change: 'additive',
      differences: [{ target: exported('B'), kind: 'added', change: 'additive' }],
    })
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

  it('whitelist (b): a new optional property in an interface, a type literal or a generic interface is additive once the checker proves both directions', () => {
    expect(
      classifyDists(
        'export interface O { a: string }\n',
        'export interface O { a: string; b?: number }\n',
      ),
    ).toEqual({
      change: 'additive',
      differences: [{ target: exported('O'), kind: 'changed', change: 'additive', proved: true }],
    })
    expect(
      classifyDists(
        'export interface Box<T> { v: T }\n',
        'export interface Box<T> { v: T; w?: T }\n',
      ).change,
    ).toBe('additive')
    // A type literal inside a callback parameter.
    expect(
      classifyDists(
        'export declare function on(cb: (e: { a: string }) => void): void;\n',
        'export declare function on(cb: (e: { a: string; b?: number }) => void): void;\n',
      ).change,
    ).toBe('additive')
    // Omit drops a key without reading the rest, so the derived type grows the same way.
    expect(optionalAdded("export type W = Omit<Options, 'a'>;\n").change).toBe('additive')
    // An internal type that only gains an optional member: compatible, but not nothing.
    expect(
      classifyDists(
        'interface Bar { a: string }\nexport interface Foo { x: Bar }\nexport {};\n',
        'interface Bar { a: string; b?: number }\nexport interface Foo { x: Bar }\nexport {};\n',
      ),
    ).toEqual({
      change: 'additive',
      differences: [{ target: { scope: 'snapshot' }, kind: 'changed', change: 'additive' }],
    })
  })

  it('dropping an empty `export {}` while the file stays a module is not a removal', () => {
    expect(
      classifyDists(
        'export declare const v: number;\nexport {};\n',
        'export declare const v: number;\n',
      ),
    ).toEqual({
      change: 'additive',
      differences: [{ target: { scope: 'snapshot' }, kind: 'changed', change: 'additive' }],
    })
    // Without another export the file would stop being a module: that stays outside the whitelist.
    const script = classifyDists(
      {
        'index.d.ts': "import './g.ts';\nexport {};\n",
        'g.d.ts': 'declare const g: number;\nexport {};\n',
      },
      { 'index.d.ts': "import './g.ts';\nexport {};\n", 'g.d.ts': 'declare const g: number;\n' },
    )
    expect(script.change).toBe('review')
    expect(reasonsOf(script, declared('export {};', 'g.d.ts'))).toEqual([
      { kind: 'outside-whitelist', why: '删除了语句' },
    ])
  })

  it('a whitelisted change next to one outside the whitelist is review as a whole', () => {
    const result = classifyDists(
      'export interface O { a: string }\nexport interface P { p: string }\n',
      'export interface O { a: string; b?: number }\nexport interface P { p: number }\n',
    )
    expect(result.change).toBe('review')
    expect(result.differences).toContainEqual({
      target: exported('O'),
      kind: 'changed',
      change: 'additive',
      proved: true,
    })
    expect(reasonsOf(result, declared('interface P'))).toEqual([
      { kind: 'outside-whitelist', why: '改动不是新增可选属性' },
    ])
  })

  it('only property syntax counts: an optional method signature, an index signature and a required member are outside the whitelist', () => {
    for (const after of [
      'export interface Port { a(): void; b?(): void }\n',
      'export interface Port { a(): void; [k: string]: unknown }\n',
      'export interface Port { a(): void; b(): void }\n',
    ]) {
      const result = classifyDists('export interface Port { a(): void }\n', after)
      expect(result.change).toBe('review')
      expect(reasonKinds(result)).toContain('outside-whitelist')
    }
  })

  it('B1: one proof form for both directions; a conditional type that changes a specific instance is review with a broken direction', () => {
    // The whitelist already rejects the edit. The checker verdict no longer combines two forms:
    // with the single form the old → new direction fails (the new → old direction passes only because
    // the checker instantiates an unconstrained G as unknown, which takes the false branch).
    const result = classifyDists(
      'export type V<T> = string;\n',
      "export type V<T> = T extends 'a' ? number : string;\n",
    )
    expect(result.change).toBe('review')
    expect(reasonsOf(result, declared('type V'))).toEqual([
      { kind: 'outside-whitelist', why: '改动不是新增可选属性' },
    ])
    expect(reasonsOf(result, exported('V'))).toEqual([
      expect.objectContaining({ kind: 'direction', writers: false }),
    ])
    // An unconstrained T is instantiated with one opaque brand, so a branch that only bites for
    // `number` is invisible to the checker. The whitelist is what rejects this edit.
    const box = classifyDists(
      'export interface Box<T> { v: T }\n',
      'export interface Box<T> { v: T extends number ? never : T }\n',
    )
    expect(box.change).toBe('review')
    expect(reasonsOf(box, declared('interface Box'))).toEqual([
      { kind: 'outside-whitelist', why: '改动不是新增可选属性' },
    ])
  })

  it('B2: a constructor parameter or a nested method parameter that narrows is outside the whitelist', () => {
    const ctor = classifyDists(
      'export declare class C { constructor(x: string) }\n',
      "export declare class C { constructor(x: 'a') }\n",
    )
    expect(ctor.change).toBe('review')
    expect(reasonsOf(ctor, declared('class C'))).toEqual([
      expect.objectContaining({ kind: 'outside-whitelist' }),
    ])
    const nested = classifyDists(
      'export interface Host { register(h: { handle(e: string): void }): void }\n',
      "export interface Host { register(h: { handle(e: 'a'): void }): void }\n",
    )
    expect(nested.change).toBe('review')
    expect(reasonKinds(nested)).toEqual(['outside-whitelist'])
  })

  it('B3: a changed type parameter default, a member overload reorder, and too many instance combinations are review', () => {
    const fallback = classifyDists(
      'export interface Box<T = string> { v: T }\n',
      'export interface Box<T = number> { v: T }\n',
    )
    expect(fallback.change).toBe('review')
    expect(reasonKinds(fallback)).toContain('outside-whitelist')
    const overloads = classifyDists(
      "export interface I { m(x: 'a'): number; m(x: string): string }\n",
      "export interface I { m(x: string): string; m(x: 'a'): number }\n",
    )
    expect(overloads.change).toBe('review')
    expect(reasonKinds(overloads)).toContain('outside-whitelist')
    const five = "'a' | 'b' | 'c' | 'd' | 'e'"
    const combos = classifyDists(
      `export type T<A extends ${five}, B extends ${five}> = string;\n`,
      `export type T<A extends ${five}, B extends ${five}> = [A, B] extends ['e', 'e'] ? number : string;\n`,
    )
    expect(combos.change).toBe('review')
    expect(reasonsOf(combos, exported('T'))).toContainEqual({
      kind: 'truncated',
      limit: 16,
      total: 25,
    })
  })

  it('B4: public to protected, and a new private or #private member, are outside the whitelist', () => {
    const cases: readonly [before: string, after: string][] = [
      [
        'export declare class C { run(): void }\n',
        'export declare class C { protected run(): void }\n',
      ],
      [
        'export declare class C { readonly id: string }\n',
        'export declare class C { private brand; readonly id: string }\n',
      ],
      [
        'export declare class C { readonly id: string }\n',
        'export declare class C { #private; readonly id: string }\n',
      ],
    ]
    for (const [before, after] of cases) {
      const result = classifyDists(before, after)
      expect(result.change).toBe('review')
      expect(reasonsOf(result, declared('class C'))).toEqual([
        expect.objectContaining({ kind: 'outside-whitelist' }),
      ])
    }
  })

  it('B5: an export that no comparison covers is review even when its change is whitelisted', () => {
    const required = classifyDists(
      'export declare namespace N { interface O { a: string } }\n',
      'export declare namespace N { interface O { a: string; b: number } }\n',
    )
    expect(required.change).toBe('review')
    expect(reasonKinds(required)).toEqual(['outside-whitelist', 'uncovered'])
    // Optional member: inside the whitelist, but a namespace export has zero comparisons.
    const optional = classifyDists(
      'export declare namespace N { interface O { a: string } }\n',
      'export declare namespace N { interface O { a: string; b?: number } }\n',
    )
    expect(optional.change).toBe('review')
    expect(reasonsOf(optional, exported('N'))).toEqual([{ kind: 'uncovered' }])
    // Reached through an internal declaration: the namespace's own text does not change.
    const indirect = classifyDists(
      'interface Bar { a: string }\nexport declare namespace N { type K = keyof Bar }\n',
      'interface Bar { a: string; b?: number }\nexport declare namespace N { type K = keyof Bar }\n',
    )
    expect(indirect.change).toBe('review')
    expect(reasonsOf(indirect, exported('N'))).toEqual([{ kind: 'uncovered' }])
    // Statements inside an augmentation block that the checker does not compare.
    const inside = classifyDists(
      "import 'x';\nexport interface Foo { a: string }\ndeclare module 'x' { class K { a: string } }\n",
      "import 'x';\nexport interface Foo { a: string }\ndeclare module 'x' { class K { a: number } }\n",
    )
    expect(inside.change).toBe('review')
    expect(reasonsOf(inside, { scope: 'augmentation', target: 'x', name: 'K' })).toEqual([
      { kind: 'uncovered' },
    ])
  })

  it('B6: an export that references an external interface this member augments is review when the augmentation changes', () => {
    const head = "import 'x';\nexport interface Foo { a: string }\n"
    const keys =
      "import type { KeysOf, Context } from 'x';\nexport type CtxKeys = KeysOf<Context>;\n"
    const result = classifyDists(
      head + keys,
      head + keys + "declare module 'x' { interface Context { bar?: Foo } }\n",
    )
    expect(result.change).toBe('review')
    expect(reasonsOf(result, exported('CtxKeys'))).toEqual([
      { kind: 'augmented-reference', target: 'x', name: 'Context' },
    ])
    // Reached through an internal alias, and through a namespace import.
    const aliased = classifyDists(
      head +
        "import type { Context } from 'x';\ntype Keys = keyof Context;\nexport type K = Keys;\n",
      head +
        "import type { Context } from 'x';\ntype Keys = keyof Context;\nexport type K = Keys;\ndeclare module 'x' { interface Context { bar?: Foo } }\n",
    )
    expect(reasonsOf(aliased, exported('K'))).toEqual([
      { kind: 'augmented-reference', target: 'x', name: 'Context' },
    ])
    // Positive control: the same augmentation with no export that reads Context is additive.
    expect(
      classifyDists(
        head + "declare module 'x' { interface Context { foo: Foo } }\n",
        head + "declare module 'x' { interface Context { foo: Foo; bar?: Foo } }\n",
      ),
    ).toEqual({
      change: 'additive',
      differences: [
        {
          target: { scope: 'augmentation', target: 'x', name: 'Context' },
          kind: 'changed',
          change: 'additive',
          proved: true,
        },
      ],
    })
  })

  it('N1: adding or removing readonly is outside the whitelist', () => {
    const added = classifyDists(
      'export interface O { a: string }\n',
      'export interface O { readonly a: string }\n',
    )
    expect(added.change).toBe('review')
    expect(reasonKinds(added)).toEqual(['outside-whitelist'])
    const removed = classifyDists(
      "import 'x';\ndeclare module 'x' { interface Context { readonly foo: string } }\nexport {};\n",
      "import 'x';\ndeclare module 'x' { interface Context { foo: string } }\nexport {};\n",
    )
    expect(removed.change).toBe('review')
    expect(reasonKinds(removed)).toEqual(['outside-whitelist'])
  })

  it('keeps the checker direction for people: a new required member breaks writers, a wider union breaks readers', () => {
    const required = classifyDists(
      'export interface O { a: string }\n',
      'export interface O { a: string; b: number }\n',
    )
    expect(reasonsOf(required, exported('O'))).toEqual([
      {
        kind: 'direction',
        readers: true,
        writers: false,
        details: ['实例 （无类型参数）：旧写方的值不被新声明接受'],
      },
    ])
    expect(
      reasonsOf(
        classifyDists("export type U = 'a' | 'b';\n", "export type U = 'a' | 'b' | 'c';\n"),
        exported('U'),
      ),
    ).toEqual([expect.objectContaining({ kind: 'direction', readers: false, writers: true })])
    expect(
      reasonsOf(
        classifyDists('export interface O { a: string }\n', 'export interface O { a: any }\n'),
        exported('O'),
      )[0],
    ).toMatchObject({ kind: 'direction', details: expect.arrayContaining(['声明：新增了 any']) })
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
    expect(optionalAdded('type Keys<T> = keyof T;\nexport type K = Keys<Options>;\n').change).toBe(
      'review',
    )
    expect(
      optionalAdded(
        'export declare const defaults: Options;\nexport type K = keyof typeof defaults;\n',
      ).change,
    ).toBe('review')
    // Each of these is review by direction, not by the whitelist: the only edit is an optional property.
    expect(reasonKinds(optionalAdded('export type Key = keyof Options;\n'))).toEqual(['direction'])
    // A constraint over keyof Options widens: the new argument `'b'` is tried on the old side, where it
    // does not compile, so the comparison is incomplete rather than silently additive.
    const widened = optionalAdded('export type Pick1<T extends keyof Options> = Options[T];\n')
    expect(widened.change).toBe('review')
    expect(reasonsOf(widened, exported('Pick1'))).toEqual([
      expect.objectContaining({ kind: 'incomplete' }),
    ])
  })

  it('a self-augmentation that grows a registry is review: the new key is a required member', () => {
    const facility = (files: string) => ({
      'index.d.ts':
        "export type { Facilities, FacilityKey, FacilityOperation } from './facility.ts';\nexport { describeFacility } from './facility.ts';\nexport type { FilesFacility } from './files.ts';\n",
      'facility.d.ts':
        "export interface Facilities {\n}\nexport type FacilityKey = keyof Facilities & string;\nexport type FacilityOperation<K extends FacilityKey> = keyof Facilities[K] & string;\nexport declare function describeFacility<K extends FacilityKey>(key: K, operations: {\n    readonly [O in FacilityOperation<K>]: 'guarded' | 'open';\n}): void;\n",
      'files.d.ts': `export interface FilesFacility {\n    read(): string;${files}\n}\ndeclare module './facility.ts' {\n    interface Facilities {\n        files: FilesFacility;\n    }\n}\n`,
    })
    const result = classifyDists(facility(''), facility('\n    stat?: () => number;'))
    expect(result.change).toBe('review')
    expect(reasonsOf(result, exported('FacilityOperation'))).toEqual([
      expect.objectContaining({ kind: 'direction', readers: false }),
    ])
  })

  it('removing an export or an entry, and a changed export mark, are outside the whitelist', () => {
    expect(
      classifyDists(
        'export interface A { a: string }\nexport type B = 1;\n',
        'export interface A { a: string }\n',
      ).differences,
    ).toEqual([
      {
        target: exported('B'),
        kind: 'removed',
        change: 'review',
        reasons: [{ kind: 'outside-whitelist', why: '导出删除了' }],
      },
      {
        target: declared('type B'),
        kind: 'removed',
        change: 'review',
        reasons: [{ kind: 'outside-whitelist', why: '删除了语句' }],
      },
    ])
    const empty = { 'index.d.ts': 'export type A = 1;\n', 'aug.d.ts': 'export {};\n' }
    expect(
      classifyDists(empty, empty, { before: { '.': 'index.d.ts', './augment': 'aug.d.ts' } }),
    ).toEqual({
      change: 'review',
      differences: [
        {
          target: { scope: 'entry', entry: './augment' },
          kind: 'removed',
          change: 'review',
          reasons: [{ kind: 'outside-whitelist', why: '入口删除了' }],
        },
      ],
    })
    const a = { 'a.d.ts': 'export declare const v: number;\nexport type A = 1;\n' }
    const marked = classifyDists(
      { 'index.d.ts': "export * from './a.ts';\n", ...a },
      { 'index.d.ts': "export type * from './a.ts';\n", ...a },
    )
    expect(marked.differences[0]).toMatchObject({
      target: exported('v'),
      kind: 'marked',
      change: 'review',
    })
    expect(reasonKinds(marked)).toEqual(['outside-whitelist'])
  })

  it('compares augmentations of other modules after merging them', () => {
    const journal = (members: string) =>
      `export interface Journal { open(): void }\ndeclare module 'x' {\n    interface Context {\n${members}\n    }\n}\n`
    const context = { scope: 'augmentation', target: 'x', name: 'Context' } as const
    expect(
      classifyDists(
        journal('        journal: Journal;'),
        journal('        journal: Journal;\n        clock?: Journal;'),
      ).differences,
    ).toEqual([{ target: context, kind: 'changed', change: 'additive', proved: true }])
    const required = classifyDists(
      journal('        journal: Journal;'),
      journal('        journal: Journal;\n        clock: Journal;'),
    )
    expect(reasonsOf(required, context)).toEqual([
      {
        kind: 'direction',
        readers: true,
        writers: false,
        details: ['扩充（合并后）：旧写方的值不被新声明接受'],
      },
    ])
    expect(
      classifyDists(
        'export {};\ndeclare global {\n    var hook: (a: string) => void;\n}\n',
        'export {};\ndeclare global {\n    var hook: (a: number) => void;\n}\n',
      ).change,
    ).toBe('review')
    // A new augmentation block: compared against an empty interface, so only optional members pass.
    expect(
      classifyDists(
        'export {};\n',
        'export {};\ndeclare global {\n    interface Reg<T extends { a: string } = { a: string }> { x?: T }\n}\n',
      ),
    ).toEqual({
      change: 'additive',
      differences: [
        {
          target: { scope: 'augmentation', target: 'global', name: 'Reg' },
          kind: 'changed',
          change: 'additive',
          proved: true,
        },
      ],
    })
    const requiredNew = classifyDists(
      'export {};\n',
      'export {};\ndeclare global {\n    interface Reg { x: string }\n}\n',
    )
    expect(requiredNew.change).toBe('review')
    expect(reasonKinds(requiredNew)).toEqual(['outside-whitelist', 'direction'])
    // A generic augmented interface without defaults cannot be merged for comparison: incomplete, not additive.
    const generic = classifyDists(
      'export {};\n',
      'export {};\ndeclare global {\n    interface Reg<T extends { a: string }> { x?: T }\n}\n',
    )
    expect(generic.change).toBe('review')
    expect(reasonKinds(generic)).toContain('incomplete')
  })

  describe('checker normalization keeps unchanged constructs comparable', () => {
    const grow = (fixed: string) =>
      classifyDists(
        `${fixed}\nexport interface O { a: string }\n`,
        `${fixed}\nexport interface O { a: string; b?: number }\n`,
      )
    it.each([
      [
        'unique symbol brand on a constant',
        'export declare const tag: unique symbol;\nexport type Id = string & { readonly [tag]: true };\nexport declare function id(): Id;',
      ],
      [
        'unique symbol brand on a static class member',
        'export declare class Tags { static readonly t: unique symbol }\nexport type Id = string & { readonly [Tags.t]: true };\nexport declare function id(): Id;',
      ],
      [
        'class with private, #private and protected members',
        'export declare class C { private x; #y; protected z: number; run(): void }',
      ],
      [
        'class with a constructor',
        'export declare class C { constructor(x: string, y?: number); run(): void }',
      ],
      [
        'interface methods with overloads',
        "export interface H { m(x: 'a'): number; m(x: string): string; n(): void }",
      ],
      [
        'type parameter default',
        'export interface Box<T = string> { v: T }\nexport type Use = Box;',
      ],
      [
        'foreign augmentation',
        "import 'x';\ndeclare module 'x' { interface Context { foo: string } }",
      ],
    ])('%s: unchanged, so an unrelated optional property stays additive', (_name, fixed) => {
      expect(grow(fixed)).toEqual({
        change: 'additive',
        differences: [{ target: exported('O'), kind: 'changed', change: 'additive', proved: true }],
      })
    })

    it('still tells brands apart: removing a brand or switching to another one is review', () => {
      const removed = classifyDists(
        'declare const tag: unique symbol;\nexport type Id = string & { readonly [tag]: true };\n',
        'export type Id = string;\n',
      )
      expect(removed.change).toBe('review')
      expect(reasonsOf(removed, exported('Id'))).toEqual([
        expect.objectContaining({ kind: 'direction', readers: false, writers: true }),
      ])
      const tags = 'declare const a: unique symbol;\ndeclare const b: unique symbol;\n'
      const switched = classifyDists(
        tags + 'export type Id = string & { readonly [a]: true };\n',
        tags + 'export type Id = string & { readonly [b]: true };\n',
      )
      expect(switched.change).toBe('review')
      expect(reasonsOf(switched, exported('Id'))).toEqual([
        expect.objectContaining({ kind: 'direction', readers: false, writers: false }),
      ])
    })
  })

  it('treats a missing snapshot on either side as a whole-member addition, removal or gap', () => {
    const context = { root: '/', directory: 'packages/x/a' }
    const snapshot = snapshotOf({ 'index.d.ts': 'export type A = 1;\n' })
    expect(classifySnapshots(undefined, snapshot, context).change).toBe('additive')
    expect(classifySnapshots(snapshot, undefined, context).change).toBe('review')
    expect(classifySnapshots(undefined, undefined, context)).toEqual({
      change: 'review',
      differences: [
        {
          target: { scope: 'snapshot' },
          kind: 'missing',
          change: 'review',
          reasons: [{ kind: 'outside-whitelist', why: '两侧都没有快照' }],
        },
      ],
    })
    expect(
      classifySnapshots(snapshot, { ...snapshot, packageName: '@fixture/renamed' }, context),
    ).toEqual({
      change: 'review',
      differences: [
        {
          target: { scope: 'snapshot' },
          kind: 'renamed',
          change: 'review',
          reasons: [{ kind: 'outside-whitelist', why: '包名变了' }],
        },
      ],
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
    expect(reasonsOf(result, { scope: 'snapshot' })).toEqual([
      expect.objectContaining({
        kind: 'diagnostics',
        details: [expect.stringContaining('TS2307')],
      }),
    ])
  })
})
