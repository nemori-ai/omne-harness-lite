// @module-tag slow
// Builds a TypeScript program for every case, about a second of CPU each.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  compareDeclarations,
  problemsOf,
  type EqualityReport,
  type LandedName,
} from './declaration-equality.ts'

// The comparison is only worth its name if each kind of drift turns it red. Every case here changes
// the source of one small, correct page/source pair in exactly one way and names what must fail.
const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'declaration-equality-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const page = [
  '# Page',
  '```ts',
  'export type Box = Readonly<{ id: string; tags: readonly string[] }>',
  "export type Mode = 'a' | 'b'",
  "export type Key = 'x' | 'y'",
  'export type Wrap<P> = Readonly<{ value: P; hint?: string }>',
  'export type Pair<A, B> = Readonly<{ first: A; second: B }>',
  'export type Keyed<K extends Key> = Readonly<{ key: K }>',
  'export interface Service<P> {',
  '  run(input: P): Promise<string>',
  '}',
  'export const LIMIT = 3',
  'export function pick(input: string): number',
  'declare const brand: unique symbol',
  'export type Branded<K extends string> = string & { readonly [brand]: K }',
  "export type Id = Branded<'Id'>",
  'export type Later = NotDeclaredAnywhere',
  '```',
].join('\n')

const source: Record<string, string> = {
  box: 'export type Box = Readonly<{ id: string; tags: readonly string[] }>',
  mode: "export type Mode = 'a' | 'b'",
  key: "export type Key = 'x' | 'y'",
  wrap: 'export type Wrap<P> = Readonly<{ value: P; hint?: string }>',
  pair: 'export type Pair<A, B> = Readonly<{ first: A; second: B }>',
  keyed: 'export type Keyed<K extends Key> = Readonly<{ key: K }>',
  service: 'export interface Service<P> {\n  run(input: P): Promise<string>\n}',
  limit: 'export const LIMIT = 3',
  pick: 'export function pick(input: string): number {\n  return input.length\n}',
  brandSymbol: 'declare const brand: unique symbol',
  branded: 'export type Branded<K extends string> = string & { readonly [brand]: K }',
  id: "export type Id = Branded<'Id'>",
}

const landed: readonly LandedName[] = [
  ...['Box', 'Mode', 'Key', 'Wrap', 'Pair', 'Keyed', 'Service', 'Branded', 'Id'].map(name => ({
    name,
    kind: 'type' as const,
  })),
  { name: 'LIMIT', kind: 'value' },
  { name: 'pick', kind: 'value' },
]

let counter = 0
function run(
  changes: Readonly<Record<string, string>> = {},
  options: { page?: string; landed?: readonly LandedName[] } = {},
): EqualityReport {
  const directory = join(root, `case-${counter++}`)
  mkdirSync(join(directory, 'src'), { recursive: true })
  writeFileSync(
    join(directory, 'src/index.ts'),
    `${Object.values({ ...source, ...changes }).join('\n')}\n`,
  )
  return compareDeclarations({
    page: options.page ?? page,
    landed: options.landed ?? landed,
    sourceEntry: join(directory, 'src/index.ts'),
    packageDirectory,
    workDirectory: join(directory, 'work'),
  })
}

describe('compareDeclarations on a correct pair', () => {
  it('finds nothing, compares each landed name, and leaves the pending declaration alone', () => {
    const report = run()
    expect(problemsOf(report)).toEqual([])
    expect(report.comparedAsText).toEqual(['Branded'])
    expect([...report.compared, ...report.comparedAsText].sort()).toEqual(
      landed.map(item => item.name).sort(),
    )
  })
})

describe('compareDeclarations turns red on one drift of the source', () => {
  it.each([
    [
      'an added optional field',
      { box: 'export type Box = Readonly<{ id: string; tags: readonly string[]; note?: string }>' },
      'Box',
    ],
    [
      'an added required field',
      { box: 'export type Box = Readonly<{ id: string; tags: readonly string[]; note: string }>' },
      'Box',
    ],
    ['a widened union', { mode: "export type Mode = 'a' | 'b' | 'c'" }, 'Mode'],
    [
      'a lost readonly on the object',
      { box: 'export type Box = { id: string; tags: readonly string[] }' },
      'Box',
    ],
    [
      'a lost readonly on one member',
      { box: 'export type Box = { readonly id: string; tags: readonly string[] }' },
      'Box',
    ],
    [
      'a readonly array that became mutable',
      { box: 'export type Box = Readonly<{ id: string; tags: string[] }>' },
      'Box',
    ],
    [
      'a required member that became optional',
      { box: 'export type Box = Readonly<{ id?: string; tags: readonly string[] }>' },
      'Box',
    ],
    [
      'an optional member that became required',
      { wrap: 'export type Wrap<P> = Readonly<{ value: P; hint: string }>' },
      'Wrap',
    ],
    [
      'an extra optional member of a generic',
      { wrap: 'export type Wrap<P> = Readonly<{ value: P; hint?: string; extra?: P }>' },
      'Wrap',
    ],
    [
      'two type parameters used in swapped places',
      { pair: 'export type Pair<A, B> = Readonly<{ first: B; second: A }>' },
      'Pair',
    ],
    [
      'a changed return type of an interface method',
      { service: 'export interface Service<P> {\n  run(input: P): Promise<number>\n}' },
      'Service',
    ],
    ['a changed value', { limit: 'export const LIMIT = 4' }, 'LIMIT'],
    [
      'a changed function signature',
      { pick: 'export function pick(input: number): number {\n  return input\n}' },
      'pick',
    ],
  ] as const)('%s', (_label, change, name) => {
    const report = run(change)
    expect(report.different).toContain(name)
    expect(problemsOf(report)).not.toEqual([])
  })

  it('reports a type-parameter list that differs although one instantiation is identical', () => {
    const report = run({ keyed: 'export type Keyed<K extends string> = Readonly<{ key: K }>' })
    expect(report.different).toEqual([])
    expect(report.parameterLists).toEqual([
      'Keyed<K extends Key> on the page, <K extends string> in the source',
    ])
  })

  it('reports a type parameter that the source added', () => {
    const report = run({
      wrap: 'export type Wrap<P, Q = never> = Readonly<{ value: P; hint?: string }>',
    })
    expect(report.parameterLists).toHaveLength(1)
  })

  it('compares the brand declaration as text, and the symbol it uses', () => {
    expect(
      run({ branded: 'export type Branded<K extends string> = string & { readonly [brand]?: K }' })
        .textDifferent,
    ).toEqual(['Branded'])
    expect(run({ brandSymbol: 'declare const brand: symbol' }).textDifferent).toEqual(['Branded'])
  })
})

describe('compareDeclarations does not let a gap pass as equal', () => {
  it('reports a landed name that the page does not declare', () => {
    const report = run({}, { landed: [...landed, { name: 'Missing', kind: 'type' }] })
    expect(report.notOnPage).toEqual(['Missing'])
  })

  it('reports a landed name that the source does not export', () => {
    const report = run({ mode: '' })
    expect(report.notInSource).toEqual(['Mode'])
  })

  it('reports a landed page declaration that names an unknown type', () => {
    const broken = page.replace("'a' | 'b'", 'Unknown')
    const report = run({ mode: 'export type Mode = string' }, { page: broken })
    expect(report.diagnostics.join('\n')).toContain("Cannot find name 'Unknown'")
  })
})
