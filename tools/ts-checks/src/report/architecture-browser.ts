/// <reference lib="dom" preserve="true" />
import type {
  ArchitectureView,
  RelationKind,
  ViewEdge,
  ViewNode,
  ViewSelection,
} from '../arch/view.ts'
import type { selectArchitectureView } from '../arch/view.ts'
import type { ELK, ElkNode } from 'elkjs'
import type { architectureLayoutInput } from './architecture-layout.ts'
import type { architectureViewport } from './viewport.ts'
import type { architectureMatrix } from './matrix.ts'
import type { conformanceBrowser } from './conformance-browser.ts'
import type { ArchitectureFlowApi, FlowHandle, FlowProps } from './flow/architecture/api.ts'
import type { ReportUiApi } from './flow/architecture/controls-api.ts'

/** Embedded after TypeScript erasure. Only the supplied projection function crosses this boundary. */
export function architectureBrowser(
  graph: ArchitectureView,
  selectView: typeof selectArchitectureView,
  layoutInput: typeof architectureLayoutInput,
  attachViewport: typeof architectureViewport,
  drawMatrix: typeof architectureMatrix,
  engine: Pick<ELK, 'layout'>,
  attachConformance: typeof conformanceBrowser,
  flow: ArchitectureFlowApi,
  ui: ReportUiApi,
): void {
  const required = (id: string): HTMLElement => {
    const element = document.getElementById(id)
    if (element === null) throw new Error(`Missing architecture element ${id}`)
    return element
  }
  // 表单控件由 antd 渲染；这里只经句柄读写，取值、设值与 onChange 的语义与原生控件一致。
  const group = ui.select('arch-group'),
    focus = ui.select('arch-focus'),
    changes = ui.select('arch-changes')
  const neighbors = ui.checkbox('arch-neighbors'),
    complexity = ui.checkbox('arch-complexity'),
    coupling = ui.checkbox('arch-coupling')
  const diagram = required('arch-diagram'),
    detail = required('arch-detail'),
    list = required('arch-relations')
  const nodeById = new Map([...graph.nodes, ...graph.groups].map(node => [node.id, node]))
  const exportButtons = ['arch-export-svg', 'arch-export-json'].map(id => ui.button(id))
  let request = 0
  let viewport: ReturnType<typeof architectureViewport> | undefined
  let flowHandle: FlowHandle | undefined
  let geometry: { width: number; height: number } | undefined
  let overviewMode: 'matrix' | 'graph' = 'matrix'
  const relations = new Map<RelationKind, { readonly checked: boolean }>()
  const element = (tag: string, text = '', className = ''): HTMLElement => {
    const el = document.createElement(tag)
    el.textContent = text
    el.className = className
    return el
  }
  const button = (text: string, action: () => void): HTMLButtonElement => {
    const el = document.createElement('button')
    el.textContent = text
    el.type = 'button'
    el.addEventListener('click', action)
    return el
  }
  const option = (value: string, label: string) => ({ value, label })
  const kindLabel = {
    member: '组件 / 包',
    service: '服务键 · 静态同名',
    event: '事件名 · 静态同名',
    external: '外部代码依赖',
    group: '目录聚合',
  }
  const nodeKind = (node: ViewNode): string =>
    node.category === 'development' ? '开发成员' : kindLabel[node.kind]
  const changeLabel = { present: '', added: '新增', removed: '已删除 · BASE' }
  const scopeText = `HEAD ${graph.source.commit} · ${graph.source.kind} · dirty ${graph.source.dirty} / inputDirty ${graph.source.inputDirty}`
  required('arch-coordinate').textContent =
    scopeText +
    (graph.baseline === undefined
      ? ' · 无架构差分基线'
      : ` · 架构精确 BASE ${graph.baseline.commit}`)
  required('arch-counts').textContent =
    `产品成员 ${graph.document.current.scope.productMembers.length} · 静态事实 ${graph.document.current.facts.length} · 具体未知 ${graph.document.current.unknown.length}`
  required('arch-measurement').textContent =
    `圈复杂度算法 functionMetrics · 色带来源 ${graph.measurement.configSource} · 无函数表示无测量单元，覆盖率未提供；颜色不表示架构符合性。`
  group.setOptions([
    option('', '系统总览'),
    ...graph.groups.map(node => option(node.group ?? '', node.label)),
  ])
  focus.setOptions([
    option('', '不聚焦'),
    ...graph.nodes
      .filter(node => node.kind !== 'external')
      .map(node =>
        option(
          node.id,
          `${nodeKind(node)} · ${node.member ?? node.label}${changeLabel[node.change] === '' ? '' : ' · ' + changeLabel[node.change]}`,
        ),
      ),
  ])
  if (graph.baseline === undefined)
    changes.setOptions(
      changes.options.map(item => ({ ...item, disabled: item.value !== 'current' })),
    )
  for (const [key, label] of Object.entries(graph.relations)) {
    const control = ui.checkboxElement(label, true)
    relations.set(key as RelationKind, control.handle)
    required('arch-kinds').append(control.element)
    control.handle.onChange(render)
  }
  const selection = (): ViewSelection => {
    const value = changes.value
    if (!['current', 'all', 'added', 'removed', 'changed'].includes(value))
      throw new Error('Invalid change selection')
    return {
      group: group.value,
      focus: focus.value,
      neighbors: neighbors.checked,
      changes: value as ViewSelection['changes'],
      relations: [...relations].filter(([, input]) => input.checked).map(([key]) => key),
      complexity: complexity.checked,
      coupling: coupling.checked,
      conformance: ui.checkbox('arch-conformance').checked,
    }
  }
  let shown = selectView(graph, selection())
  const intent = attachConformance(
    graph,
    member => {
      showArchitecture()
      const node = graph.nodes.find(item => item.member === member)
      if (node !== undefined) focusNode(node)
    },
    () => shown,
    ui,
  )
  const conformance = ui.checkbox('arch-conformance')
  function download(name: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const link = document.createElement('a')
    link.download = name
    link.href = url
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function showMetrics(member?: string): void {
    required('architecture-pane').hidden = true
    required('conformance-pane').hidden = true
    required('metrics-pane').hidden = false
    window.dispatchEvent(new Event('resize'))
    if (member !== undefined)
      window.dispatchEvent(new CustomEvent('architecture-member', { detail: member }))
  }
  function showArchitecture(): void {
    required('metrics-pane').hidden = true
    required('architecture-pane').hidden = false
    required('conformance-pane').hidden = true
  }
  function focusNode(node: ViewNode): void {
    if (node.kind === 'external') {
      // No group to expand into: show the declaration without changing the selection.
      showNode(node)
      return
    }
    if (node.kind === 'group') {
      group.value = node.group ?? ''
      focus.value = ''
    } else {
      group.value = node.group ?? ''
      focus.value = node.id
    }
    render()
    showNode(node)
  }
  function showNode(node: ViewNode): void {
    detail.replaceChildren(
      element('h2', node.member ?? node.label),
      element(
        'p',
        `${nodeKind(node)} · ${changeLabel[node.change] || '静态源码声明'}。服务/事件同名聚合不表示实际绑定。`,
      ),
    )
    if (node.kind === 'group') {
      detail.append(
        element('p', '依据 workspace 清单及路径聚合。目录组不表示运行、部署、事务或租户边界。'),
      )
      return
    }
    if (node.complexity !== undefined)
      detail.append(
        element(
          'p',
          node.complexity.functions === 0
            ? '无函数测量单元；成员仍存在。'
            : `函数 ${node.complexity.functions} · 最大 CC ${node.complexity.max} · CC 风险值 ${node.complexity.risk}`,
        ),
      )
    if (node.member !== undefined && node.change !== 'removed')
      detail.append(ui.action('查看此成员的复杂度', () => showMetrics(node.member)))
    if (node.member !== undefined) {
      const rows = intent.forMember(node.member)
      detail.append(
        element(
          'p',
          `静态符合性：偏离 ${rows.filter(row => row.state === 'deviation').length}，未知 ${rows.filter(row => row.state === 'unknown').length}；范围有限，不证明行为。`,
        ),
        ui.action('查看此成员的符合性', () => intent.open(node.member)),
      )
    }
    const versions =
      node.change === 'removed' && graph.document.baseline !== undefined
        ? graph.document.baseline
        : graph.document.current
    const members =
      node.member === undefined ? [] : versions.members.filter(item => item.path === node.member)
    for (const member of members)
      detail.append(
        element(
          'p',
          `清单来源 ${member.manifest.path} · ${member.category} · TS 源 ${member.sources.length} · 数据文件 ${member.dataFiles.length}`,
        ),
      )
    const facts = versions.facts.filter(fact =>
      node.member === undefined ? fact.key === node.label : fact.member === node.member,
    )
    for (const fact of facts)
      detail.append(
        element(
          'p',
          `${fact.kind} · ${fact.key} · 插件 ${fact.plugin ?? '未标识'} · 作用域 ${fact.scope} · ${fact.path}:${fact.line}`,
        ),
      )
    if (node.kind === 'service') {
      const providers = versions.facts.filter(
        fact => fact.kind === 'provides' && fact.key === node.label,
      )
      detail.append(
        element('h3', `候选提供者 ${providers.length}`),
        element('p', '确认配置选择：未观测；实际运行绑定：未观测。'),
      )
      for (const fact of providers)
        detail.append(
          element('p', `${fact.member} · 插件 ${fact.plugin ?? '未标识'} · 作用域 ${fact.scope}`),
        )
    }
  }
  function showEdge(edge: ViewEdge): void {
    const findings =
      graph.conformance?.rows.filter(
        row => row.relation !== undefined && edge.evidence.some(e => e.id === row.relation?.id),
      ) ?? []
    detail.replaceChildren(
      element('h2', graph.relations[edge.kind]),
      element(
        'p',
        `${nodeById.get(edge.from)?.member ?? nodeById.get(edge.from)?.label ?? edge.from} → ${nodeById.get(edge.to)?.member ?? nodeById.get(edge.to)?.label ?? edge.to} ${edge.label}`,
      ),
    )
    detail.append(element('p', '静态源码关系。候选声明不表示最终配置选择或实际运行。'))
    for (const row of findings)
      detail.append(
        element(
          'p',
          `${row.rule} · ${row.state} · ${row.age} · ${row.reason} · 预期 ${row.expected}`,
        ),
      )
    for (const evidence of edge.evidence) {
      const commit = evidence.version === 'baseline' ? graph.baseline?.commit : graph.source.commit
      detail.append(
        element('h3', `${changeLabel[edge.change] || '当前关系'} · ${evidence.version} ${commit}`),
        element('code', evidence.id),
      )
      const ul = element('ul')
      for (const site of evidence.occurrences) {
        const extra =
          'kind' in site
            ? ` · ${site.kind} · 插件 ${site.plugin ?? '未标识'} · 作用域 ${site.scope} · 模式 ${site.mode ?? '未声明'}${site.expression === undefined ? '' : ' · ' + site.expression}`
            : ` · ${site.specifier} · ${site.symbol} · ${site.type ? '类型' : '运行'}`
        ul.append(element('li', `${site.path}:${site.line}${extra}`))
      }
      detail.append(ul)
    }
  }
  function violationsFor(node: ViewNode): number {
    const members = new Set(
      (graph.groups.find(group => group.id === node.id)?.members ?? []).map(
        id => nodeById.get(id)?.member,
      ),
    )
    const rows =
      node.member === undefined
        ? (graph.conformance?.rows.filter(
            row => members.has(row.member) || members.has(row.targetMember),
          ) ?? [])
        : intent.forMember(node.member)
    return rows.filter(row => row.state === 'deviation').length
  }
  function flowProps(selected: typeof shown, layout: ElkNode): FlowProps {
    return {
      selected,
      layout,
      relations: graph.relations,
      focus: focus.value,
      overlays: {
        complexity: complexity.checked,
        coupling: coupling.checked,
        conformance: conformance.checked,
      },
      violations: Object.fromEntries(selected.nodes.map(node => [node.id, violationsFor(node)])),
      kindOf: nodeKind,
      onNode: id => {
        const node = nodeById.get(id)
        if (node !== undefined) focusNode(node)
      },
      onEdge: id => {
        const edge = selected.edges.find(item => item.id === id)
        if (edge !== undefined) showEdge(edge)
      },
    }
  }
  /** The panel takes the background of what will replace it: paper for the matrix, canvas for the graph. */
  function statusPanel(
    kind: 'loading' | 'failed',
    selected: typeof shown,
    title: string,
    detail: string,
  ): HTMLElement {
    const paper = selected.overview && overviewMode === 'matrix'
    const panel = element(
      'div',
      '',
      `${kind === 'loading' ? 'arch-loading' : 'arch-error'}${paper ? ' arch-paper' : ''}`,
    )
    const box = element('div', '', 'arch-status-box')
    if (kind === 'loading') box.append(element('div', '', 'arch-loading-ring'))
    box.append(
      element('p', title, 'arch-status-title'),
      element('p', detail, 'arch-status-detail mono'),
    )
    panel.append(box)
    return panel
  }
  function describe(selected: typeof shown): string {
    const engineName = selected.overview && overviewMode === 'matrix' ? '依赖矩阵' : 'ELK layered'
    return `${engineName} · ${selected.nodes.length} 个节点 · ${selected.edges.length} 条聚合关系`
  }
  async function drawDiagram(selected: typeof shown, generation: number): Promise<void> {
    try {
      if (selected.overview && overviewMode === 'matrix') {
        const svg = drawMatrix(selected, graph.relations, focusNode, showEdge)
        if (generation !== request) return
        geometry = {
          width: Number(svg.getAttribute('width')),
          height: Number(svg.getAttribute('height')),
        }
        diagram.replaceChildren(svg)
        viewport = attachViewport(svg, diagram, geometry)
      } else {
        const layout = await engine.layout(layoutInput(selected, graph.relations))
        if (generation !== request) return
        const host = element('div')
        diagram.replaceChildren(host)
        flowHandle = flow.mount(host, flowProps(selected, layout))
      }
      diagram.setAttribute('data-layout-state', 'ready')
      required('arch-layout-status').textContent =
        `布局完成 · ${selected.nodes.length} 个节点 · ${selected.edges.length} 条聚合关系`
      required('arch-canvas-hint').textContent =
        selected.overview && overviewMode === 'matrix'
          ? '拖动空白处平移 · 右上角按钮缩放 · 点单元格看出处'
          : '⌘ + 滚轮缩放（Windows 用 Ctrl） · 按住滚轮中键拖动平移，空白处左键拖动也可以 · 滚轮滚动的是页面 · 点节点或关系看详情'
      for (const el of exportButtons) el.disabled = false
    } catch (error) {
      if (generation !== request) return
      const message = `布局失败：${error instanceof Error ? error.message : String(error)}`
      diagram.replaceChildren(
        statusPanel(
          'failed',
          selected,
          '布局失败',
          `${error instanceof Error ? error.message : String(error)} · ${describe(selected)}`,
        ),
      )
      diagram.setAttribute('data-layout-state', 'failed')
      required('arch-layout-status').textContent = message
    } finally {
      if (generation === request) diagram.setAttribute('aria-busy', 'false')
    }
  }
  function renderOverview(): void {
    const cards = required('arch-overview')
    cards.replaceChildren()
    for (const node of graph.groups) {
      if (node.change === 'removed' && changes.value === 'current') continue
      const card = button(
        `${node.label} · ${node.count ?? 0}${node.change === 'removed' ? ' · BASE 删除' : ''}`,
        () => focusNode(node),
      )
      card.className = 'arch-card'
      card.setAttribute('aria-current', String(node.group === group.value))
      cards.append(card)
    }
    const members = required('arch-members')
    members.replaceChildren()
    for (const node of shown.nodes.filter(node => node.kind !== 'group')) {
      const row = button(`${nodeKind(node)} · ${node.member?.split('/').pop() ?? node.label}`, () =>
        focusNode(node),
      )
      row.className = 'arch-item'
      row.setAttribute('aria-current', String(node.id === focus.value))
      members.append(row)
    }
    const breadcrumb = required('arch-breadcrumb')
    breadcrumb.replaceChildren(
      ui.action(
        '总览',
        () => {
          group.value = ''
          focus.value = ''
          render()
        },
        'link',
      ),
    )
    if (group.value !== '')
      breadcrumb.append(
        ' / ',
        ui.action(
          group.value,
          () => {
            focus.value = ''
            render()
          },
          'link',
        ),
      )
    if (focus.value !== '')
      breadcrumb.append(
        ' / ',
        element(
          'span',
          nodeById.get(focus.value)?.member ?? nodeById.get(focus.value)?.label ?? focus.value,
        ),
      )
  }
  function renderRelations(): void {
    list.replaceChildren(
      element('h2', `当前选择：${shown.nodes.length} 个节点 · ${shown.edges.length} 条聚合关系`),
    )
    if (shown.overview) {
      list.append(
        element('p', '跨目录组的直接导入与装配声明；组内关系请展开。服务同名不推断组间绑定。'),
      )
    }
    if (shown.nodes.length === 0)
      list.append(element('p', '当前选择没有节点；这不表示全系统没有关系。'))
    for (const edge of shown.edges) {
      const from = nodeById.get(edge.from),
        to = nodeById.get(edge.to)
      const text = `${changeLabel[edge.change]} ${graph.relations[edge.kind]} · ${from?.member ?? from?.label} → ${to?.member ?? to?.label} ${edge.label} · ${edge.evidence.length} 条事实`
      const row = button(text, () => showEdge(edge))
      row.className = 'arch-edge'
      row.setAttribute('data-edge-id', edge.id)
      list.append(row)
    }
  }
  function render(): void {
    shown = selectView(graph, selection())
    intent.refresh()
    for (const [id, mode] of [
      ['arch-matrix', 'matrix'],
      ['arch-graph', 'graph'],
    ] as const) {
      const control = ui.button(id)
      control.hidden = !shown.overview
      control.pressed = overviewMode === mode
    }
    viewport?.dispose()
    viewport = undefined
    const mounted = flowHandle
    flowHandle = undefined
    mounted?.unmount()
    geometry = undefined
    for (const el of exportButtons) el.disabled = true
    diagram.replaceChildren(statusPanel('loading', shown, '正在计算布局', describe(shown)))
    diagram.setAttribute('aria-busy', 'true')
    diagram.setAttribute('data-layout-state', 'loading')
    required('arch-layout-status').textContent = `正在计算布局 · ${describe(shown)}`
    void drawDiagram(shown, ++request)
    renderOverview()
    renderRelations()
    detail.replaceChildren(element('p', '点击节点查看声明，点击关系查看全部出处。'))
  }
  function renderUnknowns(): void {
    const container = required('arch-unknown')
    container.replaceChildren()
    const append = (value: ArchitectureView['document']['current'], version: string): void => {
      for (const item of value.unknown) {
        const ul = element('ul')
        for (const site of item.occurrences)
          ul.append(
            element(
              'li',
              `${version} ${value.source.commit} · ${site.member} · ${site.path}:${site.line} · ${site.kind} · ${site.expression} · ${site.reason}`,
            ),
          )
        container.append(ul)
      }
    }
    append(graph.document.current, 'current')
    if (graph.document.baseline !== undefined) append(graph.document.baseline, 'baseline')
    if (graph.document.current.unknown.length === 0)
      container.append(element('p', '没有记录到具体 unknown；未识别写法仍可能漏检。'))
    container.append(
      element(
        'p',
        '未识别写法仍可能漏检。unknown 的条数不是全部架构缺口。进程、外部资源、运维最终配置和实际运行绑定未观测。',
      ),
      element(
        'p',
        graph.conformance === undefined
          ? '架构预期未提供；符合性未判定。'
          : '符合性只判断已采用的静态子集。未知责任与行为义务见“责任与符合性”；生命周期、租户隔离、事务和恢复仍需行为证据。',
      ),
    )
    for (const limitation of graph.document.current.scope.limitations)
      container.append(element('p', limitation))
  }
  changes.onChange(render)
  for (const control of [neighbors, complexity, coupling, conformance]) control.onChange(render)
  group.onChange(() => {
    focus.value = ''
    render()
  })
  focus.onChange(() => {
    group.value = nodeById.get(focus.value)?.group ?? ''
    render()
  })
  ui.button('arch-home').onClick(() => {
    group.value = ''
    focus.value = ''
    render()
  })
  ui.onView('architecture', showArchitecture)
  ui.onView('metrics', () => showMetrics())
  ui.button('arch-zoom-in').onClick(() =>
    flowHandle === undefined ? viewport?.zoom(1.3) : flowHandle.zoomIn(),
  )
  ui.button('arch-zoom-out').onClick(() =>
    flowHandle === undefined ? viewport?.zoom(1 / 1.3) : flowHandle.zoomOut(),
  )
  ui.button('arch-fit').onClick(() =>
    flowHandle === undefined ? viewport?.fit() : flowHandle.fitView(),
  )
  ui.button('arch-matrix').onClick(() => {
    overviewMode = 'matrix'
    render()
  })
  ui.button('arch-graph').onClick(() => {
    overviewMode = 'graph'
    render()
  })
  ui.button('arch-export-json').onClick(() =>
    download(
      'architecture-selection.json',
      JSON.stringify(shown, null, 2) + '\n',
      'application/json',
    ),
  )
  ui.button('arch-export-svg').onClick(() => {
    if (flowHandle !== undefined) {
      download('architecture-selection.svg', flowHandle.svg(), 'image/svg+xml')
      return
    }
    const svg = diagram.querySelector('svg')
    if (svg === null || geometry === undefined) throw new Error('No diagram to export')
    const exported = svg.cloneNode(true)
    if (!(exported instanceof SVGSVGElement)) throw new Error('Expected SVG export')
    exported.setAttribute('viewBox', `0 0 ${geometry.width} ${geometry.height}`)
    download(
      'architecture-selection.svg',
      new XMLSerializer().serializeToString(exported),
      'image/svg+xml',
    )
  })
  required('arch-guidance').append(
    element(
      'p',
      '六问导航：①总览看应用与目录组；②装配声明看源码候选，最终配置与运行状态未观测；③运行/类型导入看直接耦合；④服务与事件筛选看静态连接；⑤责任与符合性看新增、存量、未知及预期变化；⑥叠加耦合、复杂度与符合性，或进入复杂度与风险。',
    ),
  )
  renderUnknowns()
  render()
  const initialMember = decodeURIComponent(location.hash.slice(1))
  if (graph.nodes.some(node => node.member === initialMember)) showMetrics(initialMember)
}
