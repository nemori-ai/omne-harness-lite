// 审讯页。结构图是 React Flow 岛（src/report/flow/metrics/）：层是横向的列、组是层内容器、成员是卡片，
// 几何与画哪些线由该目录的纯函数算出，本文件留明细、悬停清单与选择状态。
// 做法取自 Robert C. Martin 的 uml-viewer 与它的前身 arch-view（按其逻辑重写，不搬原文）：
// - 默认不逐条画连线，只在卡片上标入/出、悬停时列出捆在一起的「从 → 到」，违规排前并标红：
//   uml-viewer 的 triangles 模式（application/hit.clj:28-77、engine/draw.clj:373-402）。
//   画线的取舍见 flow/edges.ts。
// - 评分到颜色：评分不超过 5 时在「差 → 中」之间取色，否则在「中 → 好」之间取色（draw.clj:34-48），
//   见 flow/structure.tsx 的 toneOf；覆盖率单元格的取色见 flow/function-table.tsx（draw.clj:61-66）。
// 表单控件、函数表与折叠区由 antd 渲染（src/report/flow/architecture/controls.tsx），本文件的脚本经句柄读写。
// - 端点没有框的边跳过（提交 2f532e27）；成员名只显示最后一段（提交 70fffa0c）。
import type { Report } from '../metrics/report.ts'
import type { ArchitectureView } from '../arch/view.ts'
import { architectureMarkup, architectureScript } from './architecture-render.ts'
import { architectureFlowBundle } from './flow/architecture/bundle.ts'
import { FLOW_STYLE } from './flow/architecture/style.ts'
import { STRUCTURE_STYLE } from './flow/metrics/style.ts'

export interface PageContext {
  readonly head: string
  readonly shortHead: string
  readonly branch: string
  readonly dirty: boolean
  readonly baseRef?: string
  readonly generatedAt: string
  readonly summary: readonly string[]
  /** 未选中成员时，变更触及的边不超过这个数才逐条画出。 */
  readonly changedEdgeLimit: number
}

function embed(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028')
}

/** 审讯页的样式；流程体检页（`src/loop/health-render.ts`）沿用同一套，风格一致。 */
export const STYLE = `
/* 设计 token：底色、墨色、线色与圆角阶、控件高度。风险三色、变更蓝、例外橙是数据编码，色相不随界面调整。 */
:root { color-scheme:light;
  --bg:#f4f5f7; --panel:#ffffff; --panel-2:#f7f8fa; --canvas:#f6f7f9;
  --fg:#1c2128; --muted:#5f6772; --faint:#8a929c; --line:#e3e6ea; --line-strong:#cdd2d8;
  --ink:#1c2128; --on-ink:#ffffff;
  --bad-fill:#f8d2cf; --mid-fill:#fbeebf; --good-fill:#dcefdc;
  --bad:#c0392b; --mid:#b98900; --good:#3f8a4b;
  --nodata:#e5e7eb; --edge:#9aa0a6; --changed:#1f6feb;
  --r-panel:12px; --r-item:8px; --r-ctrl:6px; --ctrl-h:32px; --sticky-top:0px;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --shadow-float:0 14px 36px -14px rgba(16,24,40,.32), 0 2px 6px rgba(16,24,40,.08); }
@media (prefers-color-scheme: dark) { :root { color-scheme:dark;
  --bg:#121417; --panel:#1a1d21; --panel-2:#16191c; --canvas:#15181b;
  --fg:#e6e8eb; --muted:#9aa1ab; --faint:#6f7680; --line:#2c3036; --line-strong:#3d424a;
  --ink:#e6e8eb; --on-ink:#121417;
  --bad-fill:rgb(74,40,24); --mid-fill:rgb(61,58,24); --good-fill:rgb(30,74,56);
  --bad:rgb(224,122,74); --mid:rgb(212,192,90); --good:rgb(95,181,138);
  --nodata:#2a2d31; --edge:#6b7076; --changed:#58a6ff;
  --shadow-float:0 14px 36px -14px rgba(0,0,0,.7), 0 2px 6px rgba(0,0,0,.4); } }
* { box-sizing: border-box; }
/* 细滚动条：轨道透明、滑块圆头；半径 = 宽度的一半，跟着 --sb-size 走，不是组件圆角标度的一员。 */
:root { --sb-track-color:transparent; --sb-thumb-color:rgb(180,180,180); --sb-size:5px; }
@media (prefers-color-scheme: dark) { :root { --sb-thumb-color:rgb(96,100,106); } }
::-webkit-scrollbar { width:var(--sb-size); height:var(--sb-size); }
::-webkit-scrollbar-track { background:var(--sb-track-color); border-radius:calc(var(--sb-size) / 2); }
::-webkit-scrollbar-thumb { background:var(--sb-thumb-color); border-radius:calc(var(--sb-size) / 2); }
::-webkit-scrollbar-thumb:hover { background:color-mix(in srgb, var(--sb-thumb-color) 70%, var(--fg)); }
@supports not selector(::-webkit-scrollbar) { * { scrollbar-width:thin; scrollbar-color:var(--sb-thumb-color) var(--sb-track-color); } }
/* overflow-x:clip：吸顶导航用 100vw 通栏，不带出横向滚动条；clip 不建滚动容器，吸顶照常生效。 */
html { overflow-x:clip; }
body { margin:0; padding:32px 32px 80px; overflow-x:clip; background:var(--bg); color:var(--fg);
  font:14px/1.6 var(--font); -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
/* 报告版心：结构图与架构工作区都需要宽画布，版心不窄于 1600。 */
.report { max-width:1760px; margin:0 auto; }
h1 { font-size:26px; line-height:1.25; font-weight:650; letter-spacing:-.01em; margin:0 0 6px; }
h2 { font-size:16px; line-height:1.4; font-weight:600; margin:40px 0 12px; }
h3 { font-size:14px; font-weight:600; }
code, pre, .mono { font-family:var(--mono); font-size:12.5px; }
h1 .mono { font-size:.62em; font-weight:500; color:var(--muted); letter-spacing:0; margin-left:4px; }
.meta { color:var(--muted); font-size:13px; }
.badge { display:inline-flex; align-items:center; height:24px; padding:0 10px; border-radius:999px; border:1px solid var(--line-strong);
  background:var(--panel); color:var(--muted); font-size:12.5px; font-weight:500; letter-spacing:0; margin-left:12px; vertical-align:middle; }
.badge.bad { border-color:color-mix(in srgb, var(--bad) 45%, transparent); background:color-mix(in srgb, var(--bad) 8%, var(--panel)); color:var(--bad); }
/* 原生按钮只剩侧栏清单与详情里的条目，antd 控件（.ant-*）自带样式，这里不碰。 */
/* :where 不加优先级，侧栏条目（.arch-card 等）自己的行高与尺寸照常生效。 */
:where(button:not([class*="ant-"])) { font:inherit; font-size:13px; line-height:1; color:var(--fg); background:var(--panel); border:1px solid var(--line-strong);
  border-radius:var(--r-ctrl); height:var(--ctrl-h); padding:0 12px; cursor:pointer; transition:background-color .12s ease, border-color .12s ease; }
:where(button:not([class*="ant-"])):hover { background:var(--panel-2); border-color:color-mix(in srgb, var(--fg) 28%, var(--line-strong)); }
:where(button:not([class*="ant-"])):focus-visible { outline:2px solid var(--changed); outline-offset:2px; }
[hidden] { display:none !important; }
.pane-head { margin-bottom:8px; }
.pane-head .meta { margin-top:2px; }
pre.summary { margin:20px 0 0; padding:16px 20px; background:var(--panel); border:1px solid var(--line); border-radius:var(--r-panel);
  font-size:12.5px; line-height:1.75; overflow-x:auto; color:var(--fg); }
#hover { position:fixed; z-index:30; display:none; max-width:520px; background:var(--panel); border:1px solid var(--line); border-radius:10px;
  padding:10px 12px; box-shadow:var(--shadow-float); font-size:12.5px; line-height:1.55; pointer-events:none; }
#hover b { display:block; margin-top:6px; font-weight:600; } #hover div.bad { color:var(--bad); }
.legend { display:flex; flex-wrap:wrap; align-items:center; gap:6px 20px; color:var(--muted); font-size:12.5px; margin:0 0 14px; }
.legend span { white-space:normal; }
.swatch { display:inline-block; width:12px; height:12px; border-radius:3px; vertical-align:-2px; margin-right:6px; border:1px solid var(--line-strong); }
table:not(.ant-table table) { border-collapse:separate; border-spacing:0; width:100%; background:var(--panel); border:1px solid var(--line); border-radius:var(--r-panel); }
th:not(.ant-table th), td:not(.ant-table td) { text-align:left; padding:8px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
th:not(.ant-table th) { position:sticky; top:var(--sticky-top); z-index:2; background:var(--panel-2); font-size:12px; color:var(--muted); font-weight:500; cursor:pointer; user-select:none; white-space:nowrap; }
thead th:not(.ant-table th):first-child { border-top-left-radius:var(--r-panel); } thead th:not(.ant-table th):last-child { border-top-right-radius:var(--r-panel); }
tbody tr:last-child td:not(.ant-table td) { border-bottom:0; }
tbody tr:hover td:not(.ant-table td) { background-color:color-mix(in srgb, var(--panel-2) 70%, var(--line)); }
td:not(.ant-table td) { font-size:13px; } td.mono:first-child { color:var(--muted); }
td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
tr.changed td.fn { font-weight:600; }
/* 函数表（antd Table）：路径用次要色，数字等宽。 */
.ui-function-table .ant-table { font-size:13px; }
.ui-function-table td.mono { font-family:var(--mono); font-size:12.5px; } .ui-function-table td.ui-muted { color:var(--muted); }
.ui-function-table td.num { font-variant-numeric:tabular-nums; }
/* 不给正在排序的列加底色：评分列已有风险色，排序方向由表头箭头表示。重复类名是为了压过 antd 运行时注入的同级规则。 */
.ui-function-table.ui-function-table .ant-table-tbody > tr > td.ant-table-column-sort, .ui-function-table.ui-function-table .ant-table-thead > tr > th.ant-table-column-sort { background-color:transparent; }
.ui-function-table.ui-function-table .ant-table-thead > tr > th.ant-table-column-sort { background-color:var(--panel-2); }
.controls { margin:0 0 12px; }
ul.plain { margin:4px 0; padding-left:18px; } ul.plain li { margin:2px 0; }
.bad { color:var(--bad); }
.empty { color:var(--muted); padding:6px 0; }
.report-block > div { padding:12px 16px; background:var(--panel); border:1px solid var(--line); border-radius:var(--r-panel); }
@media (max-width:760px) { body { padding:20px 16px 64px; } }
`

const SCRIPT = `
const data = JSON.parse(document.getElementById('data').textContent)
const report = data.report
const $ = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') el.className = value
    else if (key === 'text') el.textContent = value
    else if (key === 'style') el.style.cssText = value
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value)
    else el.setAttribute(key, value)
  }
  for (const child of children) if (child != null) el.append(child)
  return el
}
const short = path => path.split('/').pop()
const pct = ratio => ratio === undefined ? '—' : Math.round(ratio * 100) + '%'
const num = value => Number.isInteger(value) ? String(value) : value.toFixed(1)
const metric = report.coverageEnabled ? 'CRAP' : 'CC'
const memberByPath = new Map(report.members.map(member => [member.path, member]))
const outgoing = new Map(), incoming = new Map()
for (const edge of report.edges) {
  outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
}
// 违规排最前，其次已登记例外，再次本次变更触及的。
const rankEdge = edge => edge.violating ? 0 : edge.changed ? 1 : 2
const sorted = edges => [...edges].sort((a, b) => rankEdge(a) - rankEdge(b))
let selected = null
let showGroupLines = false
let filter = report.hasBase ? 'changed' : 'over'
let sortKey = 'score', sortOrder = 'descend'

// ---- 结构图 ----
const structure = document.getElementById('structure')
const hover = document.getElementById('hover')
const note = document.getElementById('note')
let flow = null
function redraw() {
  if (flow !== null) note.textContent = flow.update({ selected, groupLines: showGroupLines })
}
// 面板隐藏时画布量不到尺寸，React Flow 无法适配全图；等画布第一次有宽度再挂载。
function mountFlow() {
  if (flow !== null || structure.clientWidth === 0) return
  if (window.StructureFlow === undefined) { note.textContent = '结构图脚本没有加载，无法绘制。'; return }
  flow = window.StructureFlow.mount(structure, {
    report, changedEdgeLimit: data.page.changedEdgeLimit,
    onSelect: path => select(path), onHover: showHover, onLeave: () => { hover.style.display = 'none' },
  })
  redraw()
}
new ResizeObserver(mountFlow).observe(structure)
// 控件由 antd 渲染（window.ReportUi），按 id 取句柄。
const ui = window.ReportUi
ui.button('structure-zoom-in').onClick(() => flow?.zoomIn())
ui.button('structure-zoom-out').onClick(() => flow?.zoomOut())
ui.button('structure-fit').onClick(() => flow?.fitView())
function showHover(event, path) {
  const out = sorted(outgoing.get(path) ?? []), inc = sorted(incoming.get(path) ?? [])
  hover.replaceChildren($('div', { class: 'mono', text: path }))
  const list = (title, edges, label) => {
    if (edges.length === 0) return
    hover.append($('b', { text: title + '（' + edges.length + '）' }))
    for (const edge of edges.slice(0, 10))
      hover.append($('div', { class: edge.violating ? 'bad' : '', text: label(edge) + (edge.violating ? '  违规' : '') + (edge.changed ? '  本次变更触及' : '') }))
    if (edges.length > 10) hover.append($('div', { class: 'empty', text: '… 另 ' + (edges.length - 10) + ' 条，点成员看全部' }))
  }
  list('它依赖的', out, edge => short(path) + ' → ' + short(edge.to))
  list('依赖它的', inc, edge => short(edge.from) + ' → ' + short(path))
  if (out.length + inc.length === 0) hover.append($('div', { class: 'empty', text: '没有跨成员依赖' }))
  hover.style.display = 'block'
  hover.style.left = Math.min(event.clientX + 14, window.innerWidth - 540) + 'px'
  hover.style.top = (event.clientY + 16) + 'px'
}
ui.checkbox('lines').onChange(checked => { showGroupLines = checked; redraw() })

// ---- 明细 ----
const detail = document.getElementById('detail')
// 选中成员的概况与依赖清单在图右侧的侧栏；函数表仍在图下方，表宽。
const side = document.getElementById('structure-side')
function select(path) {
  selected = path === null || selected === path ? null : path
  // 网址带上成员路径，交付说明里可以直接给出定位到某个成员的链接。
  history.replaceState(null, '', selected === null ? location.pathname : '#' + selected)
  redraw(); renderDetail()
}
window.addEventListener('architecture-member', event => {
  if (!memberByPath.has(event.detail)) {
    selected = null
    redraw()
    renderDetail()
    side.replaceChildren($('h3', { class: 'mono', text: event.detail }), $('p', { text: '该成员没有可供既有度量面板分析的 TypeScript 函数；架构成员清单仍记录其存在。' }))
    return
  }
  selected = null
  filter = 'all'
  select(event.detail)
})
function siteList(sites) {
  return $('ul', { class: 'plain mono' }, ...sites.map(site => $('li', { text: site.path + ':' + site.line + '  ' + site.specifier })))
}
function renderSide() {
  if (selected === null) {
    side.replaceChildren($('h3', { text: '成员详情' }), $('p', { class: 'empty', text: '点击成员卡片，这里显示它的度量与依赖清单；悬停只临时画线。' }))
    return
  }
  const member = memberByPath.get(selected)
  const coverage = { measured: '有数据，语句行命中 ' + pct(member.lineCoverage), 'no-data': '跑了测试但没有命中本包源码（测试在子进程或别处执行）', 'not-run': '这次没跑' }[member.coverage]
  side.replaceChildren($('h3', { class: 'mono', text: member.path }),
    $('div', { class: 'meta', text: '第 ' + member.layer + ' 层 · 组 ' + member.group + ' · 函数 ' + member.functions + ' 个' }),
    $('p', { text: metric + '：均值 ' + num(member.mu) + ' · 最大 ' + num(member.max) + ' · 标准差 ' + num(member.sigma) + ' · 风险值（均值加标准差）' + num(member.risk) + ' · 超 alert ' + member.overAlert + '、超 warn ' + member.overWarn }),
    $('p', { text: '依赖它的 ' + member.fanIn + ' 个 · 它依赖的 ' + member.fanOut + ' 个 · 不稳定度 ' + member.instability.toFixed(2) + '（0 最稳定，越多人依赖越该稳定）' }),
    $('p', { text: '覆盖率：' + (report.coverageEnabled ? coverage : '未开启') }))
  const out = sorted(outgoing.get(selected) ?? []), inc = sorted(incoming.get(selected) ?? [])
  const edgeItem = (edge, other) => $('li', { class: edge.violating ? 'bad' : '' },
    other + '（' + edge.count + ' 处导入' + (edge.violating ? '，违规' : '') + (edge.changed ? '，本次变更触及' : '') + '）', siteList(edge.sites))
  side.append($('h4', { text: '它依赖的（' + out.length + '）' }), out.length ? $('ul', { class: 'plain' }, ...out.map(edge => edgeItem(edge, edge.to))) : $('div', { class: 'empty', text: '无' }))
  side.append($('h4', { text: '依赖它的（' + inc.length + '）' }), inc.length ? $('ul', { class: 'plain' }, ...inc.map(edge => edgeItem(edge, edge.from))) : $('div', { class: 'empty', text: '无' }))
}
// 筛选单选与函数表只建一次：每次重画明细时把同一个元素挪回去，只更新数据，切换排序与筛选时不闪。
const filters = $('div', { class: 'controls' })
const filterRadio = ui.radio(filters, [...(report.hasBase ? [{ value: 'changed', label: '基线以来变更的' }] : []), { value: 'over', label: '超阈值的' }, { value: 'all', label: '全部' }],
  filter, value => { filter = value; renderDetail() })
const tableHost = $('div')
let functionTable = null
function renderDetail() {
  renderSide()
  detail.replaceChildren()
  const scope = selected === null ? report.functions : report.functions.filter(row => row.member === selected)
  filterRadio.value = filter
  detail.append($('h2', { text: selected === null ? '全仓的函数' : short(selected) + ' 的函数' }), filters)
  let rows = scope.filter(row => filter === 'all' || (filter === 'changed' ? row.changed : row.level !== 'ok'))
  // 升降序都可选；没有覆盖率数据的函数无论方向都排在最后。
  const keys = { score: row => row.score, cc: row => row.complexity, cov: row => row.coverage, path: row => row.path + String(row.line).padStart(6, '0') }
  // sortKey 为 null 时不排序，保持报告给出的原始顺序。
  if (sortKey !== null) rows = [...rows].sort((a, b) => {
    const x = keys[sortKey](a), y = keys[sortKey](b)
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1
    const order = x < y ? -1 : x > y ? 1 : 0
    return sortOrder === 'ascend' ? order : -order
  })
  const total = rows.length
  rows = rows.slice(0, 400)
  if (rows.length === 0) { detail.append($('div', { class: 'empty', text: '没有符合条件的函数。' })); return }
  const props = { rows, metric, sortKey, sortOrder, onSort: (key, order) => { sortKey = key; sortOrder = order; renderDetail() } }
  if (functionTable === null) functionTable = ui.functionTable(tableHost, props)
  else functionTable.update(props)
  detail.append(tableHost)
  if (total > rows.length) detail.append($('div', { class: 'empty', text: '只显示前 ' + rows.length + ' 条，共 ' + total + ' 条；点成员缩小范围。' }))
}

// ---- 依赖违规与环（dependency-cruiser） ----
const findings = document.getElementById('findings')
if (report.findings.length === 0) findings.append($('div', { class: 'empty', text: '没有依赖违规，也没有环。' }))
else findings.append($('ul', { class: 'plain' }, ...report.findings.map(finding => $('li', { class: 'bad' }, finding.message, siteList(finding.sites.slice(0, 8))))))

const initial = decodeURIComponent(location.hash.slice(1))
if (memberByPath.has(initial)) select(initial)
else renderDetail()
mountFlow()
`

/** 自包含、离线可开的审讯页：数据内联，无外部资源。 */
export function renderPage(
  report: Report,
  context: PageContext,
  architecture?: ArchitectureView,
): string {
  const metric = report.coverageEnabled
    ? 'CRAP（没有覆盖率数据的函数用圈复杂度）'
    : '圈复杂度（未开覆盖率）'
  const base = context.baseRef === undefined ? '无基线' : `基线 ${context.baseRef}`
  const { bands, thresholds } = report
  const flow = architectureFlowBundle()
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${architecture === undefined ? '结构度量' : '实际架构与结构度量'} ${escapeHtml(context.shortHead)}</title>
<style>${STYLE}${flow.style}${FLOW_STYLE}${STRUCTURE_STYLE}</style>
</head>
<body>
<main class="report">
${architecture === undefined ? '' : architectureMarkup(architecture)}
<section id="metrics-pane"${architecture === undefined ? '' : ' hidden'}>
<header class="pane-head">
<h1>结构度量 <span class="mono">${context.shortHead}</span>${context.dirty ? '<span class="badge bad">工作树不干净，不能当作该提交的度量</span>' : ''}</h1>
<div class="meta">分支 <span class="mono">${escapeHtml(context.branch)}</span> · ${escapeHtml(base)} · 评级用 ${metric} · 函数 warn ${thresholds.warn} / alert ${thresholds.alert} · 成员色带 ${bands.green} / ${bands.yellow} / ${bands.red} · 生成于 ${context.generatedAt}</div>
<pre class="summary">${escapeHtml(context.summary.join('\n'))}</pre>
</header>
<h2>结构</h2>
<div class="legend">
<span><i class="swatch" style="background:var(--good-fill)"></i>风险值不超过 ${bands.green}</span>
<span><i class="swatch" style="background:var(--mid-fill)"></i>到 ${bands.yellow} 过渡为黄</span>
<span><i class="swatch" style="background:var(--bad-fill)"></i>到 ${bands.red} 及以上为红</span>
<span><i class="swatch" style="background:var(--nodata)"></i>跑了覆盖率但缺数据</span>
<span>卡片上的数字＝函数评级分的均值加一个标准差；组框左边线＝组内最差成员</span>
<span>粗边框＝基线以来有变更；▲n＝本次变更里超阈值的函数个数</span>
<span>入 n＝n 个成员依赖它，出 n＝它依赖 n 个成员；悬停看清单，点成员看明细并画出它的线</span>
<span style="color:var(--bad)">红＝依赖违规或环</span>
<span style="color:var(--changed)">蓝＝本次变更触及的导入</span>
<span>其余导入取发起成员卡片的颜色；沿线的小点从依赖方流向被依赖方</span>
</div>
<div class="structure-frame">
<div class="structure-bar"><span>层自左向右：第 0 层最内</span><label><input type="checkbox" id="lines"> 画出组间连线（不含指向最内层的）</label><span class="spacer"></span><button id="structure-zoom-in">放大</button><button id="structure-zoom-out">缩小</button><button id="structure-fit">适应全图</button></div>
<div id="structure" role="region" aria-label="结构图"></div>
<div class="structure-foot"><span id="note"></span> 滚轮翻页；按住 ⌘（Windows 为 Ctrl）加滚轮缩放；拖动空白处平移；悬停成员临时画出它的线；点画布、层或组的空白处取消选中。</div>
<aside id="structure-side" class="structure-side" aria-label="成员详情"></aside>
</div>
<div id="hover"></div>
<section class="report-block"><h2>依赖违规与环</h2><div id="findings"></div></section>
<div id="detail"></div>
</section>
</main>
<script type="application/json" id="data">${embed({ report, page: { changedEdgeLimit: context.changedEdgeLimit } })}</script>
<script>${inline(flow.script)}</script>
<script>${SCRIPT}</script>
${architecture === undefined ? '' : `<script>${architectureScript()}</script>`}
</body>
</html>
`
}

function inline(script: string): string {
  return script.replaceAll('</script', '<\\/script')
}

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
