import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { listWorkspaceMembers, type Tree } from '@omne-harness/repo-toolchain/core/workspace'
import {
  assignReadSets,
  classifyReadConflicts,
  frozenReadPath,
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

describe('read conflict kinds', () => {
  it('counts engineering method and verification text as frozen, at segment boundaries', () => {
    const frozen = [
      '.meta_harness/agents',
      '.meta_harness/agents/skills/review-code',
      'docs/engineering',
      'docs/engineering/delivery-lines.json',
      'docs/development.md',
      'docs/verification.md',
      'tools/README.md',
      'tools/dev-flow/src/delivery/README.md',
      'scripts/README.md',
    ]
    const stopping = [
      '.meta_harness',
      '.meta_harness/design/product/x.md',
      'docs',
      'docs/architecture/x.md',
      'docs/engineering-old/x.md',
      'docs/development.md.bak',
      'docs/workspace.md',
      'tools',
      'tools/dev-flow',
      'tools/dev-flow/src/x.ts',
      'scripts/check.sh',
      'packages/a/README.md',
      'apps/cli/README.md',
    ]
    expect(frozen.filter(path => !frozenReadPath(path))).toEqual([])
    expect(stopping.filter(path => frozenReadPath(path))).toEqual([])
  })

  it('classifies each conflict by the narrower of its two paths', () => {
    const conflict = (writePath: string, readPath: string) => ({
      writer: '#1',
      reader: '#2',
      writePath,
      readPath,
    })
    const pageInMember = conflict('tools/dev-flow/README.md', 'tools/dev-flow'),
      pageInWrittenTree = conflict('docs', 'docs/engineering/x.md'),
      treeOverMember = conflict('tools', 'tools/dev-flow'),
      sourceInMember = conflict('tools/dev-flow/src/x.ts', 'tools/dev-flow'),
      productPage = conflict('docs/architecture/x.md', 'docs/architecture')
    expect(
      classifyReadConflicts([
        pageInMember,
        treeOverMember,
        pageInWrittenTree,
        sourceInMember,
        productPage,
      ]),
    ).toEqual({
      stopping: [treeOverMember, sourceInMember, productPage],
      frozen: [pageInMember, pageInWrittenTree],
    })
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
    const file = (source: string, reads: string[] = ['docs']) => ({
      path: 'r.json',
      source,
      reads,
    })
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
      const writer = file('a.json', binding(1, ['docs/architecture/x.md'])),
        reader = file('b.json', binding(2, ['scripts/b.mjs'])),
        reads = file('reads.json', { source: reader, reads: ['docs/architecture'] }),
        stray = file('stray.json', { source: '#9', reads: [] })
      const run = (...args: string[]) =>
        spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
          encoding: 'utf8',
          env: { PATH: process.env['PATH'] ?? '', NO_COLOR: '1' },
        })

      const found = run(writer, reader, reads)
      expect(found.status, found.stderr).toBe(1)
      expect(found.stderr).toBe(
        `read-overlap: ${writer} docs/architecture/x.md -> ${reader} docs/architecture\n`,
      )
      const output = JSON.parse(found.stdout)
      expect(output.conflicts).toEqual([])
      expect(output.readConflicts).toEqual([
        {
          writer,
          reader,
          writePath: 'docs/architecture/x.md',
          readPath: 'docs/architecture',
        },
      ])
      expect(output.readSets).toContainEqual({
        source: reader,
        members: [],
        pages: ['docs/architecture'],
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

describe('scope-cli read-overlap kinds', () => {
  /** Writes each value as a JSON file in a fresh directory and returns the paths by name. */
  function inputs(values: Record<string, unknown>): Record<string, string> {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-read-kind-')))
    homes.push(home)
    return Object.fromEntries(
      Object.entries(values).map(([name, value]) => {
        const path = join(home, `${name}.json`)
        writeFileSync(path, JSON.stringify(value))
        return [name, path]
      }),
    )
  }
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '', NO_COLOR: '1' },
    })
    return { ...result, output: result.status === 2 ? undefined : JSON.parse(result.stdout) }
  }

  // Slow: each case runs scope-cli as a child process over the real workspace members.
  it(
    'reports a crossing on engineering method text as frozen and exits 0',
    { tags: ['slow'] },
    () => {
      const { a, b } = inputs({
        a: binding(1, ['docs/development.md']),
        b: binding(2, ['scripts/b.mjs']),
      })
      const [reads] = Object.values(inputs({ r: { source: b, reads: ['docs/development.md'] } }))
      const frozen = run(a!, b!, reads!)
      expect(frozen.status, frozen.stderr).toBe(0)
      expect(frozen.stderr).toBe(
        `read-overlap-frozen: ${a} docs/development.md -> ${b} docs/development.md\n`,
      )
      expect(frozen.output.conflicts).toEqual([])
      expect(frozen.output.readConflicts).toEqual([])
      expect(frozen.output.frozenReadConflicts).toEqual([
        { writer: a, reader: b, writePath: 'docs/development.md', readPath: 'docs/development.md' },
      ])
    },
  )

  it(
    'stops on a write inside a member another card reads, and on a write-write intersection',
    { tags: ['slow'] },
    () => {
      const { a, b, c, d } = inputs({
        a: binding(1, ['packages/agent/agent-contract/src/a.ts']),
        b: binding(2, ['packages/agent/agent-contract/src/b.ts']),
        c: binding(3, ['docs/engineering/integration.md']),
        d: binding(4, ['docs/engineering/integration.md']),
      })
      const member = run(a!, b!)
      expect(member.status, member.stderr).toBe(1)
      expect(member.stderr).toBe(
        [
          `read-overlap: ${a} packages/agent/agent-contract/src/a.ts -> ${b} packages/agent/agent-contract`,
          `read-overlap: ${b} packages/agent/agent-contract/src/b.ts -> ${a} packages/agent/agent-contract`,
          '',
        ].join('\n'),
      )
      expect(member.output.frozenReadConflicts).toEqual([])

      const written = run(c!, d!)
      expect(written.status, written.stderr).toBe(1)
      expect(written.stderr).toBe(
        `scope-overlap: ${c} docs/engineering/integration.md <-> ${d} docs/engineering/integration.md\n`,
      )
      expect(written.output.readConflicts).toEqual([])
      expect(written.output.frozenReadConflicts).toEqual([])
    },
  )

  it(
    'exits 1 and lists both kinds when a frozen and a stopping crossing meet',
    { tags: ['slow'] },
    () => {
      const { a, b } = inputs({
        a: binding(1, ['docs/development.md', 'docs/architecture/x.md']),
        b: binding(2, ['scripts/b.mjs']),
      })
      const [reads] = Object.values(
        inputs({ r: { source: b, reads: ['docs/development.md', 'docs/architecture'] } }),
      )
      const both = run(a!, b!, reads!)
      expect(both.status, both.stderr).toBe(1)
      expect(both.stderr).toBe(
        [
          `read-overlap: ${a} docs/architecture/x.md -> ${b} docs/architecture`,
          `read-overlap-frozen: ${a} docs/development.md -> ${b} docs/development.md`,
          '',
        ].join('\n'),
      )
      expect(both.output.readConflicts).toHaveLength(1)
      expect(both.output.frozenReadConflicts).toHaveLength(1)
    },
  )

  it(
    'stops on tool source but not on a tool README inside the same member',
    { tags: ['slow'] },
    () => {
      const { page, source, other } = inputs({
        page: binding(1, ['tools/dev-flow/src/delivery/README.md']),
        source: binding(2, ['tools/dev-flow/src/x.ts']),
        other: binding(3, ['tools/dev-flow/README.md']),
      })
      const mixed = run(page!, source!)
      expect(mixed.status, mixed.stderr).toBe(1)
      expect(mixed.stderr).toBe(
        [
          `read-overlap: ${source} tools/dev-flow/src/x.ts -> ${page} tools/dev-flow`,
          `read-overlap-frozen: ${page} tools/dev-flow/src/delivery/README.md -> ${source} tools/dev-flow`,
          '',
        ].join('\n'),
      )

      const pages = run(page!, other!)
      expect(pages.status, pages.stderr).toBe(0)
      expect(pages.output.readConflicts).toEqual([])
      expect(pages.output.frozenReadConflicts).toHaveLength(2)
    },
  )

  // C2 of #856: the input shape that stopped #801 (I-02), with the write scopes of #410 and #793.
  it('passes the #801 input shape with two frozen crossings', { tags: ['slow'] }, () => {
    const { reader, review, development } = inputs({
      reader: binding(801, ['packages/agent/agent-contract']),
      review: binding(410, ['.meta_harness/agents/skills/review-code', 'tmp/issue-410']),
      development: binding(793, [
        'tools/test-runner/src/testing',
        'tools/test-runner/test-runs.config.json',
        'tools/test-runner/README.md',
        'docs/development.md',
        'tmp/issue-793',
      ]),
    })
    const [reads] = Object.values(
      inputs({
        r: {
          source: reader,
          reads: ['.meta_harness/agents/skills/review-code', 'docs/development.md'],
        },
      }),
    )
    const ran = run(reader!, review!, development!, reads!)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stderr).toBe(
      [
        `read-overlap-frozen: ${review} .meta_harness/agents/skills/review-code -> ${reader} .meta_harness/agents/skills/review-code`,
        `read-overlap-frozen: ${development} docs/development.md -> ${reader} docs/development.md`,
        '',
      ].join('\n'),
    )
    expect(ran.output.conflicts).toEqual([])
    expect(ran.output.readConflicts).toEqual([])
    expect(ran.output.frozenReadConflicts).toHaveLength(2)
  })
})
