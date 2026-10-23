import { afterEach, describe, expect, it } from 'vitest'
import { classifySnapshots, compareCode } from '../src/declarations/api-classify.ts'
import { snapshotOf } from './fixtures/contract-api.ts'
import { removeTemporaries } from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const BEFORE = [
  'export interface Request {',
  '    readonly id: string;',
  '    readonly options: Readonly<{ retries: number }>;',
  '    run(input: string): Promise<void>;',
  '}',
  "export type Reply = { kind: 'ok' } | { kind: 'failed'; reason: string };",
  'export declare function send(request: Request): Reply;',
  'export declare const LIMIT = 3;',
].join('\n')

const AUGMENT = (members: string) =>
  [
    'export interface Context {',
    '}',
    "declare module './index.ts' {",
    `    interface Context { ${members} }`,
    '}',
  ].join('\n')

/** 两份 dist 生成的快照之间的分类。 */
function classify(before: string, after: string) {
  return classifySnapshots(
    snapshotOf({ 'index.d.ts': before }),
    snapshotOf({ 'index.d.ts': after }),
  )
}

// Each case generates two snapshots from real TypeScript 6 programs.
describe('contract API change classes', { timeout: 60_000 }, () => {
  it('is none when only comments, layout or declaration order change', () => {
    const reordered = [
      'export declare const LIMIT = 3;',
      '/** Sends. */',
      'export declare function send(request: Request): Reply;',
      "export type Reply = { kind: 'ok' } | { kind: 'failed'; reason: string }",
      'export interface Request { readonly id: string; readonly options: Readonly<{ retries: number }>; run(input: string): Promise<void> }',
    ].join('\n')
    expect(classify(BEFORE, reordered)).toEqual({ change: 'none', items: [] })
  })

  it('is additive for a new export, new optional members and a new entry', () => {
    expect(classify(BEFORE, `${BEFORE}\nexport type Extra = number;`)).toEqual({
      change: 'additive',
      items: [{ section: '入口 `.`', item: '`Extra`', kind: 'added', change: 'additive' }],
    })
    const optional = BEFORE.replace(
      '    readonly id: string;',
      '    readonly id: string;\n    readonly note?: string;\n    cancel?(): void;',
    )
    expect(classify(BEFORE, optional).change).toBe('additive')
    const nested = BEFORE.replace('{ retries: number }', '{ retries: number; delay?: number }')
    expect(classify(BEFORE, nested).change).toBe('additive')
    const entry = classifySnapshots(
      snapshotOf({ 'index.d.ts': BEFORE }),
      snapshotOf(
        { 'index.d.ts': BEFORE, 'more.d.ts': 'export type More = 1;' },
        { '.': 'index.d.ts', './more': 'more.d.ts' },
      ),
    )
    expect(entry.change).toBe('additive')
    expect(
      classify(AUGMENT('files: string'), AUGMENT('files: string; extra?: number')).change,
    ).toBe('additive')
  })

  it('is review for a removed export, a changed signature or a new required member', () => {
    const removed = classify(BEFORE, BEFORE.replace('export declare const LIMIT = 3;', ''))
    expect(removed).toEqual({
      change: 'review',
      items: [{ section: '入口 `.`', item: '`LIMIT`', kind: 'removed', change: 'review' }],
    })
    const signature = BEFORE.replace(
      'send(request: Request): Reply',
      'send(request: Request, force: boolean): Reply',
    )
    expect(classify(BEFORE, signature)).toEqual({
      change: 'review',
      items: [{ section: '入口 `.`', item: '`send`', kind: 'changed', change: 'review' }],
    })
    const required = BEFORE.replace(
      '    readonly id: string;',
      '    readonly id: string;\n    readonly tenant: string;',
    )
    expect(classify(BEFORE, required).change).toBe('review')
    const nestedRequired = BEFORE.replace(
      '{ retries: number }',
      '{ retries: number; delay: number }',
    )
    expect(classify(BEFORE, nestedRequired).change).toBe('review')
    // Further shapes the table in docs/engineering/integration.md counts as breaking one side.
    expect(
      classify(BEFORE, BEFORE.replace('readonly id: string', 'readonly id?: string')).change,
    ).toBe('review')
    expect(
      classify(BEFORE, BEFORE.replace("{ kind: 'ok' } |", "{ kind: 'ok' } | { kind: 'late' } |"))
        .change,
    ).toBe('review')
    expect(classify(BEFORE, BEFORE.replace('LIMIT = 3', 'LIMIT = 4')).change).toBe('review')
    expect(classify(AUGMENT('files: string'), AUGMENT('files: string; extra: number')).change).toBe(
      'review',
    )
    expect(classify(AUGMENT('files: string'), AUGMENT('')).change).toBe('review')
  })

  it('treats a missing snapshot on either side as a whole-member addition or removal', () => {
    const text = snapshotOf({ 'index.d.ts': BEFORE })
    expect(classifySnapshots(undefined, text).change).toBe('additive')
    expect(classifySnapshots(text, undefined).change).toBe('review')
    expect(classifySnapshots(undefined, undefined).change).toBe('none')
  })

  it('compares overloads in order and type parameters as part of the head', () => {
    const one = 'function f(a: string): void;\nfunction f(a: number): void;'
    expect(compareCode(one, 'function f(a: string): void;\n\nfunction f(a: number): void;')).toBe(
      'none',
    )
    // Overload order decides which signature a call resolves to.
    expect(compareCode(one, 'function f(a: number): void;\nfunction f(a: string): void;')).toBe(
      'review',
    )
    expect(compareCode(one, `${one}\nfunction f(a: boolean): void;`)).toBe('review')
    expect(compareCode('interface A<T> {\n    a: T;\n}', 'interface A<T, U> {\n    a: T;\n}')).toBe(
      'review',
    )
    expect(
      compareCode('interface A {\n    a: string;\n}', 'interface A extends B {\n    a: string;\n}'),
    ).toBe('review')
  })
})
