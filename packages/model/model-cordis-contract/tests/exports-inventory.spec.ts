import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  chapterProblems,
  compareAugmentations,
  compareEntries,
  isClean,
  publicApiChapters,
  sameAsProblems,
  type Inventory,
  type InventoryName,
} from './exports-inventory.ts'

// The comparison is the measuring instrument for AC-G1-1. These cases build tiny declaration files
// that break one rule each and assert that the instrument reports exactly that rule.
const directory = mkdtempSync(join(tmpdir(), 'exports-inventory-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

function build(files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(directory, name, '..'), { recursive: true })
    writeFileSync(join(directory, name), text)
  }
}

function inventoryOf(names: readonly InventoryName[], entry = '.'): Inventory {
  return {
    package: 'fixture',
    source: 'test',
    expectedPending: names.filter(item => item.pending).length,
    entries: { [entry]: { chapters: [{ title: 'one', names }] } },
    augmentations: [],
  }
}

const type = (name: string, pending = false): InventoryName => ({ name, kind: 'type', pending })

describe('compareEntries', () => {
  build({
    'a.d.ts':
      'export type Hidden = string\nexport declare const key: "k"\nexport declare class Box {}\n',
    'index.d.ts': "export * from './a.js'\nexport type Own = number\n",
  })
  const declarations = { '.': join(directory, 'index.d.ts') }
  const run = (names: readonly InventoryName[]) =>
    compareEntries(inventoryOf(names), declarations)[0]!

  it('sees names behind export-star and accepts an exact match', () => {
    const result = run([
      type('Hidden'),
      { name: 'key', kind: 'value', pending: false },
      { name: 'Box', kind: 'class', pending: false },
      type('Own'),
    ])
    expect(isClean(result)).toBe(true)
  })

  it('reports a non-pending name that is not built', () => {
    const result = run([
      type('Hidden'),
      type('Own'),
      type('Gone'),
      { name: 'key', kind: 'value', pending: false },
      { name: 'Box', kind: 'class', pending: false },
    ])
    expect(result.missing).toEqual(['Gone'])
  })

  it('reports an export that the inventory does not list', () => {
    const result = run([
      type('Hidden'),
      type('Own'),
      { name: 'key', kind: 'value', pending: false },
    ])
    expect(result.extra).toEqual(['Box'])
  })

  it('reports a pending flag that is already built, and skips a pending name that is absent', () => {
    const result = run([
      type('Hidden', true),
      type('Own'),
      type('Later', true),
      { name: 'key', kind: 'value', pending: false },
      { name: 'Box', kind: 'class', pending: false },
    ])
    expect(result.stalePending).toEqual(['Hidden'])
    expect(result.missing).toEqual([])
    expect(result.pending).toBe(2)
  })

  it('reports a value listed as a type', () => {
    const result = run([
      type('Hidden'),
      type('Own'),
      type('key'),
      { name: 'Box', kind: 'class', pending: false },
    ])
    expect(result.kindMismatch).toEqual(['key: type listed, value built'])
  })

  it('reports a re-export that is another declaration than the owning entry', () => {
    build({
      'sub.d.ts': 'export type Own = string\n',
      'root.d.ts': 'export type Own = number\n',
    })
    const inventory: Inventory = {
      package: 'fixture',
      source: 'test',
      expectedPending: 0,
      entries: {
        '.': { chapters: [{ title: 'one', names: [type('Own')] }] },
        './sub': { chapters: [{ title: 'one', names: [{ ...type('Own'), sameAs: '.' }] }] },
      },
      augmentations: [],
    }
    const result = compareEntries(inventory, {
      '.': join(directory, 'root.d.ts'),
      './sub': join(directory, 'sub.d.ts'),
    })
    expect(result[1]!.notSameDeclaration).toEqual(['Own'])
  })
})

describe('sameAsProblems', () => {
  const entries = (root: readonly InventoryName[], sub: readonly InventoryName[]): Inventory => ({
    package: 'fixture',
    source: 'test',
    expectedPending: 0,
    entries: {
      '.': { chapters: [{ title: 'one', names: root }] },
      './sub': { chapters: [{ title: 'one', names: sub }] },
    },
    augmentations: [],
  })
  const again = (name: string, kind: InventoryName['kind'] = 'type'): InventoryName => ({
    name,
    kind,
    pending: false,
    sameAs: '.',
  })

  it('accepts a re-export that the owning entry lists with the same kind', () => {
    expect(sameAsProblems(entries([type('Own')], [again('Own')]))).toEqual([])
  })

  it('names a re-export that the owning entry does not list', () => {
    expect(sameAsProblems(entries([type('Other')], [again('Own')]))).toEqual([
      './sub: Own is sameAs ., which does not list it',
    ])
  })

  it('names a re-export whose kind differs from the owner', () => {
    expect(sameAsProblems(entries([type('Own')], [again('Own', 'value')]))).toEqual([
      './sub: Own is value, but . lists it as type',
    ])
  })

  it('names a sameAs that points at no entry', () => {
    const stray: InventoryName = { ...type('Own'), sameAs: './missing' }
    expect(sameAsProblems(entries([type('Own')], [stray]))).toEqual([
      './sub: Own is sameAs ./missing, which is not an entry',
    ])
  })
})

describe('compareAugmentations', () => {
  build({
    'aug.d.ts':
      "declare module 'host' {\n  interface Events {\n    'x/changed'(a: string): void\n  }\n}\nexport {}\n",
  })
  const declarations = { '.': join(directory, 'aug.d.ts') }
  const augmentation = (members: string[], pending: boolean) => ({
    ...inventoryOf([]),
    augmentations: [{ module: 'host', interface: 'Events', members, pending }],
  })

  it('accepts matching members and rejects a different set', () => {
    expect(compareAugmentations(augmentation(['x/changed'], false), declarations)).toEqual([])
    expect(compareAugmentations(augmentation(['y/changed'], false), declarations)).toHaveLength(1)
  })

  it('rejects a pending augmentation that is already built', () => {
    expect(compareAugmentations(augmentation(['x/changed'], true), declarations)).toHaveLength(1)
  })
})

describe('public-api page against the inventory', () => {
  const page = [
    '# Title',
    '```ts',
    'export type Outside = string',
    '```',
    '## First',
    'prose',
    '```ts',
    "import type { Dep } from 'dep'",
    'declare const hidden: unique symbol',
    'export type A<P> = Dep<P>',
    'export declare class B<P> extends Base {}',
    'export abstract class C {}',
    'export const d = 1, e = 2',
    'export function f(): void',
    'export interface G {}',
    "declare module 'host' { interface Context { x: 1 } }",
    '```',
    '```ts',
    'export { h, type I } from "./elsewhere"',
    '```',
    '## Prose only',
    '```json',
    '{ "export": true }',
    '```',
    '## Second',
    '```ts',
    'export type J = 1',
    '```',
  ].join('\n')

  it('reads chapters with a ts block and the names they export', () => {
    expect(publicApiChapters(page)).toEqual(
      new Map([
        ['', ['Outside']],
        ['First', ['A', 'B', 'C', 'd', 'e', 'f', 'G', 'h', 'I']],
        ['Second', ['J']],
      ]),
    )
  })

  const docs = new Map([
    ['First', ['A', 'B']],
    ['Second', ['J']],
  ])
  const inventory = (chapters: Record<string, (string | [string, string])[]>): Inventory => ({
    package: 'fixture',
    source: 'test',
    expectedPending: 0,
    augmentations: [],
    entries: {
      '.': {
        chapters: Object.entries(chapters).map(([title, names]) => ({
          title,
          names: names.map(item =>
            typeof item === 'string' ? type(item) : { ...type(item[0]), origin: item[1] },
          ),
        })),
      },
    },
  })

  it('accepts an exact match and names that only a ruling has adopted', () => {
    expect(
      chapterProblems(inventory({ First: ['A', 'B', ['Adopted', 'R-3']], Second: ['J'] }), docs),
    ).toEqual([])
  })

  it('reports a chapter that the inventory dropped, even when it is the whole chapter', () => {
    expect(chapterProblems(inventory({ First: ['A', 'B'] }), docs)).toEqual([
      'chapter "Second" is in the page, not in the inventory',
    ])
  })

  it('reports a name that the page has and the inventory lacks, and the reverse', () => {
    expect(chapterProblems(inventory({ First: ['A', 'Z'], Second: ['J'] }), docs)).toEqual([
      'First: page exports B, inventory lacks it',
      'First: inventory lists Z, page lacks it',
    ])
  })

  it('reports an inventory chapter that the page does not have', () => {
    expect(
      chapterProblems(inventory({ First: ['A', 'B'], Second: ['J'], Third: ['K'] }), docs),
    ).toEqual(['chapter "Third" is in the inventory, not in the page'])
  })
})
