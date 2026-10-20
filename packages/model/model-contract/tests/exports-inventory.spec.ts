import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  compareAugmentations,
  compareEntries,
  blockDeclaredNames,
  declaredNames,
  isClean,
  navigationProblems,
  publicApiChapters,
  sameAsProblems,
  type Inventory,
  type InventoryName,
} from './exports-inventory.ts'

// The comparison is the measuring instrument for the export inventory. These cases build tiny declaration files
// that break one rule each and assert that the instrument reports exactly that rule.
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'exports-inventory-')))
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

  it('lets a pending augmentation land members, and only exactly the landed ones', () => {
    const landed = (names: string[]) => {
      const base = augmentation(['x/changed', 'y/changed'], true)
      return {
        ...base,
        augmentations: [{ ...base.augmentations[0]!, landed: names }],
      }
    }
    expect(compareAugmentations(landed(['x/changed']), declarations)).toEqual([])
    expect(compareAugmentations(landed([]), declarations)).toHaveLength(1)
    expect(compareAugmentations(landed(['x/changed', 'y/changed']), declarations)).toHaveLength(1)
  })

  it('rejects a landed name that is not a member of the augmentation', () => {
    const base = augmentation(['x/other'], true)
    const misnamed = {
      ...base,
      augmentations: [{ ...base.augmentations[0]!, landed: ['x/changed'] }],
    }
    expect(compareAugmentations(misnamed, declarations)).toEqual([
      'host Events: landed x/changed are not listed in members',
    ])
  })
})

describe('declaredNames', () => {
  it('counts exported declarations and a name that an export statement introduces, not a plain re-export', () => {
    const source = [
      "import type { Dep } from 'dep'",
      'declare const hidden: unique symbol',
      'export type A<P> = Dep<P>',
      'export declare class B<P> extends Base {}',
      'export abstract class C {}',
      'export const d = 1, e = 2',
      'export function f(): void',
      'export interface G {}',
      'type Local = 1',
      'export { Local as Renamed }',
      "export type { Origin as Alias, Same } from './elsewhere'",
      "declare module 'host' { interface Context { x: 1 } }",
    ].join('\n')
    expect(declaredNames(source)).toEqual(['A', 'B', 'C', 'd', 'e', 'f', 'G', 'Renamed', 'Alias'])
  })
})

describe('blockDeclaredNames', () => {
  it('counts a top-level declaration with or without export, and not a name inside a body', () => {
    const source = [
      'type A = 1',
      'export interface B {}',
      'declare class C {}',
      'function d(): void { const inner = 1 }',
      'let e = 1, f = 2',
      'enum G {}',
      'export { A as Renamed }',
      "declare module 'host' { interface Context { x: 1 } }",
    ].join('\n')
    expect(blockDeclaredNames(source).sort()).toEqual(
      ['A', 'B', 'C', 'G', 'Renamed', 'd', 'e', 'f'].sort(),
    )
  })
})

describe('publicApiChapters', () => {
  it('reads the file links and the declared block names of each chapter, exported or not, and skips other fences', () => {
    const page = [
      '# Title',
      '[intro](../src/intro.ts)',
      '## First',
      'Source: [`src/a.ts`](../src/a.ts#top), [site](https://example.com/x.ts), [anchor](#local).',
      '```json',
      '{ "export": true }',
      '[not a link](../src/ignored.ts)',
      '## Not a heading',
      '```',
      '```ts',
      'export type Again = 1',
      '```',
      '## Second',
      '[`src/b.ts`](../src/b.ts)',
      '```typescript',
      'const quiet = 1',
      '```',
    ].join('\n')
    expect(publicApiChapters(page)).toEqual(
      new Map([
        ['', { links: ['../src/intro.ts'], blockNames: [] }],
        ['First', { links: ['../src/a.ts'], blockNames: ['Again'] }],
        ['Second', { links: ['../src/b.ts'], blockNames: ['quiet'] }],
      ]),
    )
  })
})

describe('navigationProblems', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'navigation-')))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const write = (name: string, text: string) => {
    mkdirSync(join(root, name, '..'), { recursive: true })
    writeFileSync(join(root, name), text)
  }
  write('src/a.ts', 'export type A = 1\nexport type B = 2')
  write('src/b.ts', 'export type J = 1\nexport { A } from "./a.ts"')
  write('tests/a.spec-d.ts', 'export {}')
  const inventory = (chapters: Record<string, string[]>): Inventory => ({
    package: 'fixture',
    source: 'test',
    expectedPending: 0,
    augmentations: [],
    entries: {
      '.': {
        chapters: Object.entries(chapters).map(([title, names]) => ({
          title,
          names: names.map(name => type(name)),
        })),
      },
    },
  })
  const problemsOf = (markdown: string, chapters: Record<string, string[]>) =>
    navigationProblems(inventory(chapters), publicApiChapters(markdown), root, join(root, 'docs'))
  const page = [
    '## First',
    '[a](../src/a.ts), [probe](../tests/a.spec-d.ts)',
    '## Second',
    '[b](../src/b.ts)',
  ].join('\n')

  it('accepts a page whose chapters link the files that declare their names', () => {
    expect(problemsOf(page, { First: ['A', 'B'], Second: ['J'] })).toEqual([])
  })

  it('reports a chapter that does not link the file that declares one of its names', () => {
    expect(problemsOf(page, { First: ['A', 'J'], Second: ['J'] })).toEqual([
      'First: no linked source file declares J',
    ])
  })

  it('does not accept a plain re-export as the declaration', () => {
    expect(problemsOf(page, { First: ['A'], Second: ['A'] })).toEqual([
      'Second: no linked source file declares A',
    ])
  })

  it('reports a listed chapter that links no source file, and one that the page lacks', () => {
    expect(
      problemsOf('## First\nprose only\n## Second\n[b](../src/b.ts)', {
        First: ['A'],
        Second: ['J'],
        Third: ['K'],
      }),
    ).toEqual([
      'First: links no source file under src/',
      'chapter "Third" is in the inventory, not in the page',
    ])
  })

  it('reports a link to a source or test file that does not exist, also when another link is valid', () => {
    expect(
      problemsOf(
        '## First\n[a](../src/a.ts), [old](../src/old.ts), [gone](../tests/gone.spec-d.ts)',
        {
          First: ['A'],
        },
      ),
    ).toEqual([
      'First: links ../src/old.ts, which does not exist',
      'First: links ../tests/gone.spec-d.ts, which does not exist',
    ])
  })

  const blockProblems = (block: string) =>
    problemsOf(`## First\n[a](../src/a.ts)\n## Extra\n${block}`, { First: ['A', 'B'] })

  it('reports an exported declaration of a listed name, even in a chapter that the inventory lacks', () => {
    expect(blockProblems('```ts\nexport type A = 1\n```')).toEqual([
      'Extra: a code block declares A again; the source is the only declaration',
    ])
  })

  it('reports a declaration without export, whatever its keyword', () => {
    for (const declaration of [
      'type A = 1',
      'interface A {}',
      'class A {}',
      'function A(): void {}',
      'const A = 1',
      'let A = 1',
      'enum A {}',
      'declare const A: 1',
      'declare function A(): void',
    ])
      expect(blockProblems(`\`\`\`ts\n${declaration}\n\`\`\``), declaration).toEqual([
        'Extra: a code block declares A again; the source is the only declaration',
      ])
  })

  it('reads every TypeScript fence label, not only ts', () => {
    for (const label of ['typescript', 'tsx', 'mts', 'cts', 'TS'])
      expect(blockProblems(`\`\`\`${label}\ntype B = 2\n\`\`\``), label).toEqual([
        'Extra: a code block declares B again; the source is the only declaration',
      ])
  })

  it('leaves alone a name that the inventory does not list, and a fence that is not TypeScript', () => {
    expect(blockProblems('```ts\ntype Helper = 1\nconst sample = 2\n```')).toEqual([])
    expect(blockProblems('```json\ntype A = 1\n```')).toEqual([])
    expect(blockProblems('```\ntype A = 1\n```')).toEqual([])
  })

  it('reads a fence that a list item indents, and a tilde fence', () => {
    const again = 'Extra: a code block declares A again; the source is the only declaration'
    expect(blockProblems('- item\n\n  ```ts\n  type A = 1\n  ```')).toEqual([again])
    expect(blockProblems('   ```typescript\n   type A = 1\n   ```')).toEqual([again])
    expect(blockProblems('~~~ts\ntype A = 1\n~~~')).toEqual([again])
    expect(blockProblems('- item\n\n  ~~~tsx\n  type A = 1\n  ~~~')).toEqual([again])
  })

  it('closes a fence only with its own character and at least as many of it', () => {
    const again = 'Extra: a code block declares A again; the source is the only declaration'
    // A stray fence line is content of the block that holds it, and TypeScript reads it as an
    // expression that declares nothing; so the declaration sits in a second block, which is read
    // as a block only when the first one was closed by the right line.
    const declaring = '```ts\ntype A = 1\n```'
    // A tilde line does not close a backtick fence.
    expect(blockProblems(`\`\`\`ts\n~~~\n\`\`\`\n${declaring}`)).toEqual([again])
    // A backtick line does not close a tilde fence.
    expect(blockProblems(`~~~ts\n\`\`\`\n~~~\n${declaring}`)).toEqual([again])
    // A shorter fence does not close a longer one.
    expect(blockProblems(`\`\`\`\`ts\n\`\`\`\n\`\`\`\`\n${declaring}`)).toEqual([again])
    // A longer fence closes a shorter one.
    expect(blockProblems(`\`\`\`ts\ntype B = 1\n\`\`\`\`\n${declaring}`)).toEqual([
      'Extra: a code block declares B again; the source is the only declaration',
      again,
    ])
  })
})
