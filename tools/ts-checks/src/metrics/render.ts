// 审讯页。结构图是 React Flow 岛（src/metrics/flow/）：层是横向的列、组是层内容器、成员是卡片，
// 几何与画哪些线由该目录的纯函数算出，本文件只留原生 DOM 的明细、悬停清单与选择状态。
// 做法取自 Robert C. Martin 的 uml-viewer 与它的前身 arch-view（按其逻辑重写，不搬原文）：
// - 默认不逐条画连线，只在卡片上标入/出、悬停时列出捆在一起的「从 → 到」，违规排前并标红：
//   uml-viewer 的 triangles 模式（application/hit.clj:28-77、engine/draw.clj:373-402）。
//   画线的取舍见 flow/edges.ts。
// - 评分到颜色：评分不超过 5 时在「差 → 中」之间取色，否则在「中 → 好」之间取色（draw.clj:34-48）；
//   覆盖率单元格 ≥80% 为好、≥50% 为中、其余为差（draw.clj:61-66）。
// - 端点没有框的边跳过（提交 2f532e27）；成员名只显示最后一段（提交 70fffa0c）。
import type { Report } from './report.ts'
import type { ArchitectureView } from '../arch/view.ts'
import { architectureMarkup, architectureScript } from '../arch/render.ts'
import { architectureFlowBundle } from '../arch/flow/bundle.ts'
import { FLOW_STYLE } from '../arch/flow/style.ts'
import { STRUCTURE_STYLE } from './flow/style.ts'

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
:root { --bg:#fbfbf9; --fg:#1d1f21; --muted:#6b7280; --line:#d6d3cd; --panel:#ffffff;
  --bad-fill:#f8d2cf; --mid-fill:#fbeebf; --good-fill:#dcefdc;
  --bad:#c0392b; --mid:#b98900; --good:#3f8a4b;
  --nodata:#e5e7eb; --edge:#9aa0a6; --changed:#1f6feb; --except:#c77700; }
@media (prefers-color-scheme: dark) { :root { --bg:#15171a; --fg:#e6e6e6; --muted:#9aa0a6; --line:#3a3d42; --panel:#1d2024;
  --bad-fill:rgb(74,40,24); --mid-fill:rgb(61,58,24); --good-fill:rgb(30,74,56);
  --bad:rgb(224,122,74); --mid:rgb(212,192,90); --good:rgb(95,181,138);
  --nodata:#2a2d31; --edge:#6b7076; --changed:#58a6ff; --except:#e09a2d; } }
* { box-sizing: border-box; }
/* 细滚动条：轨道透明、滑块圆头；半径 = 宽度的一半，跟着 --sb-size 走，不是组件圆角标度的一员。 */
:root { --sb-track-color:transparent; --sb-thumb-color:rgb(180,180,180); --sb-size:5px; }
@media (prefers-color-scheme: dark) { :root { --sb-thumb-color:rgb(96,100,106); } }
::-webkit-scrollbar { width:var(--sb-size); height:var(--sb-size); }
::-webkit-scrollbar-track { background:var(--sb-track-color); border-radius:calc(var(--sb-size) / 2); }
::-webkit-scrollbar-thumb { background:var(--sb-thumb-color); border-radius:calc(var(--sb-size) / 2); }
::-webkit-scrollbar-thumb:hover { background:color-mix(in srgb, var(--sb-thumb-color) 70%, var(--fg)); }
@supports not selector(::-webkit-scrollbar) { * { scrollbar-width:thin; scrollbar-color:var(--sb-thumb-color) var(--sb-track-color); } }
body { margin:0; padding:16px 20px 60px; background:var(--bg); color:var(--fg);
  font:14px/1.5 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
h1 { font-size:18px; margin:0 0 4px; } h2 { font-size:15px; margin:22px 0 8px; }
code, pre, .mono { font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px; }
.meta { color:var(--muted); } .badge { display:inline-block; padding:0 6px; border-radius:4px; border:1px solid var(--line); margin-left:6px; }
.badge.bad { border-color:var(--bad); color:var(--bad); }
pre.summary { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:10px 12px; overflow-x:auto; margin:10px 0 0; }
#hover { position:fixed; z-index:10; display:none; max-width:520px; background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:8px 10px; box-shadow:0 4px 14px rgba(0,0,0,.18); font-size:12.5px; pointer-events:none; }
#hover b { display:block; margin-top:4px; } #hover div.bad { color:var(--bad); } #hover div.except { color:var(--except); }
.legend { color:var(--muted); font-size:12px; margin-top:6px; } .legend span { margin-right:14px; white-space:nowrap; }
.swatch { display:inline-block; width:12px; height:12px; border-radius:3px; vertical-align:-2px; margin-right:4px; border:1px solid var(--line); }
table { border-collapse:collapse; width:100%; background:var(--panel); } th, td { text-align:left; padding:4px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
th { font-size:12px; color:var(--muted); font-weight:500; cursor:pointer; user-select:none; } td.num, th.num { text-align:right; }
tr.changed td.fn { font-weight:600; }
.controls { margin:8px 0; } .controls label { margin-right:14px; }
ul.plain { margin:4px 0; padding-left:18px; } .bad { color:var(--bad); } .except { color:var(--except); }
.empty { color:var(--muted); padding:6px 0; }
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
// 评分 1（最差）到 10（最好）：不超过 5 在「差 → 中」之间取色，否则在「中 → 好」之间取色。
const tone = (grade, suffix) => grade <= 5
  ? 'color-mix(in srgb, var(--mid' + suffix + ') ' + Math.round(grade / 5 * 100) + '%, var(--bad' + suffix + '))'
  : 'color-mix(in srgb, var(--good' + suffix + ') ' + Math.round((grade - 5) / 5 * 100) + '%, var(--mid' + suffix + '))'
const coverTone = ratio => ratio === undefined ? '' : 'color:var(--' + (ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'mid' : 'bad') + ')'
const memberByPath = new Map(report.members.map(member => [member.path, member]))
const outgoing = new Map(), incoming = new Map()
for (const edge of report.edges) {
  outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
}
// 违规排最前，其次已登记例外，再次本次变更触及的。
const rankEdge = edge => edge.violating ? 0 : edge.excepted ? 1 : edge.changed ? 2 : 3
const sorted = edges => [...edges].sort((a, b) => rankEdge(a) - rankEdge(b))
let selected = null
let showGroupLines = false
let filter = report.hasBase ? 'changed' : 'over'
let sortKey = 'score'

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
document.getElementById('structure-zoom-in').addEventListener('click', () => flow?.zoomIn())
document.getElementById('structure-zoom-out').addEventListener('click', () => flow?.zoomOut())
document.getElementById('structure-fit').addEventListener('click', () => flow?.fitView())
function showHover(event, path) {
  const out = sorted(outgoing.get(path) ?? []), inc = sorted(incoming.get(path) ?? [])
  hover.replaceChildren($('div', { class: 'mono', text: path }))
  const list = (title, edges, label) => {
    if (edges.length === 0) return
    hover.append($('b', { text: title + '（' + edges.length + '）' }))
    for (const edge of edges.slice(0, 10))
      hover.append($('div', { class: edge.violating ? 'bad' : edge.excepted ? 'except' : '', text: label(edge) + (edge.violating ? '  违规' : edge.excepted ? '  已登记例外' : '') + (edge.changed ? '  本次变更触及' : '') }))
    if (edges.length > 10) hover.append($('div', { class: 'empty', text: '… 另 ' + (edges.length - 10) + ' 条，点成员看全部' }))
  }
  list('它依赖的', out, edge => short(path) + ' → ' + short(edge.to))
  list('依赖它的', inc, edge => short(edge.from) + ' → ' + short(path))
  if (out.length + inc.length === 0) hover.append($('div', { class: 'empty', text: '没有跨成员依赖' }))
  hover.style.display = 'block'
  hover.style.left = Math.min(event.clientX + 14, window.innerWidth - 540) + 'px'
  hover.style.top = (event.clientY + 16) + 'px'
}
document.getElementById('lines').addEventListener('change', event => { showGroupLines = event.target.checked; redraw() })

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
  const edgeItem = (edge, other) => $('li', { class: edge.violating ? 'bad' : edge.excepted ? 'except' : '' },
    other + '（' + edge.count + ' 处导入' + (edge.violating ? '，违规' : edge.excepted ? '，已登记例外' : '') + (edge.changed ? '，本次变更触及' : '') + '）', siteList(edge.sites))
  side.append($('h4', { text: '它依赖的（' + out.length + '）' }), out.length ? $('ul', { class: 'plain' }, ...out.map(edge => edgeItem(edge, edge.to))) : $('div', { class: 'empty', text: '无' }))
  side.append($('h4', { text: '依赖它的（' + inc.length + '）' }), inc.length ? $('ul', { class: 'plain' }, ...inc.map(edge => edgeItem(edge, edge.from))) : $('div', { class: 'empty', text: '无' }))
}
function renderDetail() {
  renderSide()
  detail.replaceChildren()
  const scope = selected === null ? report.functions : report.functions.filter(row => row.member === selected)
  const radio = (value, label) => $('label', {}, Object.assign($('input', { type: 'radio', name: 'filter', onchange: () => { filter = value; renderDetail() } }), { checked: filter === value }), ' ' + label)
  detail.append($('h2', { text: selected === null ? '全仓的函数' : short(selected) + ' 的函数' }),
    $('div', { class: 'controls' }, report.hasBase ? radio('changed', '基线以来变更的') : null, radio('over', '超阈值的'), radio('all', '全部')))
  let rows = scope.filter(row => filter === 'all' || (filter === 'changed' ? row.changed : row.level !== 'ok'))
  const keys = { score: row => -row.score, cc: row => -row.complexity, cov: row => row.coverage ?? 2, path: row => row.path + String(row.line).padStart(6, '0') }
  rows = [...rows].sort((a, b) => { const x = keys[sortKey](a), y = keys[sortKey](b); return x < y ? -1 : x > y ? 1 : 0 })
  const total = rows.length
  rows = rows.slice(0, 400)
  if (rows.length === 0) { detail.append($('div', { class: 'empty', text: '没有符合条件的函数。' })); return }
  const head = (key, label, cls) => $('th', { class: cls ?? '', text: label + (sortKey === key ? ' ▾' : ''), onclick: () => { sortKey = key; renderDetail() } })
  const table = $('table', {}, $('thead', {}, $('tr', {}, head('path', '位置'), $('th', { text: '函数' }), head('cc', 'CC', 'num'), head('cov', '覆盖', 'num'), head('score', metric === 'CRAP' ? 'CRAP' : '评级分', 'num'), $('th', { text: '变更' }))))
  const body = $('tbody')
  for (const row of rows)
    body.append($('tr', { class: row.changed ? 'changed' : '' },
      $('td', { class: 'mono', text: row.path + ':' + row.line }), $('td', { class: 'fn mono', text: row.name }),
      $('td', { class: 'num', text: String(row.complexity) }), $('td', { class: 'num', style: coverTone(row.coverage), text: pct(row.coverage) }),
      $('td', { class: 'num', style: 'background:' + tone(row.grade, '-fill'), text: num(row.score) }), $('td', { text: row.changed ? '是' : '' })))
  table.append(body); detail.append(table)
  if (total > rows.length) detail.append($('div', { class: 'empty', text: '只显示前 ' + rows.length + ' 条，共 ' + total + ' 条；点成员缩小范围。' }))
}

// ---- 方向发现与例外 ----
const findings = document.getElementById('findings')
if (report.findings.length === 0) findings.append($('div', { class: 'empty', text: '没有方向违规，也没有环。' }))
else findings.append($('ul', { class: 'plain' }, ...report.findings.map(finding => $('li', { class: 'bad' }, finding.message, siteList(finding.sites.slice(0, 8))))))
const exceptions = document.getElementById('exceptions')
if (report.exceptions.length === 0) exceptions.append($('div', { class: 'empty', text: '无。' }))
else exceptions.append($('ul', { class: 'plain' }, ...report.exceptions.map(item => $('li', { class: 'except', text: item.from + ' → ' + item.to + '：' + item.reason }))))

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
${architecture === undefined ? '' : architectureMarkup(architecture)}
<section id="metrics-pane"${architecture === undefined ? '' : ' hidden'}>
<h1>结构度量 <span class="mono">${context.shortHead}</span>${context.dirty ? '<span class="badge bad">工作树不干净，不能当作该提交的度量</span>' : ''}</h1>
<div class="meta">分支 <span class="mono">${escapeHtml(context.branch)}</span> · ${escapeHtml(base)} · 评级用 ${metric} · 函数 warn ${thresholds.warn} / alert ${thresholds.alert} · 成员色带 ${bands.green} / ${bands.yellow} / ${bands.red} · 生成于 ${context.generatedAt}</div>
<pre class="summary">${escapeHtml(context.summary.join('\n'))}</pre>
<h2>结构</h2>
<div class="legend">
<span><i class="swatch" style="background:var(--good-fill)"></i>风险值不超过 ${bands.green}</span>
<span><i class="swatch" style="background:var(--mid-fill)"></i>到 ${bands.yellow} 过渡为黄</span>
<span><i class="swatch" style="background:var(--bad-fill)"></i>到 ${bands.red} 及以上为红</span>
<span><i class="swatch" style="background:var(--nodata)"></i>跑了覆盖率但缺数据</span>
<span>卡片上的数字＝函数评级分的均值加一个标准差；组框左边线＝组内最差成员</span>
<span>粗边框＝基线以来有变更；▲n＝本次变更里超阈值的函数个数</span>
<span>入 n＝n 个成员依赖它，出 n＝它依赖 n 个成员；悬停看清单，点成员看明细并画出它的线</span>
<span style="color:var(--bad)">红＝方向违规或环</span>
<span style="color:var(--except)">橙＝已登记例外</span>
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
<h2>方向违规与环</h2>
<div id="findings"></div>
<h2>已登记的例外</h2>
<div id="exceptions"></div>
<div id="detail"></div>
</section>
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
