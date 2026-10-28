import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, matchesGlob } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { listWorkspaceMembers, type Tree } from '@omne-harness/repo-toolchain/core/workspace'
import {
  assignReadSets,
  classifyReadConflicts,
  frozenPageStop,
  matchesRegistered,
  narrowerReadPath,
  parseReadSetFile,
  readOverlap,
  readSets,
  REGISTERED_READ_PATTERNS,
  registeredReadPatterns,
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

/** The registered patterns of the real test-runs configuration in this checkout. */
const registered = registeredReadPatterns(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../${REGISTERED_READ_PATTERNS.config}`, import.meta.url)),
      'utf8',
    ),
  ),
  REGISTERED_READ_PATTERNS.config,
)
const frozenPage = (file: string, patterns: readonly string[] = []) =>
  frozenPageStop(file, patterns) === undefined
const conflict = (writePath: string, readPath: string) => ({
  writer: '#1',
  reader: '#2',
  writePath,
  readPath,
})

describe('read conflict kinds', () => {
  it('counts unregistered pages and skill adapter strategies in the areas, at segment boundaries', () => {
    const frozen = [
      '.meta_harness/agents/skills/review-code/canonical/SKILL.md',
      '.meta_harness/agents/skills/review-code/adapters/codex/strategy.yaml',
      '.meta_harness/agents/skills/x/adapters/a/b/strategy.yaml',
      'docs/engineering/integration.md',
      'docs/development.md',
      'docs/verification.md',
      'tools/README.md',
      'tools/dev-flow/src/delivery/README.md',
      'scripts/README.md',
    ]
    const stopping = [
      '.meta_harness/agents',
      '.meta_harness/agents/hooks/hooks.yaml',
      '.meta_harness/agents/skills/x/canonical/strategy.yaml',
      '.meta_harness/agents/evaluation/harness/roleeval/stats.py',
      '.meta_harness/design/product/x.md',
      'docs/engineering',
      'docs/engineering/delivery-lines.json',
      'docs/architecture/x.md',
      'docs/engineering-old/x.md',
      'docs/development.md.bak',
      'docs/engineering/x.md.bak',
      'docs/engineering/x.mdx',
      'tools/README.md.orig',
      'docs/workspace.md',
      'tools',
      'tools/dev-flow/src/x.ts',
      'toolsets/README.md',
      'tools-x/README.md',
      'scripts-old/x.md',
      'scripts.md',
      'scripts/check.sh',
      'packages/a/README.md',
      'apps/cli/README.md',
    ]
    expect(frozen.filter(path => !frozenPage(path))).toEqual([])
    expect(stopping.filter(path => frozenPage(path))).toEqual([])
    expect(frozenPage('docs/engineering/x.md', ['docs/engineering/*.md'])).toBe(false)
    expect(
      frozenPage('.meta_harness/agents/skills/x/adapters/a/strategy.yaml', [
        '.meta_harness/agents/skills/*/adapters/**',
      ]),
    ).toBe(false)
  })

  // The patterns come from the real configuration; the verdicts are fixed. CE1 to CE4 are the
  // counterexamples of the #856 review, C2 the paths of the #801 crossings. pythonPaths, which
  // covers .meta_harness/agents/**, does not count as a registration.
  it('judges the review counterexamples and the #801 paths against the real registrations', () => {
    const verdicts = Object.fromEntries(
      [
        'docs/engineering/github-delivery.json',
        'docs/engineering/integration-policy.json',
        'docs/engineering/delivery-lines.json',
        'tools/repo-toolchain/resources/clean-loop-entries.md',
        '.meta_harness/agents/evaluation/harness/roleeval/stats.py',
        '.meta_harness/agents/skills/review-code/canonical/SKILL.md',
        '.meta_harness/agents/skills/review-code/adapters/claude-code/strategy.yaml',
        'docs/development.md',
      ].map(path => [path, frozenPage(path, registered)]),
    )
    expect(verdicts).toEqual({
      'docs/engineering/github-delivery.json': false,
      'docs/engineering/integration-policy.json': false,
      'docs/engineering/delivery-lines.json': false,
      'tools/repo-toolchain/resources/clean-loop-entries.md': false,
      '.meta_harness/agents/evaluation/harness/roleeval/stats.py': false,
      '.meta_harness/agents/skills/review-code/canonical/SKILL.md': true,
      '.meta_harness/agents/skills/review-code/adapters/claude-code/strategy.yaml': true,
      'docs/development.md': true,
    })
    expect(frozenPageStop('tools/repo-toolchain/resources/clean-loop-entries.md', registered)).toBe(
      `read by code: ${REGISTERED_READ_PATTERNS.config} registers tools/repo-toolchain/resources/clean-loop-entries.md`,
    )
  })

  // The same paths matched with test-runner's own pattern semantics give these patterns.
  it('matches the real reader rules and global paths as the test runner does', () => {
    const match = (path: string) => registered.find(pattern => matchesRegistered(path, pattern))
    expect(
      Object.fromEntries(
        [
          'docs/engineering/github-delivery.json',
          'docs/engineering/integration-policy.json',
          'tools/repo-toolchain/resources/clean-loop-entries.md',
          'tools/dev-flow/turbo.json',
          '.cursor/turbo.json',
          'tsconfig.base.json',
          'packages/agent/agent-contract/package.json',
          'packages/agent/agent-contract/src/x.ts',
          '.meta_harness/design/product/m1/README.md',
          '.meta_harness/agents/skills/review-code/canonical/SKILL.md',
          'docs/development.md',
        ].map(path => [path, match(path)]),
      ),
    ).toEqual({
      'docs/engineering/github-delivery.json': 'docs/engineering/github-delivery.json',
      'docs/engineering/integration-policy.json': 'docs/engineering/integration-policy.json',
      'tools/repo-toolchain/resources/clean-loop-entries.md':
        'tools/repo-toolchain/resources/clean-loop-entries.md',
      'tools/dev-flow/turbo.json': '**/turbo.json',
      '.cursor/turbo.json': '**/turbo.json',
      'tsconfig.base.json': 'tsconfig*.json',
      'packages/agent/agent-contract/package.json': 'packages/*/*/package.json',
      'packages/agent/agent-contract/src/x.ts': 'packages/**/*.ts',
      '.meta_harness/design/product/m1/README.md': '.meta_harness/design/product/*/README.md',
      '.meta_harness/agents/skills/review-code/canonical/SKILL.md': undefined,
      'docs/development.md': undefined,
    })
  })

  // matchesGlob alone does not let * and ** match a segment that starts with a dot; the test
  // runner's patterns do. A registered page would then count as frozen.
  it('lets * and ** match path segments that start with a dot', () => {
    const fixture =
      'tools/repo-toolchain/tests/fixtures/loop-canary/repo/.meta_harness/design/product/canary/design.md'
    expect(matchesGlob(fixture, 'tools/repo-toolchain/tests/fixtures/**')).toBe(false)
    expect(matchesRegistered(fixture, 'tools/repo-toolchain/tests/fixtures/**')).toBe(true)
    expect(frozenPage(fixture, ['tools/repo-toolchain/tests/fixtures/**'])).toBe(false)
    expect(frozenPage(fixture, ['**/design.md'])).toBe(false)
    expect(frozenPage(fixture, ['tools/*/tests/fixtures/*/repo/*/design/**'])).toBe(false)
    expect(matchesRegistered('docs/a.md', 'docs/b.md')).toBe(false)
    expect(matchesRegistered('.meta_harness/x.md', '.meta_harness/*.md')).toBe(true)
    expect(matchesRegistered('xmeta_harness/x.md', '.meta_harness/*.md')).toBe(false)
  })

  it('takes the narrower path and refuses two paths where neither contains the other', () => {
    expect(narrowerReadPath(conflict('tools/dev-flow/README.md', 'tools/dev-flow'))).toBe(
      'tools/dev-flow/README.md',
    )
    expect(narrowerReadPath(conflict('docs', 'docs/engineering/x.md'))).toBe(
      'docs/engineering/x.md',
    )
    expect(narrowerReadPath(conflict('docs/a.md', 'docs/a.md'))).toBe('docs/a.md')
    expect(() => narrowerReadPath(conflict('docs/a.md', 'docs/b.md'))).toThrow(
      'neither path contains the other',
    )
    let thrown: unknown
    try {
      narrowerReadPath(conflict('docs/a.md', 'docs/b.md'))
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({ code: 'invariant' })
    expect(() =>
      classifyReadConflicts([conflict('tools/a', 'tools/ab')], { registered: [], tracked: [] }),
    ).toThrow('neither path contains the other')
  })

  it('checks every tracked file below a directory and names the first that stops', () => {
    const tracked = [
      '.meta_harness/agents/skills/review-code/canonical/SKILL.md',
      '.meta_harness/agents/skills/review-code/adapters/codex/strategy.yaml',
      '.meta_harness/agents/evaluation/README.md',
      '.meta_harness/agents/evaluation/harness/roleeval/aaa.py',
      '.meta_harness/agents/evaluation/harness/roleeval/stats.py',
      'docs/engineering/integration.md',
      'docs/engineering/x.md',
      'tools/dev-flow/README.md',
      'tools/dev-flow/src/x.ts',
      'tools/dev-docs/README.md',
      'tools/dev-docs-other/src/x.ts',
    ]
    const skill = conflict(
        '.meta_harness/agents/skills/review-code',
        '.meta_harness/agents/skills/review-code',
      ),
      evaluation = conflict(
        '.meta_harness/agents/evaluation/README.md',
        '.meta_harness/agents/evaluation',
      ),
      evaluationTree = conflict('.meta_harness/agents', '.meta_harness/agents/evaluation'),
      pageInMember = conflict('tools/dev-flow/README.md', 'tools/dev-flow'),
      sourceInMember = conflict('tools/dev-flow/src/x.ts', 'tools/dev-flow'),
      member = conflict('tools/dev-flow', 'tools/dev-flow'),
      newPage = conflict('docs/engineering/new.md', 'docs/engineering'),
      registeredPage = conflict('docs/engineering/x.md', 'docs/engineering/x.md'),
      productPage = conflict('docs/architecture/x.md', 'docs/architecture'),
      pagesBesidePrefix = conflict('tools/dev-docs', 'tools/dev-docs')
    expect(
      classifyReadConflicts(
        [
          skill,
          evaluation,
          evaluationTree,
          pageInMember,
          sourceInMember,
          member,
          newPage,
          registeredPage,
          productPage,
          pagesBesidePrefix,
        ],
        { registered: ['docs/engineering/x.md'], tracked },
      ),
    ).toEqual({
      stopping: [
        {
          ...evaluationTree,
          file: '.meta_harness/agents/evaluation/harness/roleeval/aaa.py',
          reason:
            '.meta_harness/agents/evaluation/harness/roleeval/aaa.py: neither a .md page nor a skill adapter strategy.yaml',
        },
        {
          ...sourceInMember,
          file: 'tools/dev-flow/src/x.ts',
          reason: 'tools/dev-flow/src/x.ts: neither a .md page nor a skill adapter strategy.yaml',
        },
        {
          ...member,
          file: 'tools/dev-flow/src/x.ts',
          reason: 'tools/dev-flow/src/x.ts: neither a .md page nor a skill adapter strategy.yaml',
        },
        {
          ...registeredPage,
          file: 'docs/engineering/x.md',
          reason: `docs/engineering/x.md: read by code: ${REGISTERED_READ_PATTERNS.config} registers docs/engineering/x.md`,
        },
        {
          ...productPage,
          file: 'docs/architecture/x.md',
          reason: 'docs/architecture/x.md: outside the engineering method and verification areas',
        },
      ],
      frozen: [skill, evaluation, pageInMember, newPage, pagesBesidePrefix],
    })
  })

  it('stops every conflict with the reason when the basis cannot be read', () => {
    const page = conflict('docs/development.md', 'docs/development.md')
    expect(classifyReadConflicts([page], { unknown: 'no HEAD' })).toEqual({
      stopping: [{ ...page, reason: 'cannot classify: no HEAD' }],
      frozen: [],
    })
  })

  it('reads reader rule paths and global paths, not Python paths', () => {
    expect(
      registeredReadPatterns(
        {
          affected: {
            readers: [{ paths: ['a.md'], members: ['m'] }, { paths: ['b/**'] }],
            globalPaths: ['c.json'],
            pythonPaths: ['.meta_harness/agents/**'],
          },
        },
        'config',
      ),
    ).toEqual(['a.md', 'b/**', 'c.json'])
    expect(() => registeredReadPatterns({ affected: { readers: [] } }, 'config')).toThrow(
      'globalPaths',
    )
    expect(registered).toContain('docs/engineering/github-delivery.json')
    expect(registered).not.toContain('.meta_harness/agents/**')
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
        `read-overlap: ${writer} docs/architecture/x.md -> ${reader} docs/architecture (docs/architecture/x.md: outside the engineering method and verification areas)\n`,
      )
      const output = JSON.parse(found.stdout)
      expect(output.conflicts).toEqual([])
      expect(output.readConflicts).toEqual([
        {
          writer,
          reader,
          writePath: 'docs/architecture/x.md',
          readPath: 'docs/architecture',
          file: 'docs/architecture/x.md',
          reason: 'docs/architecture/x.md: outside the engineering method and verification areas',
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
          `read-overlap: ${a} packages/agent/agent-contract/src/a.ts -> ${b} packages/agent/agent-contract (packages/agent/agent-contract/src/a.ts: outside the engineering method and verification areas)`,
          `read-overlap: ${b} packages/agent/agent-contract/src/b.ts -> ${a} packages/agent/agent-contract (packages/agent/agent-contract/src/b.ts: outside the engineering method and verification areas)`,
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
      expect(written.output.readBasis).toBeNull()
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
          `read-overlap: ${a} docs/architecture/x.md -> ${b} docs/architecture (docs/architecture/x.md: outside the engineering method and verification areas)`,
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
          `read-overlap: ${source} tools/dev-flow/src/x.ts -> ${page} tools/dev-flow (tools/dev-flow/src/x.ts: neither a .md page nor a skill adapter strategy.yaml)`,
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

  // CE1, CE3 and CE4 of the #856 review: configuration, a page that code reads, and a program
  // in the engineering areas. A crossing on a directory names the file that stops it.
  it(
    'stops on configuration, a registered page and a program in the engineering areas',
    { tags: ['slow'] },
    () => {
      const { config, entries, program, tool, loop, evaluation } = inputs({
        config: binding(1, ['docs/engineering/github-delivery.json']),
        entries: binding(2, ['tools/repo-toolchain/resources/clean-loop-entries.md']),
        program: binding(3, ['.meta_harness/agents/evaluation']),
        tool: binding(4, ['tools/dev-flow/src/delivery/board-cli.ts']),
        loop: binding(5, ['docs/clean-loop.md']),
        evaluation: binding(6, ['tools/spec-tools/src/x.py']),
      })
      const reads = inputs({
        t: { source: tool, reads: ['docs/engineering/github-delivery.json'] },
        l: { source: loop, reads: ['tools/repo-toolchain/resources/clean-loop-entries.md'] },
        e: { source: evaluation, reads: ['.meta_harness/agents/evaluation'] },
      })
      const ran = run(
        config!,
        entries!,
        program!,
        tool!,
        loop!,
        evaluation!,
        ...Object.values(reads),
      )
      expect(ran.status, ran.stderr).toBe(1)
      expect(ran.output.frozenReadConflicts).toEqual([])
      expect(
        ran.output.readConflicts.map((item: { readPath: string; file: string }) => [
          item.readPath,
          item.file,
        ]),
      ).toEqual([
        ['docs/engineering/github-delivery.json', 'docs/engineering/github-delivery.json'],
        [
          'tools/repo-toolchain/resources/clean-loop-entries.md',
          'tools/repo-toolchain/resources/clean-loop-entries.md',
        ],
        [
          '.meta_harness/agents/evaluation',
          expect.stringMatching(/^\.meta_harness\/agents\/evaluation\/.+(?<!\.md)$/u),
        ],
      ])
      expect(ran.stderr).toContain(
        `read-overlap: ${entries} tools/repo-toolchain/resources/clean-loop-entries.md -> ${loop} tools/repo-toolchain/resources/clean-loop-entries.md (tools/repo-toolchain/resources/clean-loop-entries.md: read by code: tools/test-runner/test-runs.config.json registers tools/repo-toolchain/resources/clean-loop-entries.md)\n`,
      )
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
    expect(ran.output.readBasis).toEqual({ commit: expect.stringMatching(/^[0-9a-f]{40}$/u) })
  })

  // Without git on PATH the command cannot read the configuration or the tracked files at HEAD.
  // It must not fall back to judging the paths alone, which would count a page as frozen.
  it(
    'stops every crossing and gives the reason when it cannot read the basis',
    { tags: ['slow'] },
    () => {
      const { a, b } = inputs({
        a: binding(1, ['docs/development.md']),
        b: binding(2, ['scripts/b.mjs']),
      })
      const [reads] = Object.values(inputs({ r: { source: b, reads: ['docs/development.md'] } }))
      const empty = realpathSync(mkdtempSync(join(tmpdir(), 'omne-read-path-')))
      homes.push(empty)
      const result = spawnSync(
        process.execPath,
        ['--experimental-strip-types', cli, a!, b!, reads!],
        { encoding: 'utf8', env: { PATH: empty, NO_COLOR: '1' } },
      )
      const unknown = `cannot read ${REGISTERED_READ_PATTERNS.config} or the tracked files at HEAD: `
      expect(result.status, result.stderr).toBe(1)
      expect(result.stderr).toMatch(
        new RegExp(
          `^read-overlap: ${a} docs/development\\.md -> ${b} docs/development\\.md \\(cannot classify: ${unknown.replaceAll('.', '\\.')}.+\\)\\n$`,
          'u',
        ),
      )
      const output = JSON.parse(result.stdout)
      expect(output.frozenReadConflicts).toEqual([])
      expect(output.readConflicts).toEqual([
        expect.objectContaining({ reason: expect.stringContaining(`cannot classify: ${unknown}`) }),
      ])
      expect(output.readConflicts[0]).not.toHaveProperty('file')
      expect(output.readBasis).toEqual({ unknown: expect.stringContaining(unknown) })
    },
  )
})
