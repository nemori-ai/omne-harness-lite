import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  actualArchitectureOf,
  compareActualArchitectures,
  type ActualArchitectureDocument,
  type ActualMember,
  type ArchitectureSource,
} from '../src/arch/actual.ts'
import {
  buildArchitectureView,
  RELATIONS,
  selectArchitectureView,
  type ViewSelection,
} from '../src/arch/view.ts'
import { renderPage } from '../src/report/render.ts'
import { buildReport } from '../src/metrics/report.ts'

const bands = { green: 8, yellow: 12, red: 20 }
it('rejects JSON output paths that would overwrite report artifacts before writing', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'n2-output-')))
  try {
    for (const name of ['report.html', 'graph.json', 'summary.md']) {
      const result = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          fileURLToPath(new URL('../src/arch/cli.ts', import.meta.url)),
          '--report',
          dir,
          '--out',
          join(dir, name),
        ],
        { encoding: 'utf8' },
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('--out must not overwrite a report file')
      expect(result.stdout).toBe('')
      expect(readdirSync(dir)).toEqual([])
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
const selection: ViewSelection = {
  group: '',
  focus: '',
  neighbors: true,
  changes: 'current',
  relations: Object.keys(RELATIONS) as (keyof typeof RELATIONS)[],
  complexity: false,
  coupling: false,
}
const plugin = (name: string, body: string) =>
  `import type {Context} from '@deepseek-ai/cordis'; export const plugin={name:'${name}',inject:['storage'],apply(ctx:Context){${body}}}`
function source(code: Readonly<Record<string, string>>, commit: string): ArchitectureSource {
  const texts = new Map<string, string>()
  const members: ActualMember[] = Object.entries(code).map(([path, body]) => {
    const manifest = {
      name: `@omne-harness/${path.split('/').pop()}`,
      exports: { '.': './src/index.ts' },
    }
    texts.set(`${path}/package.json`, JSON.stringify(manifest))
    texts.set(`${path}/src/index.ts`, body)
    return {
      id: path,
      path,
      name: manifest.name,
      category: 'product',
      manifest: { path: `${path}/package.json`, value: manifest },
      sources: [`${path}/src/index.ts`],
      dataFiles: [],
    }
  })
  return {
    source: {
      root: '/fixture',
      kind: 'revision',
      commit,
      dirty: false,
      inputDirty: false,
      unversionedInputs: [],
    },
    patterns: ['packages/*/*'],
    members,
    discoveredConfigurationFiles: [],
    snapshot: {
      texts,
      members: members.map(item => ({
        path: item.path,
        name: item.name,
        group: item.path.split('/').slice(0, -1).join('/'),
      })),
    },
  }
}
const first = {
  'packages/core/storage': 'export interface Storage {}',
  'packages/infra/sql': plugin('sql', "ctx.provide('storage',{});ctx.provide('storage',{})"),
  'packages/infra/memory': plugin('memory', "ctx.provide('storage',{})"),
  'packages/infra/clock': plugin(
    'clock',
    "ctx.get('clock-optional');ctx.on('time/tick',()=>{});ctx.serial('time/tick')",
  ),
}
function document(code: Readonly<Record<string, string>> = first): ActualArchitectureDocument {
  return {
    schemaVersion: 1,
    kind: 'actual-architecture',
    generatedAt: '2026-10-03T00:00:00Z',
    current: actualArchitectureOf(source(code, 'head')),
  }
}
function difference(): ActualArchitectureDocument {
  const baseline = actualArchitectureOf(source(first, 'base'))
  const current = actualArchitectureOf(
    source(
      {
        'packages/core/storage': first['packages/core/storage'],
        'packages/infra/sql': plugin('sql', "ctx.provide('storage',{});ctx.get('new-service')"),
        'packages/infra/clock': first['packages/infra/clock'],
        'packages/infra/new': plugin('new', "ctx.provide('other',{})"),
      },
      'head',
    ),
  )
  return {
    ...document(),
    current,
    baseline,
    difference: compareActualArchitectures(baseline, current),
  }
}
describe('architecture view projection', () => {
  it('keeps endpoint conformance rows through encoded group identities and member focus', () => {
    const graph = buildArchitectureView(document(), bands)
    const a = 'packages/infra/sql',
      b = 'packages/core/storage'
    const rows = [
      {
        id: 'entry',
        rule: 'LAYER-ENTRY' as const,
        state: 'deviation' as const,
        age: 'stock' as const,
        member: a,
        targetMember: b,
        key: 'storage',
        reason: 'bypass',
        expected: 'accepted.md',
        sites: [{ path: a + '/src/index.ts', line: 1 }],
      },
    ]
    const conformance = {
      schemaVersion: 1 as const,
      kind: 'architecture-conformance' as const,
      current: { path: 'constraints.json', source: graph.source, value: null, sources: [] },
      comparedWith: 'current' as const,
      rows,
      changes: [],
      sourceChanges: [],
      changeState: 'no-baseline' as const,
      coverage: [],
      limitations: [],
    }
    const review = { ...graph, conformance }
    expect(selectArchitectureView(review, selection).conformance?.rows).toEqual(rows)
    expect(
      selectArchitectureView(review, { ...selection, group: 'packages/core', neighbors: false })
        .conformance?.rows,
    ).toEqual(rows)
    expect(
      selectArchitectureView(review, {
        ...selection,
        focus: JSON.stringify(['member', b]),
        neighbors: false,
      }).conformance?.rows,
    ).toEqual(rows)
    expect(
      selectArchitectureView(review, {
        ...selection,
        focus: JSON.stringify(['member', 'packages/infra/memory']),
        neighbors: false,
      }).conformance?.rows,
    ).toEqual([])
  })
  it('keeps function-free members in the overview and preserves static candidate multiplicity', () => {
    const graph = buildArchitectureView(document(), bands)
    expect(
      graph.nodes.find(node => node.member === 'packages/core/storage')?.complexity?.functions,
    ).toBe(0)
    expect(selectArchitectureView(graph, selection)).toMatchObject({ overview: true, edges: [] })
    expect(graph.groups.map(group => group.label)).toEqual(['packages/core', 'packages/infra'])
    const providers = graph.edges.filter(
      edge => edge.kind === 'provides' && edge.label === 'storage',
    )
    expect(providers).toHaveLength(2)
    expect(
      providers.find(edge => edge.from.includes('/sql'))?.evidence[0]?.occurrences,
    ).toHaveLength(2)
    expect(graph.document.current.candidateProviders[0]?.runtimeSelection).toBe('not-observed')
  })
  it('focuses through a shared key without connecting consumers to an arbitrarily selected provider', () => {
    const graph = buildArchitectureView(document(), bands)
    const focus = JSON.stringify(['member', 'packages/infra/clock'])
    const view = selectArchitectureView(graph, {
      ...selection,
      focus,
      relations: ['injects', 'provides'],
    })
    expect(
      view.nodes
        .filter(node => node.kind === 'member')
        .map(node => node.member)
        .sort(),
    ).toEqual(['packages/infra/clock', 'packages/infra/memory', 'packages/infra/sql'])
    expect(view.edges.every(edge => JSON.parse(edge.to)[0] === 'service')).toBe(true)
    expect(
      selectArchitectureView(graph, { ...selection, focus, neighbors: false }).nodes,
    ).toHaveLength(1)
  })
  it('retains deleted endpoints and BASE evidence while preserving semantic moves', () => {
    const doc = difference(),
      graph = buildArchitectureView(doc, bands)
    const view = selectArchitectureView(graph, {
      ...selection,
      group: 'packages/infra',
      changes: 'removed',
    })
    expect(
      view.nodes.some(node => node.member === 'packages/infra/memory' && node.change === 'removed'),
    ).toBe(true)
    expect(
      view.edges.every(
        edge =>
          edge.change === 'removed' && edge.evidence.every(item => item.version === 'baseline'),
      ),
    ).toBe(true)
    const ids = new Set(view.nodes.map(node => node.id))
    expect(view.edges.every(edge => ids.has(edge.from) && ids.has(edge.to))).toBe(true)
    // Removing one identical provide occurrence is an evidence change, not a removed semantic relationship.
    expect(
      graph.edges.find(edge => edge.kind === 'provides' && edge.from.includes('/sql'))?.change,
    ).toBe('present')
    expect(
      graph.nodes.find(node => node.label === 'storage' && node.kind === 'service')?.change,
    ).toBe('present')
  })
  it('does not clutter a focused view with unrelated imports between adjacent providers', () => {
    const graph = buildArchitectureView(
      document({
        ...first,
        'packages/infra/sql':
          "import {plugin as memory} from '@omne-harness/memory';" + first['packages/infra/sql'],
      }),
      bands,
    )
    const focus = JSON.stringify(['member', 'packages/infra/clock'])
    const view = selectArchitectureView(graph, { ...selection, focus })
    expect(
      graph.edges.some(
        edge =>
          edge.kind === 'runtime-import' &&
          edge.from.includes('/sql') &&
          edge.to.includes('/memory'),
      ),
    ).toBe(true)
    expect(
      view.edges.some(
        edge =>
          edge.kind === 'runtime-import' &&
          edge.from.includes('/sql') &&
          edge.to.includes('/memory'),
      ),
    ).toBe(false)
    expect(
      view.edges.filter(edge => edge.kind === 'provides' && edge.label === 'storage'),
    ).toHaveLength(2)
  })
  it('shows only the selected relationship categories and exports no hidden endpoints', () => {
    const graph = buildArchitectureView(document(), bands)
    const view = selectArchitectureView(graph, {
      ...selection,
      group: 'packages/infra',
      relations: ['listens'],
    })
    expect(view.edges.map(edge => edge.kind)).toEqual(['listens'])
    expect(view.nodes.some(node => node.kind === 'event' && node.label === 'time/tick')).toBe(true)
    const empty = selectArchitectureView(graph, { ...selection, focus: 'absent', relations: [] })
    expect(empty.nodes).toEqual([])
    expect(empty.edges).toEqual([])
  })
  it('uses input two-version identities, including a new reference to an existing service key', () => {
    const graph = buildArchitectureView(difference(), bands)
    const added = selectArchitectureView(graph, {
      ...selection,
      group: 'packages/infra',
      changes: 'added',
    })
    expect(added.edges.every(edge => edge.change === 'added')).toBe(true)
    expect(added.nodes.some(node => node.label === 'new-service')).toBe(true)
    expect(added.nodes.some(node => node.member === 'packages/infra/new')).toBe(true)
    expect(
      graph.edges
        .filter(edge => edge.change === 'added')
        .flatMap(edge => edge.evidence.map(item => item.id))
        .sort(),
    ).toEqual(
      [
        ...(graph.document.difference?.facts.added
          .filter(fact => fact.kind !== 'plugin')
          .map(fact => fact.id) ?? []),
        ...(graph.document.difference?.imports.added.map(item => item.id) ?? []),
      ].sort(),
    )
  })
  it('does not mix type and runtime imports and retains all import identities when aggregating', () => {
    const doc = document({
      ...first,
      'packages/infra/consumer':
        "import type {Storage} from '@omne-harness/storage'; import {a,b} from '@omne-harness/sql'",
    })
    const graph = buildArchitectureView(doc, bands)
    expect(
      graph.edges.find(edge => edge.kind === 'type-import' && edge.to.includes('core/storage'))
        ?.evidence,
    ).toHaveLength(1)
    expect(
      graph.edges.find(edge => edge.kind === 'runtime-import' && edge.to.includes('infra/sql'))
        ?.evidence,
    ).toHaveLength(2)
  })
  it('collapses direct cross-group imports without inferring bindings from shared services', () => {
    const graph = buildArchitectureView(
      document({
        ...first,
        'apps/host':
          "import {plugin as sql} from '@omne-harness/sql'; import type {Storage} from '@omne-harness/storage'",
        'packages/infra/consumer': "import {a,b} from '@omne-harness/storage'",
      }),
      bands,
    )
    const view = selectArchitectureView(graph, selection)
    expect(view.nodes.every(node => node.kind === 'group')).toBe(true)
    expect(view.edges).toHaveLength(3)
    expect(view.edges.every(edge => ['runtime-import', 'type-import'].includes(edge.kind))).toBe(
      true,
    )
    const ids = new Set(view.nodes.map(node => node.id))
    expect(
      view.edges.every(edge => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to),
    ).toBe(true)
    const infra = JSON.stringify(['group', 'packages/infra']),
      core = JSON.stringify(['group', 'packages/core'])
    expect(view.edges.find(edge => edge.from === infra && edge.to === core)?.evidence).toHaveLength(
      2,
    )
    expect(
      selectArchitectureView(graph, { ...selection, relations: ['injects', 'provides'] }).edges,
    ).toEqual([])
    const expected = graph.document.current.imports.filter(
      item => item.target.kind === 'workspace' && item.member !== item.target.member,
    )
    expect(view.edges.flatMap(edge => edge.evidence.map(item => item.id)).sort()).toEqual(
      expected.map(item => item.id).sort(),
    )
  })
  it('preserves overview change evidence and BASE endpoints independently of group existence', () => {
    const before = { ...first, 'apps/old': "import {plugin} from '@omne-harness/sql'" }
    const after = {
      ...first,
      'apps/new': "import type {Storage} from '@omne-harness/storage'",
    }
    const baseline = actualArchitectureOf(source(before, 'base'))
    const current = actualArchitectureOf(source(after, 'head'))
    const graph = buildArchitectureView(
      {
        ...document(),
        current,
        baseline,
        difference: compareActualArchitectures(baseline, current),
      },
      bands,
    )
    const removed = selectArchitectureView(graph, { ...selection, changes: 'removed' })
    expect(removed.edges).toHaveLength(1)
    expect(removed.edges[0]?.evidence.every(item => item.version === 'baseline')).toBe(true)
    expect(removed.nodes.some(node => node.label === 'apps/old' && node.change === 'removed')).toBe(
      true,
    )
    expect(
      removed.nodes.some(node => node.label === 'packages/infra' && node.change === 'present'),
    ).toBe(true)
    const added = selectArchitectureView(graph, { ...selection, changes: 'added' })
    expect(added.edges).toHaveLength(1)
    expect(added.edges[0]?.kind).toBe('type-import')
    expect(added.edges[0]?.evidence.every(item => item.version === 'current')).toBe(true)
  })
  it('embeds an inert payload and preserves the existing metric page without external resources', () => {
    const doc = document({
      'packages/infra/evil': plugin(
        'evil',
        "ctx.provide('</script><img src=x onerror=alert(1)>',{})",
      ),
    })
    const view = buildArchitectureView(doc, bands)
    const html = renderPage(
      buildReport({
        files: [],
        graph: { members: [], edges: [], findings: [] },
        thresholds: { warn: 10, alert: 12 },
        bands,
      }),
      {
        head: 'head',
        shortHead: 'head',
        branch: 'b',
        dirty: false,
        generatedAt: doc.generatedAt,
        summary: [],
        changedEdgeLimit: 24,
      },
      view,
    )
    // 架构数据以 gzip + base64 内联，解压后与渲染前的投影逐字节一致。
    const packed =
      /<script type="application\/gzip" id="architecture-data" data-encoding="base64">([A-Za-z0-9+/=]+)<\/script>/u.exec(
        html,
      )?.[1]
    expect(packed).toBeDefined()
    expect(gunzipSync(Buffer.from(packed ?? '', 'base64')).toString('utf8')).toBe(
      JSON.stringify(view),
    )
    expect(html).toContain('new DecompressionStream(')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|fetch\(/u)
    expect(html).toContain('architecture-pane')
    expect(html).toContain('metrics-pane')
    expect(html).toContain('确认配置选择与实际运行绑定：未观测')
    // elkjs, the React Flow island, the embedded data, the metrics script and the page script.
    expect(html.match(/<\/script>/gu)).toHaveLength(6)
    expect(html).toContain('window.ArchitectureFlow')
    expect(html).toContain('.react-flow')
  })
})
