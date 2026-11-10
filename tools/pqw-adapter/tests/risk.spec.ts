import { expect, it } from 'vitest'
import {
  classify,
  PATH_RULES,
  publicEntriesOf,
  riskLines,
  toolchainPathspecs,
} from '../src/risk.ts'

// 路径表逐行：每条规则有命中例，与几个紧挨着命中例、不该命中的近邻（前后多一截、层级错一位）。
const ROWS = [
  {
    id: 'ci',
    level: 3,
    hits: ['.github/workflows/check.yml'],
    misses: ['docs/.github/notes.yml', 'x.github/workflows/check.yml'],
  },
  {
    id: 'gate',
    level: 3,
    hits: ['tools/dev-flow/src/integration/gate-cli.ts'],
    misses: [
      'tools/dev-flow/src/integration/worktree-cli.ts',
      'tools/dev-flow/src/integration/gates/x.ts',
      'packages/tools/dev-flow/src/integration/gate-cli.ts',
    ],
  },
  {
    id: 'acceptance',
    level: 3,
    hits: ['packages/a/b/acceptance/run.acceptance.ts', 'acceptance/run.ts'],
    misses: ['packages/a/b/src/acceptance-lock.ts', 'packages/a/b/xacceptance/run.ts'],
  },
  {
    id: 'contract-snapshot',
    level: 3,
    hits: ['packages/a/b/api/b.api.md', 'packages/a/b/api/agent-contract.api.md', 'api/x.api.md'],
    misses: [
      'packages/a/b/docs/public-api.md',
      'packages/a/b/api/b.api.md.bak',
      'packages/a/b/xapi/b.api.md',
      'packages/a/b/api/.api.md',
    ],
  },
] as const

it('keeps exactly the rows that quality.md lists, in table order', () => {
  expect(PATH_RULES.map(rule => [rule.id, rule.level])).toEqual(
    ROWS.map(row => [row.id, row.level]),
  )
})

it.each(ROWS)(
  'row $id raises the floor to L$level for its paths only, and gives a reason for the hit',
  ({ id, level, hits, misses }) => {
    const none = { toolchain: [], publicEntries: new Set<string>() }
    for (const hit of hits)
      expect(classify({ changed: [hit], ...none })).toEqual({
        level,
        hits: [expect.objectContaining({ id, paths: [hit], reason: expect.stringMatching(/\S/u) })],
      })
    for (const miss of misses) expect(classify({ changed: [miss], ...none }).hits).toEqual([])
  },
)

it('raises to L3 for toolchain paths and to L2 for public entries', () => {
  expect(
    classify({ changed: ['package.json'], toolchain: ['package.json'], publicEntries: new Set() }),
  ).toEqual({
    level: 3,
    hits: [expect.objectContaining({ id: 'toolchain', level: 3, paths: ['package.json'] })],
  })
  expect(
    classify({
      changed: ['packages/a/b/src/index.ts'],
      toolchain: [],
      publicEntries: new Set(['packages/a/b/src/index.ts']),
    }),
  ).toEqual({ level: 2, hits: [expect.objectContaining({ id: 'public-entry', level: 2 })] })
})

it('sets the floor to L0 for Markdown only and L1 for any other change', () => {
  const none = { toolchain: [], publicEntries: new Set<string>() }
  expect(classify({ changed: ['docs/a.md', 'README.md'], ...none }).level).toBe(0)
  expect(classify({ changed: ['docs/a.md', 'src/a.ts'], ...none }).level).toBe(1)
})

it('turns the toolchain list into git glob pathspecs and skips comments and blank lines', () => {
  expect(toolchainPathspecs('# header\n\nturbo.json\n  scripts/*.sh  \n# tail')).toEqual([
    ':(glob)turbo.json',
    ':(glob)scripts/*.sh',
  ])
})

it('reads public entry sources from the exports of a manifest', () => {
  expect(
    publicEntriesOf('packages/a/b', {
      exports: {
        '.': { source: './src/index.ts', import: './dist/index.js' },
        './cordis': { source: './src/cordis.ts' },
        './x': './dist/x.js',
      },
    }),
  ).toEqual(['packages/a/b/src/index.ts', 'packages/a/b/src/cordis.ts'])
  expect(publicEntriesOf('tools/t', { name: 't' })).toEqual([])
})

it('prints the level, each hit rule with its paths, and what was not judged', () => {
  const lines = riskLines(
    {
      level: 3,
      hits: [
        {
          id: 'ci',
          level: 3,
          reason: 'CI',
          paths: ['.github/a', '.github/b', '.github/c', '.github/d'],
        },
      ],
    },
    { base: '454d1574e1234', changed: 9, missing: '工具链路径' },
  )
  expect(lines).toEqual([
    '风险级别 L3（改动路径推出的下限，级别定义见 docs/engineering/quality.md）；不完整',
    '基线 454d1574e 到工作树，改动 9 个文件',
    '- L3 CI：.github/a、.github/b、.github/c 等 4 个',
    '没判的规则：工具链路径',
  ])
})

it('keeps the highest level when a lower-level rule is hit after a higher one', () => {
  expect(
    classify({
      changed: ['.github/a.yml', 'packages/a/b/src/index.ts'],
      toolchain: [],
      publicEntries: new Set(['packages/a/b/src/index.ts']),
    }),
  ).toMatchObject({
    level: 3,
    hits: [expect.objectContaining({ id: 'ci' }), expect.objectContaining({ id: 'public-entry' })],
  })
})

it('treats a file that only has .md inside its name as code, and no change at all as not documentation', () => {
  const none = { toolchain: [], publicEntries: new Set<string>() }
  expect(classify({ changed: ['docs/a.md.bak'], ...none }).level).toBe(1)
  expect(classify({ changed: [], ...none }).level).toBe(1)
})

it('skips exports that are missing, null or not objects, and keeps a source that leaves the member as written', () => {
  expect(publicEntriesOf('m', null)).toEqual([])
  expect(publicEntriesOf('m', 'x')).toEqual([])
  expect(publicEntriesOf('m', { exports: null })).toEqual([])
  expect(publicEntriesOf('m', { exports: { '.': null, './a': { source: 7 } } })).toEqual([])
  expect(publicEntriesOf('m', { exports: { '.': { source: '../shared/x.ts' } } })).toEqual([
    'm/../shared/x.ts',
  ])
})

it('lists up to three paths in full and counts the rest', () => {
  const hitWith = (paths: string[]) =>
    riskLines(
      { level: 3, hits: [{ id: 'ci', level: 3, reason: 'CI', paths }] },
      { base: 'b', changed: paths.length },
    ).at(-1)
  expect(hitWith(['a'])).toBe('- L3 CI：a')
  expect(hitWith(['a', 'b'])).toBe('- L3 CI：a、b')
  expect(hitWith(['a', 'b', 'c'])).toBe('- L3 CI：a、b、c')
  expect(hitWith(['a', 'b', 'c', 'd'])).toBe('- L3 CI：a、b、c 等 4 个')
})

it('prints a complete judgement with no hits as two lines, without the incomplete mark', () => {
  expect(riskLines({ level: 1, hits: [] }, { base: '454d1574e1234', changed: 2 })).toEqual([
    '风险级别 L1（改动路径推出的下限，级别定义见 docs/engineering/quality.md）',
    '基线 454d1574e 到工作树，改动 2 个文件，没有命中路径规则',
  ])
})
