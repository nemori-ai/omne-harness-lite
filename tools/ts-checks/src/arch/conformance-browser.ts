/// <reference lib="dom" />
import type { ArchitectureView, SelectedArchitecture } from './view.ts'
import type { ConformanceRow } from './conformance-model.ts'
import type { ReportUiApi } from './flow/controls-api.ts'

/** Separate intent navigation from source graph layout. All external values enter through textContent. */
export function conformanceBrowser(
  graph: ArchitectureView,
  focus: (member: string) => void,
  selected: () => SelectedArchitecture,
  ui: ReportUiApi,
): {
  refresh: () => void
  open: (member?: string) => void
  forMember: (member: string) => readonly ConformanceRow[]
} {
  const required = (id: string): HTMLElement => {
    const el = document.getElementById(id)
    if (el === null) throw new Error(`Missing conformance element ${id}`)
    return el
  }
  const el = (tag: string, text: string): HTMLElement => {
    const node = document.createElement(tag)
    node.textContent = text
    return node
  }
  // 下拉与按钮由 antd 渲染，经句柄读写。
  const state = ui.select('conformance-state'),
    domain = ui.select('conformance-domain'),
    member = ui.select('conformance-member')
  const doc = graph.conformance,
    input = doc?.comparedWith === 'baseline' ? doc.baseline : doc?.current
  const rows = doc?.rows ?? []
  let limit = 60
  const roles = input?.value?.roles ?? []
  const domains = input?.value?.domains ?? doc?.current.value?.domains ?? []
  const option = (value: string, label: string) => ({ value, label })
  domain.setOptions([option('', '全部责任板块'), ...domains.map(row => option(row.id, row.label))])
  member.setOptions([
    option('', '全部成员'),
    ...graph.nodes
      .filter(node => node.member !== undefined)
      .map(node => option(node.member ?? '', node.member ?? node.label)),
  ])
  const locatedMembers = (id: string) =>
    new Set(
      roles
        .filter(role => role.domains.includes(id))
        .flatMap(role =>
          graph.document.current.members
            .filter(m => role.paths.some(path => path.startsWith(`${m.path}/src/`)))
            .map(m => m.path),
        ),
    )
  function refresh(): void {
    const container = required('conformance-rows'),
      allowed = domain.value === '' ? undefined : locatedMembers(domain.value)
    const chosen = rows.filter(
      row =>
        (state.value === 'all' || state.value === row.state || state.value === row.age) &&
        (member.value === '' || row.member === member.value || row.targetMember === member.value) &&
        (allowed === undefined || allowed.has(row.member) || allowed.has(row.targetMember ?? '')),
    )
    container.replaceChildren()
    required('conformance-counts').textContent =
      `共 ${rows.length} 条；当前筛选 ${chosen.length} 条，已列 ${Math.min(limit, chosen.length)} 条。偏离 ${rows.filter(r => r.state === 'deviation').length}（新增 ${rows.filter(r => r.age === 'new').length}，存量 ${rows.filter(r => r.age === 'stock').length}，未分类 ${rows.filter(r => r.state === 'deviation' && r.age === 'unjudged').length}）；未知 ${rows.filter(r => r.state === 'unknown').length}。`
    for (const row of chosen.slice(0, limit)) {
      const card = el('article', '')
      card.className = 'conformance-row'
      card.setAttribute('data-rule', row.rule)
      card.setAttribute('data-state', row.state)
      card.setAttribute('data-age', row.age)
      card.append(
        ui.action(
          `${row.rule} · ${row.state} · ${row.age} · ${row.member}`,
          () => focus(row.member),
          'link',
        ),
        el('p', `${row.key} · ${row.reason}`),
        el('p', `预期出处：${row.expected}`),
        ...row.sites.map(site => el('code', `${site.path}:${site.line}`)),
      )
      container.append(card)
    }
    if (chosen.length > limit)
      container.append(
        ui.action('显示更多结果', () => {
          limit += 60
          refresh()
        }),
      )
    if (chosen.length === 0) container.append(el('p', '当前筛选没有结果；这不表示整体符合。'))
    required('conformance-selection').textContent =
      `图的当前成员范围包含 ${selected().conformance?.rows.length ?? 0} 条符合性结果；JSON 导出携带这批结果。`
  }
  function open(value = ''): void {
    limit = 60
    required('architecture-pane').hidden = true
    required('metrics-pane').hidden = true
    required('conformance-pane').hidden = false
    member.value = value
    state.value = 'deviation'
    domain.value = ''
    refresh()
  }
  for (const control of [state, domain, member])
    control.onChange(() => {
      limit = 60
      refresh()
    })
  ui.onView('conformance', () => open())
  required('conformance-coordinate').textContent =
    doc === undefined
      ? '全局预期未提供，符合性未判定。'
      : `实现 ${doc.current.source.commit} · 预期 ${doc.comparedWith} ${input?.source.commit ?? '无'} · ${input?.path ?? ''} · dirty ${doc.current.source.dirty} · 输入 ${input?.value === null ? '缺失' : '已发布'}。源码事实与预期分别读取。`
  const responsibility = required('conformance-responsibility')
  for (const d of domains) {
    const box = el('article', '')
    box.className = 'conformance-domain-card'
    box.append(el('h3', d.label), el('p', `方向已认可；出处 ${d.source}`))
    const mappings = roles.filter(role => role.domains.includes(d.id))
    for (const role of mappings)
      box.append(
        el(
          'p',
          `${role.status} · ${role.layer} · ${role.id} · ${role.paths.join(', ')} · ${role.source}`,
        ),
      )
    if (mappings.length === 0) box.append(el('p', '具体实现映射未提供；不表示板块已经实现。'))
    responsibility.append(box)
  }
  const expected = required('conformance-expected-path')
  expected.append(
    el(
      'p',
      '已认可预期：交互 → 用例/公开业务能力 → 内侧存储契约 ← 存储适配器；独立装配入口选择并连接实现。',
    ),
    el(
      'p',
      'Session按业务规则逻辑治理三类runtime；各runtime生命周期独立。Agent runtime发起或等待模型与工具并持有句柄，Run关联工作与取消治理。独立公开能力无需Session或runtime。',
    ),
  )
  const changes = required('conformance-changes')
  changes.append(
    el(
      'p',
      doc?.changeState === 'compared'
        ? `预期语义变化 ${doc.changes.length} 条；代码同时放宽预期仍按 BASE 核对。`
        : '未给 BASE，预期变化未比较。',
    ),
  )
  for (const change of doc?.changes ?? []) {
    const details = el('details', '')
    details.append(
      el('summary', `${change.id} · ${change.path}`),
      el('pre', `BASE ${change.before ?? '缺失'}\nCURRENT ${change.after ?? '缺失'}`),
    )
    changes.append(details)
  }
  changes.append(
    el('p', `依据字节变化 ${doc?.sourceChanges.length ?? 0} 条；哈希不能判断含义或行为符合。`),
  )
  for (const change of doc?.sourceChanges ?? []) {
    const details = el('details', '')
    details.append(
      el('summary', change.path),
      el('pre', `BASE ${change.before ?? '缺失'}\nCURRENT ${change.after ?? '缺失'}`),
    )
    changes.append(details)
  }
  for (const row of doc?.coverage ?? [])
    required('conformance-coverage').append(el('p', `${row.id} · ${row.evidence} · ${row.scope}`))
  return {
    refresh,
    open,
    forMember: value => rows.filter(row => row.member === value || row.targetMember === value),
  }
}
