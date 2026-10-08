import { describe, expect, it } from 'vitest'
import type { ElkNode } from 'elkjs'
import { architectureFlowBundle } from '../src/arch/flow/bundle.ts'
import { architectureSvg } from '../src/arch/flow/export-svg.ts'
import type { FlowProps } from '../src/arch/flow/api.ts'
import {
  RELATIONS,
  type SelectedArchitecture,
  type ViewEdge,
  type ViewNode,
} from '../src/arch/view.ts'

const source = {
  repository: 'r',
  commit: 'c',
  kind: 'worktree',
  dirty: false,
  inputDirty: false,
} as const

function node(id: string, extra: Partial<ViewNode> = {}): ViewNode {
  return {
    id,
    label: id,
    kind: 'member',
    change: 'present',
    member: `packages/core/${id}`,
    ...extra,
  }
}

function props(overrides: Partial<FlowProps> = {}): FlowProps {
  const a = node('a'),
    b = node('b', { change: 'added' })
  const edge: ViewEdge = {
    id: 'a-b',
    from: 'a',
    to: 'b',
    kind: 'runtime-import',
    label: 'x',
    change: 'present',
    evidence: [],
  }
  const selected = {
    schemaVersion: 1,
    kind: 'architecture-selection',
    source,
    selection: {
      group: 'packages/core',
      focus: '',
      neighbors: true,
      changes: 'current',
      relations: ['runtime-import'],
      complexity: false,
      coupling: false,
    },
    overview: false,
    nodes: [a, b],
    edges: [edge],
  } as unknown as SelectedArchitecture
  const layout: ElkNode = {
    id: 'root',
    width: 700,
    height: 300,
    children: [
      { id: 'a', x: 24, y: 32, width: 270, height: 100 },
      { id: 'b', x: 404, y: 32, width: 270, height: 100 },
    ],
    edges: [
      {
        id: 'a-b',
        sources: ['a'],
        targets: ['b'],
        sections: [
          { id: 's', startPoint: { x: 294, y: 82 }, endPoint: { x: 404, y: 82 }, bendPoints: [] },
        ],
        labels: [{ text: '运行导入 <x>', x: 320, y: 60, width: 60, height: 18 }],
      },
    ],
  }
  return {
    selected,
    layout,
    relations: RELATIONS,
    focus: '',
    overlays: { complexity: false, coupling: false, conformance: false },
    violations: {},
    kindOf: () => '组件 / 包',
    onNode: () => undefined,
    onEdge: () => undefined,
    ...overrides,
  }
}

describe('architecture flow island', () => {
  it('bundles React, @xyflow/react and the island into one inert inline script', () => {
    const bundle = architectureFlowBundle()
    expect(bundle.script).toContain('ArchitectureFlow')
    expect(bundle.script).not.toContain('</script')
    expect(bundle.script).not.toMatch(/<script[^>]+src=|<link[^>]+href=|fetch\(/u)
    expect(bundle.style).toContain('.react-flow')
    expect(architectureFlowBundle()).toBe(bundle)
  })

  it('exports the full subgraph as a standalone SVG from the ELK geometry with escaped text', () => {
    const svg = architectureSvg(props())
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('data-node-id="a"')
    expect(svg).toContain('data-node-id="b"')
    expect(svg).toContain('data-edge-id="a-b"')
    expect(svg).toContain('M294,82 L404,82')
    expect(svg).toContain('运行导入 &lt;x&gt;')
    expect(svg).not.toContain('<x>')
    expect(svg).toContain('实际架构 · packages/core')
    expect(svg).toContain('蓝＝新增')
    expect(svg).toContain('stroke="#1f6feb" stroke-width="3"')
  })

  it('fails loudly on missing geometry instead of drawing a partial graph', () => {
    const base = props()
    expect(() => architectureSvg({ ...base, layout: { ...base.layout, children: [] } })).toThrow(
      'Missing node geometry',
    )
    expect(() => architectureSvg({ ...base, layout: { ...base.layout, edges: [] } })).toThrow(
      'Missing edge geometry',
    )
  })

  it('shows overlays only when switched on', () => {
    const base = props()
    const withOverlays = architectureSvg({
      ...base,
      overlays: { complexity: true, coupling: true, conformance: true },
      violations: { a: 2 },
      selected: {
        ...base.selected,
        nodes: base.selected.nodes.map(item =>
          item.id === 'a'
            ? {
                ...item,
                complexity: { functions: 3, risk: 9.5, max: 12, band: 'red' },
                fanIn: 1,
                fanOut: 2,
              }
            : item,
        ),
      },
    })
    expect(withOverlays).toContain('偏离 2 · CC 最大 12 / 风险 9.5 · 入 1 / 出 2')
    expect(withOverlays).toContain('data-conformance="deviation"')
    expect(withOverlays).toContain('fill="#f8d2cf"')
    expect(architectureSvg(base)).not.toContain('偏离')
  })
})
