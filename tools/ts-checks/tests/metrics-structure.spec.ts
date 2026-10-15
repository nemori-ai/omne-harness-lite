import { describe, expect, it } from 'vitest'
import type { EdgeRow, GroupRow, MemberRow, Report } from '../src/metrics/report.ts'
import { visibleEdges } from '../src/metrics/flow/edges.ts'
import { columnsFor, structureLayout, type Box } from '../src/metrics/flow/layout.ts'

function member(path: string, group: string, layer: number): MemberRow {
  return {
    path,
    group,
    layer,
    functions: 1,
    mu: 1,
    sigma: 0,
    max: 1,
    risk: 1,
    grade: 10,
    band: 'green',
    overWarn: 0,
    overAlert: 0,
    changed: false,
    changedOver: 0,
    coverage: 'not-run',
    fanIn: 0,
    fanOut: 0,
    instability: 0,
  }
}

function edge(from: string, to: string, extra: Partial<EdgeRow> = {}): EdgeRow {
  return {
    from,
    to,
    count: 1,
    sites: [],
    violating: false,
    changed: false,
    ...extra,
  }
}

function group(name: string, members: readonly string[]): GroupRow {
  return { group: name, risk: 1, grade: 10, members }
}

const core = Array.from({ length: 11 }, (_, index) => `packages/core/c${index}`)
const layout: GroupRow[][] = [
  [group('packages/core', core)],
  [
    group('packages/infra', ['packages/infra/a', 'packages/infra/b']),
    group('packages/tools', ['packages/tools/t']),
  ],
  [group('apps', ['apps/cli'])],
]
const members = [
  ...core.map(path => member(path, 'packages/core', 0)),
  member('packages/infra/a', 'packages/infra', 1),
  member('packages/infra/b', 'packages/infra', 1),
  member('packages/tools/t', 'packages/tools', 1),
  member('apps/cli', 'apps', 2),
  // 没有登记层位的组：不在 layout 里，仍要有位置。
  member('lost/x', 'lost', 1),
]

function report(edges: readonly EdgeRow[] = []): Report {
  return {
    thresholds: { warn: 10, alert: 12 },
    bands: { green: 5, yellow: 10, red: 15 },
    coverageEnabled: false,
    hasBase: true,
    layout,
    members,
    functions: [],
    edges,
    findings: [],
    failedTests: [],
    staleDist: [],
  }
}

const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height
const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('structure layout', () => {
  const result = structureLayout(report())

  it('places every member once, inside its group, without overlap', () => {
    expect(result.members.map(box => box.path).sort()).toEqual(members.map(row => row.path).sort())
    for (const box of result.members) {
      const owner = result.groups.find(item => item.group === box.group)
      expect(owner, box.path).toBeDefined()
      expect(inside(box, owner as Box), box.path).toBe(true)
    }
    for (const [index, a] of result.members.entries())
      for (const b of result.members.slice(index + 1))
        expect(overlap(a, b), `${a.path} ${b.path}`).toBe(false)
    for (const [index, a] of result.groups.entries())
      for (const b of result.groups.slice(index + 1))
        expect(overlap(a, b), `${a.group} ${b.group}`).toBe(false)
  })

  it('draws layers as columns from the innermost on the left, unplaced groups last', () => {
    expect(result.layers.map(box => box.layer)).toEqual([0, 1, 2, undefined])
    expect(result.layers.map(box => box.label)).toEqual([
      '第 0 层 · 不依赖别的组',
      '第 1 层',
      '第 2 层',
      '未分层的组',
    ])
    for (const [index, box] of result.layers.slice(1).entries()) {
      const left = result.layers[index] as Box
      expect(box.x).toBeGreaterThanOrEqual(left.x + left.width)
    }
    for (const box of result.groups) {
      const layer = result.layers.find(item => item.layer === box.layer)
      expect(inside(box, layer as Box), box.group).toBe(true)
    }
  })

  it('keeps the member order of report.layout row by row and caps the grid width', () => {
    const order = result.members
      .filter(box => box.group === 'packages/core')
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(box => box.path)
    expect(order).toEqual(core)
    expect(columnsFor(1)).toBe(1)
    expect(columnsFor(42)).toBe(4)
  })
})

describe('structure edges', () => {
  const edges = [
    edge('apps/cli', 'packages/infra/a', { violating: true }),
    edge('packages/infra/a', 'packages/core/c0'),
    edge('packages/infra/b', 'packages/core/c1', { changed: true }),
    edge('packages/tools/t', 'packages/core/c2', { changed: true }),
    edge('packages/tools/t', 'packages/infra/b'),
    edge('apps/cli', 'packages/tools/t'),
  ]

  it('draws violations and changed edges up to the limit when nothing is selected', () => {
    const shown = visibleEdges(report(edges), { selected: null, groupLines: false, limit: 2 })
    expect(shown.note).toBe('')
    expect(shown.edges.map(item => [item.id, item.tone, item.dashed])).toEqual([
      ['apps/cli>packages/infra/a', 'bad', false],
      ['packages/infra/b>packages/core/c1', 'changed', false],
      ['packages/tools/t>packages/core/c2', 'changed', false],
    ])
  })

  it('keeps changed edges as card marks only and explains why when they exceed the limit', () => {
    const shown = visibleEdges(report(edges), { selected: null, groupLines: false, limit: 1 })
    expect(shown.edges.map(item => item.tone)).toEqual(['bad'])
    expect(shown.note).toContain('本次变更触及 2 条')
  })

  it('draws only the selected member and violations elsewhere, dashing edges that point at it', () => {
    const shown = visibleEdges(report(edges), {
      selected: 'packages/infra/b',
      groupLines: true,
      limit: 0,
    })
    expect(shown.edges.map(item => [item.id, item.dashed])).toEqual([
      ['apps/cli>packages/infra/a', false],
      ['packages/infra/b>packages/core/c1', false],
      ['packages/tools/t>packages/infra/b', true],
    ])
  })

  it('adds deduplicated group lines that skip the innermost layer and the same group', () => {
    const shown = visibleEdges(report(edges), { selected: null, groupLines: true, limit: 0 })
    const groups = shown.edges.filter(item => item.tone === 'group').map(item => item.id)
    expect(groups).toEqual([
      'group:apps>packages/infra',
      'group:packages/tools>packages/infra',
      'group:apps>packages/tools',
    ])
  })
})
