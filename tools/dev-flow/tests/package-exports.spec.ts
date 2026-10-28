// @module-tag slow
// Slow: builds declarations in temporary packages, runs the TypeScript checker on them (ts.createProgram) and starts the CLI as a child process. File total 9.3 s / 30.3 s on the two fast-tier ledgers (dcffba381 / 77d603dac); tagging its slowest case alone still leaves 7.3 s / 24.8 s, over the 10 s file line, and two cases reached 5.4 s and 5.5 s against the 5 s timeout (tools/test-runner/README_ZH.md「归层」).
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { checkPackageExports } from '../src/package-exports/check.ts'
import {
  compareAugmentations,
  compareEntries,
  isClean,
} from '../src/package-exports/declarations.ts'
import {
  decodeInventory,
  inventoryProblems,
  type Inventory,
  type InventoryName,
} from '../src/package-exports/inventory.ts'
import {
  blockDeclaredNames,
  declaredNames,
  navigationProblems,
  publicApiChapters,
} from '../src/package-exports/page.ts'

// The check is the measuring instrument for every package that keeps an export inventory. Each case
// builds a tiny package or declaration file that breaks one rule and asserts that exactly that rule
// is reported, so a weakened instrument turns a case red.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const cli = join(repo, 'tools/dev-flow/src/package-exports/cli.ts')
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'package-exports-')))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

function build(root: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true })
    writeFileSync(join(root, name), text)
  }
}

const type = (name: string, pending = false): InventoryName => ({ name, kind: 'type', pending })
const value = (name: string): InventoryName => ({ name, kind: 'value', pending: false })

function inventoryOf(names: readonly InventoryName[], entry = '.'): Inventory {
  return {
    package: 'fixture',
    source: 'docs/public-api.md',
    expectedPending: names.filter(item => item.pending).length,
    entries: { [entry]: { chapters: [{ title: 'one', names }] } },
    augmentations: [],
  }
}

describe('compareEntries', () => {
  build(directory, {
    'a.d.ts':
      'export type Hidden = string\nexport declare const key: "k"\nexport declare class Box {}\n',
    'index.d.ts': "export * from './a.js'\nexport type Own = number\n",
  })
  const declarations = { '.': join(directory, 'index.d.ts') }
  const run = (names: readonly InventoryName[]) =>
    compareEntries(inventoryOf(names), declarations)[0]!
  const exact = [
    type('Hidden'),
    value('key'),
    { name: 'Box', kind: 'class', pending: false },
    type('Own'),
  ] as const

  it('sees names behind export-star and accepts an exact match', () => {
    expect(isClean(run(exact))).toBe(true)
  })

  it('reports a non-pending name that is not built', () => {
    expect(run([...exact, type('Gone')]).missing).toEqual(['Gone'])
  })

  it('reports an export that the inventory does not list', () => {
    expect(run(exact.filter(item => item.name !== 'Box')).extra).toEqual(['Box'])
  })

  it('reports a pending flag that is already built, and skips a pending name that is absent', () => {
    const result = run([type('Hidden', true), ...exact.slice(1), type('Later', true)])
    expect(result.stalePending).toEqual(['Hidden'])
    expect(result.missing).toEqual([])
    expect(result.pending).toBe(2)
  })

  it('reports a value listed as a type', () => {
    expect(run([type('Hidden'), type('key'), exact[2], type('Own')]).kindMismatch).toEqual([
      'key: type listed, value built',
    ])
  })

  it('tells a name that is both a value and a type, and a type-only re-export of a value', () => {
    build(directory, {
      'both.d.ts':
        "export declare const Pair: 1\nexport type Pair = 1\nexport declare function run(): void\nexport type { run as runType } from './both.js'\n",
    })
    const result = compareEntries(
      inventoryOf([{ name: 'Pair', kind: 'both', pending: false }, value('run'), type('runType')]),
      { '.': join(directory, 'both.d.ts') },
    )[0]!
    expect(isClean(result), JSON.stringify(result)).toBe(true)
    const wrong = compareEntries(inventoryOf([type('Pair'), value('run'), value('runType')]), {
      '.': join(directory, 'both.d.ts'),
    })[0]!
    expect(wrong.kindMismatch).toEqual([
      'Pair: type listed, both built',
      'runType: value listed, type built',
    ])
  })

  it('accepts a named type-only projection of a class from another entry', () => {
    build(directory, {
      'owner.d.ts': 'export declare class Box {}\n',
      'projection.d.ts': "export type { Box } from './owner.js'\n",
    })
    const inventory: Inventory = {
      ...inventoryOf([]),
      entries: {
        '.': {
          chapters: [{ title: 'Root', names: [{ name: 'Box', kind: 'class', pending: false }] }],
        },
        './sub': { chapters: [{ title: 'Sub', names: [{ ...type('Box'), sameAs: '.' }] }] },
      },
    }
    expect(inventoryProblems(inventory, ['.', './sub'])).toEqual([])
    expect(
      compareEntries(inventory, {
        '.': join(directory, 'owner.d.ts'),
        './sub': join(directory, 'projection.d.ts'),
      }).every(isClean),
    ).toBe(true)
  })

  it('refuses type-only star exports instead of claiming runtime exports', () => {
    build(directory, {
      'owner.d.ts': 'export declare class Box {}\n',
      'projection.d.ts': "export type * from './owner.js'\n",
    })
    expect(() =>
      compareEntries(inventoryOf([type('Box')]), {
        '.': join(directory, 'projection.d.ts'),
      }),
    ).toThrow('type-only star exports are not supported')
  })

  it('permits imported dependency types without inspecting unrelated dependency exports', () => {
    build(directory, {
      'owner.d.ts': 'export declare class Box {}\n',
      'dependency.d.ts': "export type * from './owner.js'\n",
      'consumer.d.ts':
        "import type { Box } from './dependency.js'\nexport interface Consumer { box: Box }\n",
    })
    expect(
      compareEntries(inventoryOf([type('Consumer')]), {
        '.': join(directory, 'consumer.d.ts'),
      }).every(isClean),
    ).toBe(true)
  })

  it('still refuses type-only stars forwarded through a re-export chain', () => {
    build(directory, {
      'owner.d.ts': 'export declare class Box {}\n',
      'dependency.d.ts': "export type * from './owner.js'\n",
      'consumer.d.ts': "export * from './dependency.js'\n",
    })
    expect(() =>
      compareEntries(inventoryOf([type('Box')]), {
        '.': join(directory, 'consumer.d.ts'),
      }),
    ).toThrow('type-only star exports are not supported')
  })

  it('reports a re-export that is another declaration than the owning entry', () => {
    build(directory, {
      'sub.d.ts': 'export type Own = string\n',
      'root.d.ts': 'export type Own = number\n',
    })
    const inventory: Inventory = {
      ...inventoryOf([type('Own')]),
      entries: {
        '.': { chapters: [{ title: 'one', names: [type('Own')] }] },
        './sub': { chapters: [{ title: 'one', names: [{ ...type('Own'), sameAs: '.' }] }] },
      },
    }
    const result = compareEntries(inventory, {
      '.': join(directory, 'root.d.ts'),
      './sub': join(directory, 'sub.d.ts'),
    })
    expect(result[1]!.notSameDeclaration).toEqual(['Own'])
  })

  it('resolves a sameAs that names another package and checks the declaration is that one', () => {
    const root = join(directory, 'foreign')
    build(root, {
      'node_modules/dep/package.json': JSON.stringify({
        name: 'dep',
        type: 'module',
        exports: { '.': { types: './index.d.ts' } },
      }),
      'node_modules/dep/index.d.ts': 'export type Shared = { a: 1 }\nexport type Other = 2\n',
      'package.json': JSON.stringify({ name: 'host', type: 'module' }),
      'dist/index.d.ts': "export type { Shared } from 'dep'\nexport type Other = 3\n",
    })
    const inventory = inventoryOf([
      { ...type('Shared'), sameAs: 'dep' },
      { ...type('Other'), sameAs: 'dep' },
    ])
    const result = compareEntries(inventory, { '.': join(root, 'dist/index.d.ts') })[0]!
    expect(result.notSameDeclaration).toEqual(['Other'])
    expect(result.missing).toEqual([])
  })
})

describe('compareAugmentations', () => {
  const root = join(directory, 'augmenting')
  build(root, {
    'dist/blocks.d.ts':
      "declare module 'host' {\n  interface Events {\n    'x/changed'(a: string): void\n  }\n}\nexport type Unrelated = 1\n",
    'dist/index.d.ts': "export * from './blocks.js'\n",
  })
  const declarations = { '.': join(root, 'dist/index.d.ts') }
  const augmentation = (members: string[], pending: boolean, landed?: string[]): Inventory => ({
    ...inventoryOf([type('Unrelated')]),
    augmentations: [
      {
        module: 'host',
        interface: 'Events',
        members,
        pending,
        ...(landed === undefined ? {} : { landed }),
      },
    ],
  })

  it('reads an augmentation that a non-entry module carries, and rejects a different set', () => {
    expect(compareAugmentations(augmentation(['x/changed'], false), declarations, root)).toEqual([])
    expect(compareAugmentations(augmentation(['y/changed'], false), declarations, root)).toEqual([
      'host Events: built members x/changed differ from the inventory',
    ])
  })

  it('reports a built augmentation that the inventory does not list', () => {
    expect(compareAugmentations(inventoryOf([type('Unrelated')]), declarations, root)).toEqual([
      'host Events: built augmentation the inventory does not list',
    ])
  })

  it('rejects a pending augmentation that is already built, and accepts exactly the landed members', () => {
    expect(
      compareAugmentations(augmentation(['x/changed'], true), declarations, root),
    ).toHaveLength(1)
    expect(
      compareAugmentations(
        augmentation(['x/changed', 'y/changed'], true, ['x/changed']),
        declarations,
        root,
      ),
    ).toEqual([])
    expect(
      compareAugmentations(
        augmentation(['x/changed', 'y/changed'], true, ['x/changed', 'y/changed']),
        declarations,
        root,
      ),
    ).toHaveLength(1)
  })
})

describe('decodeInventory and inventoryProblems', () => {
  it('reports each malformed field instead of accepting the record', () => {
    const decoded = decodeInventory({
      package: 'p',
      source: 'docs/public-api.md',
      expectedPending: -1,
      entries: {
        '.': {
          chapters: [
            { title: 't', names: [{ name: 'A', kind: 'interface', pending: false, typo: 1 }] },
          ],
        },
      },
      augmentations: [],
    })
    expect(decoded).toEqual({
      kind: 'invalid',
      problems: [
        'inventory: expectedPending is not a non-negative integer',
        'entry . chapter 0 name 0: unknown field typo',
        'entry . chapter 0 name 0: kind is not one of type, value, class, both',
      ],
    })
  })

  it('compares the entry set with package.json and finds empty chapters, repeats and pending drift', () => {
    const inventory: Inventory = {
      ...inventoryOf([type('A'), type('A'), type('B', true)]),
      expectedPending: 0,
      entries: {
        '.': {
          chapters: [
            { title: 'one', names: [type('A'), type('A'), type('B', true)] },
            { title: 'two', names: [] },
          ],
        },
        './extra': { chapters: [{ title: 'one', names: [{ ...type('A'), sameAs: './missing' }] }] },
      },
    }
    expect(inventoryProblems(inventory, ['.', './testing'])).toEqual([
      'package.json exports ./testing, the inventory does not',
      'the inventory lists ./extra, package.json does not export it',
      '.: chapter "two" is empty',
      '.: A is listed twice',
      './extra: A is sameAs ./missing, which is not an entry',
      'expectedPending is 0, the inventory flags 1 names pending',
    ])
  })

  it('checks an own-entry re-export against the owner list and kind', () => {
    const entries = (sub: InventoryName): Inventory => ({
      ...inventoryOf([]),
      entries: {
        '.': { chapters: [{ title: 'one', names: [type('Own')] }] },
        './sub': { chapters: [{ title: 'one', names: [sub] }] },
      },
    })
    expect(inventoryProblems(entries({ ...type('Own'), sameAs: '.' }), ['.', './sub'])).toEqual([])
    expect(inventoryProblems(entries({ ...type('Gone'), sameAs: '.' }), ['.', './sub'])).toEqual([
      './sub: Gone is sameAs ., which does not list it',
    ])
    // Kind belongs to the actual export, not its owner: the built-entry check rejects
    // value projections of type-only declarations, while class -> type is legitimate.
    expect(inventoryProblems(entries({ ...value('Own'), sameAs: '.' }), ['.', './sub'])).toEqual([])
  })
})

describe('declaredNames and blockDeclaredNames', () => {
  it('counts exported declarations and a name that an export statement introduces, not a plain re-export', () => {
    const source = [
      "import type { Dep } from 'dep'",
      'export type A<P> = Dep<P>',
      'export declare class B<P> extends Base {}',
      'export const d = 1, e = 2',
      'export function f(): void',
      'export interface G {}',
      'type Local = 1',
      'export { Local as Renamed }',
      "export type { Origin as Alias, Same } from './elsewhere'",
      "declare module 'host' { interface Context { x: 1 } }",
    ].join('\n')
    expect(declaredNames(source)).toEqual(['A', 'B', 'd', 'e', 'f', 'G', 'Renamed', 'Alias'])
  })

  it('counts a top-level block declaration with or without export', () => {
    expect(
      blockDeclaredNames('type A = 1\nfunction d(): void { const inner = 1 }\nlet e = 1').sort(),
    ).toEqual(['A', 'd', 'e'])
  })
})

describe('navigationProblems', () => {
  const root = join(directory, 'navigation')
  build(root, {
    'src/a.ts': 'export type A = 1\nexport type B = 2',
    'src/b.ts': 'export type J = 1\nexport { A } from "./a.ts"',
  })
  const inventory = (chapters: Record<string, InventoryName[]>): Inventory => ({
    ...inventoryOf([]),
    entries: {
      '.': { chapters: Object.entries(chapters).map(([title, names]) => ({ title, names })) },
    },
  })
  const problemsOf = (markdown: string, chapters: Record<string, InventoryName[]>) =>
    navigationProblems(inventory(chapters), publicApiChapters(markdown), root, join(root, 'docs'))
  const page = '## First\n[a](../src/a.ts)\n### Second\n[b](../src/b.ts)'

  it('accepts chapters, also third-level ones, that link the files declaring their names', () => {
    expect(problemsOf(page, { First: [type('A'), type('B')], Second: [type('J')] })).toEqual([])
  })

  it('does not accept a plain re-export as the declaration, but skips a sameAs name', () => {
    expect(problemsOf(page, { First: [type('A')], Second: [type('A')] })).toEqual([
      'Second: no linked source file declares A',
    ])
    expect(
      problemsOf(page, { First: [type('A')], Second: [{ ...type('A'), sameAs: 'dep' }] }),
    ).toEqual([])
  })

  it('reports a missing chapter, a dead source link and a code block that declares a listed name', () => {
    expect(
      problemsOf('## First\n[a](../src/a.ts), [old](../src/old.ts)\n```ts\ntype B = 2\n```', {
        First: [type('A'), type('B')],
        Third: [type('K')],
      }),
    ).toEqual([
      'First: a code block declares B again; the source is the only declaration',
      'First: links ../src/old.ts, which does not exist',
      'chapter "Third" is in the inventory, not in the page',
    ])
  })
})

describe('checkPackageExports and the CLI', () => {
  const fixture = (name: string, overrides: Record<string, string> = {}) => {
    const root = join(directory, name)
    build(root, {
      'package.json': JSON.stringify({
        name: 'fixture',
        type: 'module',
        exports: {
          '.': { types: './dist/index.d.ts' },
          './testing': { types: './dist/testing.d.ts' },
        },
      }),
      'src/index.ts': 'export type Root = 1\nexport function judge(): void {}\n',
      'src/testing.ts': 'export function createFake(): void {}\n',
      'dist/index.d.ts': 'export type Root = 1\nexport declare function judge(): void\n',
      'dist/testing.d.ts':
        "export declare function createFake(): void\nexport type { Root } from './index.js'\n",
      'docs/public-api.md':
        '## Root\n[src](../src/index.ts)\n## Testing\n[src](../src/testing.ts)\n',
      'tests/fixtures/exports.json': JSON.stringify({
        package: 'fixture',
        source: 'docs/public-api.md',
        expectedPending: 0,
        entries: {
          '.': { chapters: [{ title: 'Root', names: [type('Root'), value('judge')] }] },
          './testing': {
            chapters: [
              { title: 'Testing', names: [value('createFake'), { ...type('Root'), sameAs: '.' }] },
            ],
          },
        },
        augmentations: [],
      }),
      ...overrides,
    })
    return root
  }
  const runCli = (...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], { encoding: 'utf8' })

  it('passes a package whose build, inventory and page agree, and exits 0', () => {
    const root = fixture('clean')
    expect(checkPackageExports(root)).toEqual({
      kind: 'checked',
      report: {
        package: 'fixture',
        entries: [
          { entry: '.', listed: 2, pending: 0 },
          { entry: './testing', listed: 2, pending: 0 },
        ],
        problems: [],
      },
    })
    const run = runCli(root)
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('[exports] fixture ./testing: 2 listed, 0 pending')
  })

  it('exits 1 and prints each difference when the build exports an unlisted name', () => {
    const root = fixture('extra', {
      'dist/testing.d.ts':
        "export declare function createFake(): void\nexport declare function leaked(): void\nexport type { Root } from './index.js'\n",
    })
    const run = runCli(root, '--json')
    expect(run.status).toBe(1)
    expect(JSON.parse(run.stdout).report.problems).toEqual([
      './testing: leaked is exported, the inventory does not list it',
    ])
  })

  it('exits 2 when the package is not built or the inventory is malformed', () => {
    const unbuilt = fixture('unbuilt')
    rmSync(join(unbuilt, 'dist'), { recursive: true })
    const run = runCli(unbuilt)
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('build the package first')
    const malformed = fixture('malformed', {
      'tests/fixtures/exports.json': '{"package":"fixture"}',
    })
    expect(runCli(malformed).status).toBe(2)
    expect(runCli().status).toBe(2)
  })
})
