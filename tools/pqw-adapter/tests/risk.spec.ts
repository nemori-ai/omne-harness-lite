import { expect, it } from 'vitest'
import {
  classify,
  PATH_RULES,
  publicEntriesOf,
  riskLines,
  toolchainPathspecs,
} from '../src/risk.ts'

// 路径表逐行：每条规则一个命中例与一个不该命中的近邻。
const ROWS = [
  { id: 'ci', level: 3, hit: '.github/workflows/check.yml', miss: 'docs/.github-notes.md' },
  {
    id: 'gate',
    level: 3,
    hit: 'tools/dev-flow/src/integration/gate-cli.ts',
    miss: 'tools/dev-flow/src/integration/worktree-cli.ts',
  },
  {
    id: 'acceptance',
    level: 3,
    hit: 'packages/a/b/acceptance/run.acceptance.ts',
    miss: 'packages/a/b/src/acceptance-lock.ts',
  },
  {
    id: 'contract-snapshot',
    level: 3,
    hit: 'packages/a/b/api/b.api.md',
    miss: 'packages/a/b/docs/public-api.md',
  },
] as const

it('keeps exactly the rows that quality.md lists, in table order', () => {
  expect(PATH_RULES.map(rule => [rule.id, rule.level])).toEqual(
    ROWS.map(row => [row.id, row.level]),
  )
})

it.each(ROWS)(
  'row $id raises the floor to L$level for its paths only',
  ({ id, level, hit, miss }) => {
    const none = { toolchain: [], publicEntries: new Set<string>() }
    expect(classify({ changed: [hit], ...none })).toEqual({
      level,
      hits: [expect.objectContaining({ id, paths: [hit] })],
    })
    expect(classify({ changed: [miss], ...none }).hits).toEqual([])
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
