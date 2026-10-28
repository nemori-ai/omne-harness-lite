// @module-tag slow
// 归慢层：每条用例用 TypeScript 检查器（ts.createProgram）对两份声明逐方向证明可赋值。全量准入快层账本里整份合计 115.0 秒，负载下 201.1 秒，39 条里 25 条在全量准入或负载下超单条预算（2.5 秒），余下仍有 11.6 秒（负载下 18.8 秒）（tools/test-runner/README_ZH.md「归层」）。
// 分类规则的正反例：白名单门。只有正证据成立才是 additive：每处差异都在「可加改动」表的白名单里
// （新增一个旧侧不知道的名字的导出：不与本文件声明合并、不是入口已有的导出名、在文件作用域里解析不到已有符号；
// 模块作用域的接口或类型字面量里新增可选属性），并且检查器对涉及的导出用同一种写法证明两个方向都可赋值。
// 全局作用域的任何差异（扩充块、脚本文件、三斜线指令、导入或导出的模块边、`export as namespace`）整份 review，不跑检查器。
// 其余一律 review，附注写明命中哪一条。每条用例只给两份声明，断言分类与附注种类。
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifySnapshots,
  type Difference,
  type ReviewReason,
  type SnapshotDifference,
} from '../src/declarations/api-classify.ts'
import { whitelistDifferences } from '../src/declarations/api-whitelist.ts'
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
    expect(reasonsOf(script, declared('（文件成了脚本）', 'g.d.ts'))).toEqual([
      { kind: 'global-scope-change', why: '文件在脚本与模块之间切换，顶层声明的作用域变了' },
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
    // A class inside a foreign augmentation block changes: global scope, review without the checker.
    const inside = classifyDists(
      "import 'x';\nexport interface Foo { a: string }\ndeclare module 'x' { class K { a: string } }\n",
      "import 'x';\nexport interface Foo { a: string }\ndeclare module 'x' { class K { a: number } }\n",
    )
    expect(inside.change).toBe('review')
    expect(reasonsOf(inside, declared("module 'x'"))).toEqual([
      { kind: 'global-scope-change', why: '对全局或外部模块的扩充变了' },
    ])
  })

  it('B6: any change to an augmentation of an external module is review as a whole, whether or not an export reads the augmented interface', () => {
    const head = "import 'x';\nexport interface Foo { a: string }\n"
    const keys =
      "import type { KeysOf, Context } from 'x';\nexport type CtxKeys = KeysOf<Context>;\n"
    const added = classifyDists(
      head + keys,
      head + keys + "declare module 'x' { interface Context { bar?: Foo } }\n",
    )
    expect(added.change).toBe('review')
    expect(reasonsOf(added, declared("module 'x'"))).toEqual([
      { kind: 'global-scope-change', why: '对全局或外部模块的扩充新增了' },
    ])
    expect(reasonKinds(added)).toEqual(['global-scope-change'])
    // Formerly a positive control: an optional member added to an existing augmentation, no export reads
    // Context. Global scope exists once in a consumer's program, so the checker cannot prove the member is
    // unaffected; the rule is narrowed and this is review too, without running the checker.
    const grown = classifyDists(
      head + "declare module 'x' { interface Context { foo: Foo } }\n",
      head + "declare module 'x' { interface Context { foo: Foo; bar?: Foo } }\n",
    )
    expect(grown).toEqual({
      change: 'review',
      differences: [
        {
          target: declared("module 'x'"),
          kind: 'changed',
          change: 'review',
          reasons: [{ kind: 'global-scope-change', why: '对全局或外部模块的扩充变了' }],
        },
      ],
    })
  })

  it('a script file is global scope: adding, removing or changing one is review, even for an optional-only interface', () => {
    const member = 'export interface O { a: string }\n'
    const global = 'interface ErrorOptions { code: string }\n'
    // A new script file merges a required member into lib's ErrorOptions: `new Error('x', { cause: 1 })` stops compiling.
    const added = classifyDists(
      { 'index.d.ts': member },
      { 'index.d.ts': member, 'globals.d.ts': global },
    )
    expect(added.change).toBe('review')
    expect(reasonsOf(added, declared('（脚本文件）', 'globals.d.ts'))).toEqual([
      { kind: 'global-scope-change', why: '脚本文件的顶层声明都是全局的：文件新增了' },
    ])
    // The same declaration added to a script file that already existed, with or without a side-effect import.
    const existing = 'interface Foo { x?: string }\n'
    for (const head of ['', "import './globals.js';\n"]) {
      const grown = classifyDists(
        { 'index.d.ts': head + member, 'globals.d.ts': existing },
        { 'index.d.ts': head + member, 'globals.d.ts': existing + global },
      )
      expect(grown.change).toBe('review')
      expect(reasonsOf(grown, declared('（脚本文件）', 'globals.d.ts'))).toEqual([
        { kind: 'global-scope-change', why: '脚本文件的顶层声明都是全局的：语句变了' },
      ])
    }
    const removed = classifyDists(
      { 'index.d.ts': member, 'globals.d.ts': existing },
      { 'index.d.ts': member },
    )
    expect(reasonsOf(removed, declared('（脚本文件）', 'globals.d.ts'))).toEqual([
      { kind: 'global-scope-change', why: '脚本文件的顶层声明都是全局的：文件删除了' },
    ])
    // Formerly a positive control: a new script file with an optional-only interface. Rule narrowed: review.
    const optional = classifyDists(
      { 'index.d.ts': member },
      { 'index.d.ts': member, 'globals.d.ts': existing },
    )
    expect(optional.change).toBe('review')
    expect(reasonKinds(optional)).toEqual(['global-scope-change'])
    // An unchanged script file next to a module-scope whitelisted change stays additive: the checker
    // still runs, and the global declarations are restored once so the two sides do not collide.
    const unchanged = classifyDists(
      { 'index.d.ts': member, 'globals.d.ts': 'type Mode = 1;\ndeclare var cfg: Mode;\n' },
      {
        'index.d.ts': 'export interface O { a: string; b?: number }\n',
        'globals.d.ts': 'type Mode = 1;\ndeclare var cfg: Mode;\n',
      },
    )
    expect(unchanged).toEqual({
      change: 'additive',
      differences: [{ target: exported('O'), kind: 'changed', change: 'additive', proved: true }],
    })
  })

  it('the entry-reachable file set is global scope: any added or removed import or export-from edge is review', () => {
    const member = 'export interface O { a: string }\n'
    const edge = (statement: string, change: 'added' | 'removed') => ({
      target: declared(statement),
      kind: change,
      change: 'review',
      reasons: [
        {
          kind: 'global-scope-change',
          why: `导入或导出的模块边${change === 'added' ? '新增' : '删除'}了，入口可达的文件集合随之变化`,
        },
      ],
    })
    const withGlobal =
      'export interface Y { y: string }\ndeclare global { interface ErrorOptions { code: string } }\n'
    // I1: a typed import newly pulls a file whose `declare global` adds a required member to lib's ErrorOptions.
    const typed = classifyDists(
      { 'index.d.ts': member, 'x.d.ts': withGlobal },
      {
        'index.d.ts': "import type { Y } from './x.js';\n" + member + 'export type Z = Y;\n',
        'x.d.ts': withGlobal,
      },
    )
    expect(typed.change).toBe('review')
    expect(typed.differences).toContainEqual(edge("import type { Y } from './x.js';", 'added'))
    expect(reasonKinds(typed)).toEqual(['global-scope-change'])
    // I2: an empty import clause does the same.
    const empty = classifyDists(
      { 'index.d.ts': member, 'x.d.ts': withGlobal },
      { 'index.d.ts': "import {} from './x.js';\n" + member, 'x.d.ts': withGlobal },
    )
    expect(empty.differences).toEqual([edge("import {} from './x.js';", 'added')])
    // Side-effect imports of this member's files and of external modules, `export … from`, `import()` types.
    const sideEffect = classifyDists(
      { 'index.d.ts': member },
      {
        'index.d.ts': "import './globals.js';\n" + member,
        'globals.d.ts': 'interface Foo { x?: string }\n',
      },
    )
    expect(sideEffect.differences).toContainEqual(edge("import './globals.js';", 'added'))
    expect(classifyDists(member, "import 'x';\n" + member).differences).toEqual([
      edge("import 'x';", 'added'),
    ])
    const more = { 'more.d.ts': 'export type More = 1;\n' }
    expect(
      classifyDists(
        { 'index.d.ts': member, ...more },
        { 'index.d.ts': "export * from './more.js';\n" + member, ...more },
      ).differences,
    ).toContainEqual(edge("export * from './more.js';", 'added'))
    expect(
      classifyDists(
        { 'index.d.ts': member, ...more },
        { 'index.d.ts': member + "export type M = import('./more.js').More;\n", ...more },
      ).differences,
    ).toContainEqual(edge('type M', 'added'))
    // Removing an edge is the same rule.
    expect(
      classifyDists(
        {
          'index.d.ts': "import type { Y } from './x.js';\n" + member,
          'x.d.ts': 'export interface Y { y: string }\n',
        },
        { 'index.d.ts': member, 'x.d.ts': 'export interface Y { y: string }\n' },
      ).differences,
    ).toEqual([edge("import type { Y } from './x.js';", 'removed')])
    // A second import of a module that is already an edge does not change the reachable set.
    const y = { 'x.d.ts': 'export interface Y { y: string }\nexport interface W { w: string }\n' }
    expect(
      classifyDists(
        {
          'index.d.ts': "import type { Y } from './x.js';\n" + member + 'export type Z = Y;\n',
          ...y,
        },
        {
          'index.d.ts':
            "import type { Y } from './x.js';\nimport type { W } from './x.js';\n" +
            member +
            'export type Z = Y;\nexport type V = W;\n',
          ...y,
        },
      ).change,
    ).toBe('additive')
    // Adding `export {}` to a script file takes every top-level declaration out of the global scope.
    const flipped = classifyDists(
      { 'index.d.ts': member, 'globals.d.ts': 'interface Foo { x?: string }\n' },
      { 'index.d.ts': member, 'globals.d.ts': 'interface Foo { x?: string }\nexport {};\n' },
    )
    expect(flipped.change).toBe('review')
    expect(reasonsOf(flipped, declared('（文件成了模块）', 'globals.d.ts'))).toEqual([
      { kind: 'global-scope-change', why: '文件在脚本与模块之间切换，顶层声明的作用域变了' },
    ])
  })

  it('a global augmentation is review without the checker, however an export reaches the augmented symbol', () => {
    const block = 'declare global { interface ErrorOptions { code?: string } }\n'
    const reason = { kind: 'global-scope-change', why: '对全局或外部模块的扩充新增了' }
    for (const keys of [
      // Through lib's ErrorConstructor.
      'export type OptKeys = keyof NonNullable<ConstructorParameters<ErrorConstructor>[1]>;\n',
      // G1: through an index on `typeof globalThis`, a name that never appears in the declaration text.
      "export type OptKeys = keyof NonNullable<ConstructorParameters<(typeof globalThis)['Error']>[1]>;\n",
      // G2: through a property of `globalThis`.
      'export type OptKeys = keyof NonNullable<ConstructorParameters<typeof globalThis.Error>[1]>;\n',
      // No export reads ErrorOptions at all: still review, the rule does not try to prove otherwise.
      'export type Len = Parameters<typeof Array.isArray>;\n',
    ]) {
      const result = classifyDists(keys, keys + block)
      expect(result.change).toBe('review')
      expect(result.differences).toEqual([
        { target: declared('global'), kind: 'added', change: 'review', reasons: [reason] },
      ])
    }
    // A global value changes its type: `typeof globalThis` exports see it; the checker is not asked.
    const hook = (type: string) =>
      `export type G = typeof globalThis;\ndeclare global { var hook: ${type} }\n`
    const changed = classifyDists(hook('number'), hook('string'))
    expect(changed.differences).toEqual([
      {
        target: declared('global'),
        kind: 'changed',
        change: 'review',
        reasons: [{ kind: 'global-scope-change', why: '对全局或外部模块的扩充变了' }],
      },
    ])
    // Removing an augmentation is review by the same rule.
    expect(
      reasonsOf(
        classifyDists(hook('number'), 'export type G = typeof globalThis;\n'),
        declared('global'),
      ),
    ).toEqual([{ kind: 'global-scope-change', why: '对全局或外部模块的扩充删除了' }])
  })

  it('triple-slash directives are global scope: any difference is review', () => {
    const lib = '/// <reference lib="esnext.disposable" />\n'
    const f = 'export declare function f(): Disposable;\n'
    const removed = classifyDists(lib + f, f)
    expect(removed.change).toBe('review')
    expect(reasonsOf(removed, declared('/// <reference lib="esnext.disposable" />'))).toEqual([
      { kind: 'global-scope-change', why: '三斜线指令变了，消费者程序里的声明随之变化' },
    ])
    const types = 'export declare const b: Buffer;\n'
    const cases: readonly [before: string, after: string][] = [
      [types, '/// <reference types="node" />\n' + types],
      ['/// <reference lib="es2022" />\n' + types, '/// <reference lib="es2023" />\n' + types],
      [lib + f, '/// <reference lib="es2022" />\n' + lib + f],
    ]
    for (const [before, after] of cases) {
      const result = classifyDists(before, after)
      expect(result.change).toBe('review')
      expect(reasonKinds(result)).toEqual(['global-scope-change'])
    }
    // Unchanged directives stay comparable: identical is none, an unrelated optional property is additive.
    expect(classifyDists(lib + f, lib + f).change).toBe('none')
    expect(
      classifyDists(
        lib + f + 'export interface O { a: string }\n',
        lib + f + 'export interface O { a: string; b?: number }\n',
      ),
    ).toEqual({
      change: 'additive',
      differences: [{ target: exported('O'), kind: 'changed', change: 'additive', proved: true }],
    })
  })

  it('narrowing an inherited or intersected optional member, a wider `extends` clause and a required internal member are review', () => {
    const inherited = classifyDists(
      "export interface Base { mode?: 'a' | 'b' }\nexport interface Options extends Base {}\n",
      "export interface Base { mode?: 'a' | 'b' }\nexport interface Options extends Base { mode?: 'a' }\n",
    )
    expect(inherited.change).toBe('review')
    expect(reasonsOf(inherited, exported('Options'))).toEqual([
      expect.objectContaining({ kind: 'direction', readers: true, writers: false }),
    ])
    const intersected = classifyDists(
      "export interface Base { mode: 'a' | 'b' }\nexport type Options = Base & { extra?: string };\n",
      "export interface Base { mode: 'a' | 'b' }\nexport type Options = Base & { extra?: string; mode?: 'a' };\n",
    )
    expect(intersected.change).toBe('review')
    expect(reasonsOf(intersected, exported('Options'))).toEqual([
      expect.objectContaining({ kind: 'direction', writers: false }),
    ])
    // An optional field added inside a conditional `extends` clause changes which types take the true branch.
    const conditional = classifyDists(
      'export type IsOpt<T> = T extends { a: string } ? true : false;\n',
      'export type IsOpt<T> = T extends { a: string; b?: number } ? true : false;\n',
    )
    expect(conditional.change).toBe('review')
    expect(reasonKinds(conditional)).toContain('direction')
    const internal = classifyDists(
      'interface Bar { a: string }\nexport interface Foo { x: Bar }\nexport {};\n',
      'interface Bar { a: string; b: number }\nexport interface Foo { x: Bar }\nexport {};\n',
    )
    expect(internal.change).toBe('review')
    expect(reasonsOf(internal, declared('interface Bar'))).toEqual([
      { kind: 'outside-whitelist', why: '改动不是新增可选属性' },
    ])
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
    expect(reasonKinds(removed)).toEqual(['global-scope-change'])
  })

  it('whitelist (a) needs a new name: a declaration that merges with an existing one is review', () => {
    // `typeof f` changes with a new overload, so `Parameters<typeof f>` consumers change.
    const overload = classifyDists(
      'export declare function f(x: string): void;\n',
      'export declare function f(x: string): void;\nexport declare function f(x: number): void;\n',
    )
    expect(overload.change).toBe('review')
    expect(reasonsOf(overload, declared('function f'))).toEqual([
      expect.objectContaining({ kind: 'outside-whitelist' }),
    ])
    // A second interface declaration merges its members into the first.
    const twice = classifyDists(
      'export interface O { a: string }\n',
      'export interface O { a: string }\nexport interface O { b?: number }\n',
    )
    expect(twice.change).toBe('review')
    expect(reasonsOf(twice, declared('interface O'))).toEqual([
      expect.objectContaining({ kind: 'outside-whitelist' }),
    ])
    // A namespace merged onto an existing class, and a namespace merged onto an existing function.
    const merged = classifyDists(
      'export declare class C { run(): void }\nexport declare function g(): void;\n',
      'export declare class C { run(): void }\nexport declare namespace C { const v: 1 }\nexport declare function g(): void;\nexport declare namespace g { const w: 1 }\n',
    )
    expect(merged.change).toBe('review')
    expect(reasonsOf(merged, declared('namespace C'))).toEqual([
      {
        kind: 'outside-whitelist',
        why: '新增的声明与已有的同名声明合并（重载、接口、命名空间或类的合并）',
      },
    ])
    expect(reasonsOf(merged, declared('namespace g'))).toEqual([
      {
        kind: 'outside-whitelist',
        why: '新增的声明与已有的同名声明合并（重载、接口、命名空间或类的合并）',
      },
    ])
    // An internal name that an existing export already used is a merge too.
    const internal = classifyDists(
      'interface Bar { a: string }\nexport interface Foo { x: Bar }\nexport {};\n',
      'interface Bar { a: string }\ninterface Bar { b?: number }\nexport interface Foo { x: Bar }\nexport {};\n',
    )
    expect(internal.change).toBe('review')
    expect(reasonKinds(internal)).toContain('outside-whitelist')
  })

  it('whitelist (a) needs a name the old side does not know: an entry export or a symbol in file scope that the new declaration shadows is review', () => {
    const star = {
      'index.d.ts': "export * from './a.js';\n",
      'a.d.ts':
        'export declare class Foo { private p; x: string }\nexport declare function make(): Foo;\n',
    }
    // X3: `export *` already exports Foo. A local Foo shadows it; consumers writing `const v: Foo = make()` break.
    const shadowedExport = classifyDists(star, {
      ...star,
      'index.d.ts': "export * from './a.js';\nexport declare class Foo { private p; x: string }\n",
    })
    expect(shadowedExport.change).toBe('review')
    expect(reasonsOf(shadowedExport, declared('class Foo'))).toEqual([
      { kind: 'outside-whitelist', why: '新增的名字 `Foo` 与入口 `.` 已有的导出重名' },
    ])
    // S4: a non-exported `Error` shadows the lib's. `f<T = Error>()` now defaults to it; `f().stack` breaks.
    const shadowedGlobal = classifyDists(
      'export declare function f<T = Error>(): T;\nexport {};\n',
      'export declare function f<T = Error>(): T;\ninterface Error { name: string; message: string; code: number }\nexport {};\n',
    )
    expect(shadowedGlobal.change).toBe('review')
    expect(reasonsOf(shadowedGlobal, declared('interface Error'))).toEqual([
      {
        kind: 'outside-whitelist',
        why: '新增的名字 `Error` 在文件作用域里已经解析到已有符号（typescript/lib/lib.es5.d.ts）',
      },
    ])
    // A name that is new on every count (entry exports, file scope, lib globals) stays additive.
    const fresh = classifyDists(star, {
      ...star,
      'index.d.ts': "export * from './a.js';\nexport interface Bar { y: number }\n",
    })
    expect(fresh).toEqual({
      change: 'additive',
      differences: [{ target: exported('Bar'), kind: 'added', change: 'additive' }],
    })
  })

  it('whitelist (a) fails closed: a name whose old-side resolution is unknown is outside the whitelist', () => {
    const before = [{ path: 'index.d.ts', code: 'export interface A { a: string }\n' }]
    const after = [
      {
        path: 'index.d.ts',
        code: 'export interface A { a: string }\nexport interface B { b: string }\n',
      },
    ]
    const resolved = (kind: 'free' | 'unknown') =>
      whitelistDifferences(before, after, {
        exported: new Map(),
        resolve: () => (kind === 'free' ? { kind } : { kind, why: '旧侧程序建不起来' }),
      })
    expect(resolved('unknown')).toEqual({
      global: [],
      outside: [
        {
          path: 'index.d.ts',
          statement: 'interface B',
          change: 'added',
          why: '新增的名字 `B` 在旧侧判断不了是否重名：旧侧程序建不起来',
        },
      ],
      changed: new Set(),
    })
    expect(resolved('free').outside).toEqual([])
  })

  it('`export as namespace` declares a UMD global name: adding, removing or renaming it is global scope', () => {
    const member = 'export interface Foo { x: string }\n'
    const umd = (name: string) => `${member}export as namespace ${name};\n`
    const why = '`export as namespace` 声明 UMD 全局名，属于全局作用域'
    expect(classifyDists(member, umd('FooLib')).differences).toEqual([
      {
        target: declared('export as namespace FooLib;'),
        kind: 'added',
        change: 'review',
        reasons: [{ kind: 'global-scope-change', why }],
      },
    ])
    const renamed = classifyDists(umd('FooLib'), umd('BarLib'))
    expect(renamed.change).toBe('review')
    expect(reasonKinds(renamed)).toEqual(['global-scope-change'])
    expect(classifyDists(umd('FooLib'), member).change).toBe('review')
    expect(classifyDists(umd('FooLib'), umd('FooLib')).change).toBe('none')
  })

  it("any change inside an augmentation of the member's own module is outside the whitelist, even a new optional property", () => {
    const files = (members: string) => ({
      'index.d.ts': "export * from './a.js';\nimport './b.js';\n",
      'a.d.ts': 'export interface Foo { x: string }\n',
      'b.d.ts': `declare module './a.js' { interface Foo { ${members} } }\nexport {};\n`,
    })
    const result = classifyDists(files('y?: string'), files('y?: string; z?: number'))
    expect(result.change).toBe('review')
    expect(reasonsOf(result, declared("module './a.js'", 'b.d.ts'))).toEqual([
      { kind: 'outside-whitelist', why: '对本成员模块的扩充块内有改动，它合并进别的文件里的声明' },
    ])
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

  it('augmentations of other modules and of global are review as a whole, with no checker verdicts', () => {
    const journal = (members: string) =>
      `export interface Journal { open(): void }\ndeclare module 'x' {\n    interface Context {\n${members}\n    }\n}\n`
    const changed = { kind: 'global-scope-change', why: '对全局或外部模块的扩充变了' }
    // Formerly additive after a merged comparison: an optional member added to an augmented interface.
    expect(
      classifyDists(
        journal('        journal: Journal;'),
        journal('        journal: Journal;\n        clock?: Journal;'),
      ).differences,
    ).toEqual([
      { target: declared("module 'x'"), kind: 'changed', change: 'review', reasons: [changed] },
    ])
    expect(
      classifyDists(
        journal('        journal: Journal;'),
        journal('        journal: Journal;\n        clock: Journal;'),
      ).differences,
    ).toEqual([
      { target: declared("module 'x'"), kind: 'changed', change: 'review', reasons: [changed] },
    ])
    expect(
      classifyDists(
        'export {};\ndeclare global {\n    var hook: (a: string) => void;\n}\n',
        'export {};\ndeclare global {\n    var hook: (a: number) => void;\n}\n',
      ).differences,
    ).toEqual([
      { target: declared('global'), kind: 'changed', change: 'review', reasons: [changed] },
    ])
    // New blocks: optional-only, required and generic alike.
    for (const block of [
      'declare global {\n    interface Reg<T extends { a: string } = { a: string }> { x?: T }\n}\n',
      'declare global {\n    interface Reg { x: string }\n}\n',
      'declare global {\n    interface Reg<T extends { a: string }> { x?: T }\n}\n',
    ]) {
      expect(classifyDists('export {};\n', 'export {};\n' + block).differences).toEqual([
        {
          target: declared('global'),
          kind: 'added',
          change: 'review',
          reasons: [{ kind: 'global-scope-change', why: '对全局或外部模块的扩充新增了' }],
        },
      ])
    }
    // Unchanged augmentations next to a module-scope change: the checker runs with both sides restored.
    const grow = (fixed: string) =>
      classifyDists(
        `${fixed}\nexport interface O { a: string }\n`,
        `${fixed}\nexport interface O { a: string; b?: number }\n`,
      )
    expect(grow(journal('        journal: Journal;')).change).toBe('additive')
    expect(
      grow('export {};\ndeclare global {\n    var hook: (a: string) => void;\n}\n').change,
    ).toBe('additive')
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
    // Recorded snapshots whose declarations import a package that this checkout does not have.
    // Both sides share the import edge; the only edit is a module-scope optional property, so the checker runs.
    const base = snapshotOf({ 'index.d.ts': 'export interface A { q: 1 }\n' })
    const withCode = (code: string) => ({
      ...base,
      files: base.files.map(file => ({ ...file, code })),
    })
    const before = withCode(
      "import type { Q } from '@fixture/missing';\nexport interface A { q: Q }",
    )
    const after = withCode(
      "import type { Q } from '@fixture/missing';\nexport interface A { q: Q; b?: number }",
    )
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
        details: expect.arrayContaining([expect.stringContaining('TS2307')]),
      }),
    ])
  })
})
