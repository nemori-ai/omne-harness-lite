import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { listWorkspaceMembers, type Tree } from '@omne-harness/repo-toolchain/core/workspace'
import {
  assignReadSets,
  parseReadSetFile,
  readOverlap,
  readSets,
  type ReadSetCard,
} from '../src/delivery/read-set.ts'
import { scopeOverlap } from '../src/delivery/scope-overlap.ts'
import { binding } from './fixtures/binding.ts'
import { table } from './fixtures/lines.ts'

/** An in-memory workspace: `packages` maps a member directory to its name and workspace dependencies. */
function tree(packages: Record<string, { name: string; uses?: string[] }>): Tree {
  const files = new Map<string, string>([['pnpm-workspace.yaml', 'packages:\n  - packages/*\n']])
  for (const [path, { name, uses = [] }] of Object.entries(packages))
    files.set(
      `${path}/package.json`,
      JSON.stringify({
        name,
        dependencies: Object.fromEntries(uses.map(use => [use, 'workspace:*'])),
        devDependencies: { vitest: '^4.0.0' },
      }),
    )
  return {
    read: path => files.get(path),
    directories: path =>
      [...files.keys()]
        .filter(file => file.startsWith(`${path}/`))
        .map(file => file.slice(path.length + 1).split('/')[0] ?? '')
        .filter((name, index, all) => name !== '' && all.indexOf(name) === index)
        .sort(),
  }
}
// a uses b, b uses c; d stands alone.
const members = listWorkspaceMembers(
  tree({
    'packages/a': { name: '@x/a', uses: ['@x/b'] },
    'packages/b': { name: '@x/b', uses: ['@x/c'] },
    'packages/c': { name: '@x/c' },
    'packages/d': { name: '@x/d' },
  }),
  [],
)
const card = (source: string, counted: string[], pages: string[] = []): ReadSetCard => ({
  source,
  counted,
  pages,
})
/** Read sets and read conflicts of `scopes` (source to write scope) over the fixture table. */
function check(scopes: Record<string, string[]>, pages: Record<string, string[]> = {}) {
  const overlap = scopeOverlap(
    Object.entries(scopes).map(([source, writeScope]) => ({ source, writeScope })),
    table(),
  )
  const sets = readSets(
    overlap.cards.map(entry => card(entry.source, entry.counted, pages[entry.source])),
    members,
  )
  return { sets, conflicts: readOverlap(overlap.cards, sets) }
}

describe('read sets', () => {
  it('closes the written members over workspace dependencies', () => {
    expect(readSets([card('#1', ['packages/a/src/x.ts'], ['docs/a.md'])], members)).toEqual([
      { source: '#1', members: ['packages/a', 'packages/b', 'packages/c'], pages: ['docs/a.md'] },
    ])
    expect(readSets([card('#2', ['packages/b'])], members)[0]?.members).toEqual([
      'packages/b',
      'packages/c',
    ])
    expect(readSets([card('#3', ['packages', 'docs/b.md'])], members)[0]?.members).toEqual([])
  })

  it('reports a write of one card inside the read set of another, in both directions', () => {
    const { conflicts } = check(
      { '#1': ['packages/a/src/x.ts'], '#2': ['packages/c/src/y.ts', 'docs/a'] },
      { '#1': ['docs'] },
    )
    expect(conflicts).toEqual([
      { writer: '#2', reader: '#1', writePath: 'packages/c/src/y.ts', readPath: 'packages/c' },
      { writer: '#2', reader: '#1', writePath: 'docs/a', readPath: 'docs' },
    ])
  })

  it('reports a written directory that contains a page another card reads', () => {
    const { conflicts } = check(
      { '#1': ['packages/d/src/z.ts'], '#2': ['docs'] },
      { '#1': ['docs/a.md'] },
    )
    expect(conflicts).toEqual([
      { writer: '#2', reader: '#1', writePath: 'docs', readPath: 'docs/a.md' },
    ])
  })

  it('passes cards whose writes miss every other read set', () => {
    const { conflicts } = check(
      { '#1': ['packages/c/src/y.ts'], '#2': ['packages/d/src/z.ts', 'docs/b.md'] },
      { '#1': ['docs/a.md'] },
    )
    expect(conflicts).toEqual([])
  })

  it('leaves task tmp and shared paths out of writes and read sets', () => {
    const { sets, conflicts } = check(
      { '#1': ['tmp/issue-1', 'pnpm-lock.yaml', 'packages/d/x'], '#2': ['packages/d/y'] },
      { '#2': ['tmp', 'pnpm-lock.yaml'] },
    )
    expect(conflicts).toEqual([
      { writer: '#1', reader: '#2', writePath: 'packages/d/x', readPath: 'packages/d' },
      { writer: '#2', reader: '#1', writePath: 'packages/d/y', readPath: 'packages/d' },
    ])
    expect(sets[0]?.members).toEqual(['packages/d'])
  })
})

describe('read-set files', () => {
  it('reads a JSON object with reads and leaves other content to the binding reader', () => {
    expect(parseReadSetFile('r.json', '{"source":"#7","reads":["docs/a.md"]}')).toEqual({
      path: 'r.json',
      source: '#7',
      reads: ['docs/a.md'],
    })
    expect(parseReadSetFile('b.json', '{"schemaVersion":1}')).toBeUndefined()
    expect(parseReadSetFile('body.md', '## binding')).toBeUndefined()
  })

  it('refuses unknown fields, a missing source and paths outside the repository', () => {
    expect(() => parseReadSetFile('r.json', '{"source":"#7","reads":[],"x":1}')).toThrow(
      'unknown fields x',
    )
    expect(() => parseReadSetFile('r.json', '{"reads":[]}')).toThrow('source')
    expect(() => parseReadSetFile('r.json', '{"source":"#7","reads":["../a"]}')).toThrow(
      'repository-relative',
    )
  })

  it('attaches a file to the card its source names and refuses a source that names none', () => {
    const file = (source: string, reads: string[] = ['docs']) => ({ path: 'r.json', source, reads })
    const pages = assignReadSets(['#7', 'b.json'], [file('#7'), file('./b.json', ['x'])], '/base')
    expect(Object.fromEntries(pages)).toEqual({ '#7': ['docs'], 'b.json': ['x'] })
    expect(() => assignReadSets(['#7'], [file('#8')], '/base')).toThrow('names no card')
    expect(() => assignReadSets(['#7'], [file('7')], '/base')).toThrow('names no card')
    expect(() => assignReadSets(['#7'], [file('#7'), file('#7')], '/base')).toThrow('more than one')
  })

  it('resolves file sources against the given base and never reads #<n> as a path', () => {
    const file = (source: string) => ({ path: 'r.json', source, reads: ['docs'] })
    expect(() => assignReadSets(['#7'], [file('./#7')], '/base')).toThrow('names no card')
    expect(Object.fromEntries(assignReadSets(['/base/b.json'], [file('b.json')], '/base'))).toEqual(
      { '/base/b.json': ['docs'] },
    )
    expect(() => assignReadSets(['/other/b.json'], [file('b.json')], '/base')).toThrow(
      'names no card',
    )
  })
})

const cli = fileURLToPath(new URL('../src/delivery/scope-cli.ts', import.meta.url))
const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))

describe('scope-cli read sets', () => {
  // Slow: runs scope-cli as a child process, which also lists the real workspace members.
  it(
    'lists read conflicts on stderr and exits 1; a read set for no card exits 2',
    { tags: ['slow'] },
    () => {
      const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-read-set-')))
      homes.push(home)
      const file = (name: string, value: unknown) => {
        const path = join(home, name)
        writeFileSync(path, JSON.stringify(value))
        return path
      }
      const writer = file('a.json', binding(1, ['docs/engineering/x.md'])),
        reader = file('b.json', binding(2, ['scripts/b.mjs'])),
        reads = file('reads.json', { source: reader, reads: ['docs/engineering'] }),
        stray = file('stray.json', { source: '#9', reads: [] })
      const run = (...args: string[]) =>
        spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
          encoding: 'utf8',
          env: { PATH: process.env['PATH'] ?? '', NO_COLOR: '1' },
        })

      const found = run(writer, reader, reads)
      expect(found.status, found.stderr).toBe(1)
      expect(found.stderr).toBe(
        `read-overlap: ${writer} docs/engineering/x.md -> ${reader} docs/engineering\n`,
      )
      const output = JSON.parse(found.stdout)
      expect(output.conflicts).toEqual([])
      expect(output.readConflicts).toEqual([
        {
          writer,
          reader,
          writePath: 'docs/engineering/x.md',
          readPath: 'docs/engineering',
        },
      ])
      expect(output.readSets).toContainEqual({
        source: reader,
        members: [],
        pages: ['docs/engineering'],
      })

      const unmatched = run(writer, reader, stray)
      expect(unmatched.status).toBe(2)
      expect(unmatched.stdout).toBe('')
      expect(JSON.parse(unmatched.stderr)).toMatchObject({
        kind: 'scope-error',
        message: expect.stringContaining('names no card'),
      })
    },
  )
})
