// 审讯页。做法取自 Robert C. Martin 的 uml-viewer 与它的前身 arch-view（按其逻辑重写，不搬原文）：
// - 最内层在最底下，按层分行：unclebob/uml-viewer@0171682 engine/layout.clj:286-358。
// - 默认不画连线，只在框边画三角标记、悬停时列出捆在一起的「从 → 到」，违规排前并标红：
//   uml-viewer 的 triangles 模式（application/hit.clj:28-77、engine/draw.clj:373-402）。arch-view
//   在 89907df8 删掉了整套箭头走线，改成三角标记加悬停列表；uml-viewer 的走线提交里大半在修
//   折回、尖角与压框。这里选中一个成员时只画它自己的线；未选中时违规与例外始终画出，
//   本次变更触及的边不超过配置的上限才逐条画，超过就只留三角标记。
// - 评分到颜色：评分不超过 5 时在「差 → 中」之间取色，否则在「中 → 好」之间取色（draw.clj:34-48）；
//   覆盖率单元格 ≥80% 为好、≥50% 为中、其余为差（draw.clj:61-66）。
// - 端点没有框的边跳过（提交 2f532e27）；线画在成员框下面，不盖住名字（提交 8e1c88d4）；
//   成员名只显示最后一段（提交 70fffa0c）。
import type { Report } from './report.ts'

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

const STYLE = `
:root { --bg:#fbfbf9; --fg:#1d1f21; --muted:#6b7280; --line:#d6d3cd; --panel:#ffffff;
  --bad-fill:#f8d2cf; --mid-fill:#fbeebf; --good-fill:#dcefdc;
  --bad:#c0392b; --mid:#b98900; --good:#3f8a4b;
  --nodata:#e5e7eb; --edge:#9aa0a6; --changed:#1f6feb; --except:#c77700; }
@media (prefers-color-scheme: dark) { :root { --bg:#15171a; --fg:#e6e6e6; --muted:#9aa0a6; --line:#3a3d42; --panel:#1d2024;
  --bad-fill:rgb(74,40,24); --mid-fill:rgb(61,58,24); --good-fill:rgb(30,74,56);
  --bad:rgb(224,122,74); --mid:rgb(212,192,90); --good:rgb(95,181,138);
  --nodata:#2a2d31; --edge:#6b7076; --changed:#58a6ff; --except:#e09a2d; } }
* { box-sizing: border-box; }
body { margin:0; padding:16px 20px 60px; background:var(--bg); color:var(--fg);
  font:14px/1.5 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
h1 { font-size:18px; margin:0 0 4px; } h2 { font-size:15px; margin:22px 0 8px; }
code, pre, .mono { font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px; }
.meta { color:var(--muted); } .badge { display:inline-block; padding:0 6px; border-radius:4px; border:1px solid var(--line); margin-left:6px; }
.badge.bad { border-color:var(--bad); color:var(--bad); }
pre.summary { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:10px 12px; overflow-x:auto; margin:10px 0 0; }
#map { position:relative; margin-top:8px; }
#edges { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.layer { display:flex; flex-wrap:wrap; gap:18px 14px; padding:16px 0 30px; border-top:1px dashed var(--line); position:relative; }
.layer > .tag { position:absolute; top:-10px; left:0; background:var(--bg); padding-right:8px; color:var(--muted); font-size:12px; }
.group { border:1px solid var(--line); border-left-width:5px; border-radius:8px; padding:6px 10px 12px; background:var(--panel); }
.group > .name { font-size:12px; color:var(--muted); margin-bottom:8px; }
.tiles { display:flex; flex-wrap:wrap; gap:14px 8px; max-width:600px; }
.tile { cursor:pointer; padding:3px 8px; border-radius:5px; border:1px solid; font-size:12.5px; white-space:nowrap; position:relative; z-index:1; }
.tile.nodata { background:var(--nodata) !important; border-color:var(--muted) !important; border-style:dashed; }
.tile.changed { border-width:3px; font-weight:600; } .tile.selected { outline:3px solid var(--changed); outline-offset:2px; }
.tile .score { color:var(--muted); margin-left:6px; font-weight:400; }
.tile .delta { color:var(--bad); margin-left:6px; font-weight:700; }
.tile i.in, .tile i.out { position:absolute; left:50%; margin-left:-6px; width:0; height:0; border:6px solid transparent; border-bottom:0; border-top-color:var(--edge); }
.tile i.in { top:-7px; } .tile i.out { bottom:-7px; }
.tile i.bad { border-top-color:var(--bad); } .tile i.except { border-top-color:var(--except); } .tile i.new { border-top-color:var(--changed); }
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
const worst = edges => edges.some(e => e.violating) ? 'bad' : edges.some(e => e.excepted) ? 'except' : edges.some(e => e.changed) ? 'new' : ''
let selected = null
let showGroupLines = false
let filter = report.hasBase ? 'changed' : 'over'
let sortKey = 'score'

// ---- 结构图 ----
const map = document.getElementById('map')
const hover = document.getElementById('hover')
const note = document.getElementById('note')
const tiles = new Map()
const groupBoxes = new Map()
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
svg.id = 'edges'
const layerNames = ['最内层', '领域与基础设施', '装配']
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
function tileFor(member) {
  const noData = report.coverageEnabled && member.coverage === 'no-data'
  const out = outgoing.get(member.path) ?? [], inc = incoming.get(member.path) ?? []
  const tile = $('div', {
    class: ['tile', noData ? 'nodata' : '', member.changed ? 'changed' : ''].join(' ').trim(),
    style: 'background:' + tone(member.grade, '-fill') + ';border-color:' + tone(member.grade, ''),
    onclick: () => select(member.path),
    onmousemove: event => showHover(event, member.path),
    onmouseleave: () => { hover.style.display = 'none' },
  }, short(member.path), $('span', { class: 'score', text: member.functions === 0 ? '' : num(member.risk) }),
    member.changedOver > 0 ? $('span', { class: 'delta', text: '▲' + member.changedOver }) : null,
    inc.length ? $('i', { class: 'in ' + worst(inc) }) : null,
    out.length ? $('i', { class: 'out ' + worst(out) }) : null)
  tiles.set(member.path, tile)
  return tile
}
const placed = new Set()
for (let index = report.layout.length - 1; index >= 0; index -= 1) {
  const groups = report.layout[index]
  if (groups.length === 0) continue
  const layer = $('div', { class: 'layer' }, $('span', { class: 'tag', text: '第 ' + index + ' 层 · ' + (layerNames[index] ?? '') }))
  for (const group of groups) {
    const box = $('div', { class: 'tiles' })
    for (const path of group.members) { placed.add(path); box.append(tileFor(memberByPath.get(path))) }
    const wrap = $('div', { class: 'group', style: 'border-left-color:' + tone(group.grade, ''), title: '组内最差成员的风险值 ' + num(group.risk) },
      $('div', { class: 'name', text: group.group }), box)
    groupBoxes.set(group.group, wrap)
    layer.append(wrap)
  }
  map.append(layer)
}
const unplaced = report.members.filter(member => !placed.has(member.path))
if (unplaced.length > 0) {
  const box = $('div', { class: 'tiles' })
  for (const member of unplaced) box.append(tileFor(member))
  map.append($('div', { class: 'layer' }, $('span', { class: 'tag bad', text: '未登记层位的组' }), $('div', { class: 'group' }, box)))
}
map.append(svg)

const center = el => {
  const a = el.getBoundingClientRect(), b = map.getBoundingClientRect()
  return { x: a.left - b.left + a.width / 2, top: a.top - b.top, bottom: a.bottom - b.top, y: a.top - b.top + a.height / 2 }
}
function line(from, to, color, width, dash) {
  const a = center(from), b = center(to)
  const down = a.y <= b.y
  const y1 = down ? a.bottom : a.top, y2 = down ? b.top : b.bottom
  const mid = (y1 + y2) / 2
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M' + a.x + ',' + y1 + ' C' + a.x + ',' + mid + ' ' + b.x + ',' + mid + ' ' + b.x + ',' + y2)
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', color); path.setAttribute('stroke-width', width)
  if (dash) path.setAttribute('stroke-dasharray', dash)
  path.setAttribute('marker-end', 'url(#arrow)')
  svg.append(path)
}
function drawEdges() {
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  svg.replaceChildren()
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  defs.innerHTML = '<marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke"/></marker>'
  svg.append(defs)
  const both = edge => tiles.has(edge.from) && tiles.has(edge.to)
  if (showGroupLines && selected === null) {
    const innermost = new Set((report.layout[0] ?? []).map(group => group.group))
    const seen = new Set()
    for (const edge of report.edges) {
      const from = memberByPath.get(edge.from)?.group, to = memberByPath.get(edge.to)?.group
      const key = from + '>' + to
      // 人人都依赖最内层，这些线只添乱。
      if (innermost.has(to) || from === to || seen.has(key) || !groupBoxes.has(from) || !groupBoxes.has(to)) continue
      seen.add(key)
      line(groupBoxes.get(from), groupBoxes.get(to), css('--edge'), 1, '')
    }
  }
  const color = edge => edge.violating ? css('--bad') : edge.excepted ? css('--except') : edge.changed ? css('--changed') : css('--fg')
  const draw = (edge, dash) => line(tiles.get(edge.from), tiles.get(edge.to), color(edge), edge.violating ? 2.4 : edge.excepted ? 2 : 1.4, dash)
  const drawable = report.edges.filter(both)
  if (selected !== null) {
    // 选中一个成员时只画它自己的线（指向它的用虚线）；别处只留违规，不让别的线盖住要看的。
    for (const edge of drawable) {
      if (edge.from === selected || edge.to === selected) draw(edge, edge.to === selected ? '4 3' : '')
      else if (edge.violating) draw(edge, '')
    }
    return
  }
  // 变更大时逐条画变更边会糊成一团（uml-viewer 走过的弯路）：超过上限就只留三角标记。
  const touched = drawable.filter(edge => edge.changed && !edge.violating && !edge.excepted)
  const drawTouched = touched.length <= data.page.changedEdgeLimit
  note.textContent = touched.length === 0 || drawTouched ? ''
    : '本次变更触及 ' + touched.length + ' 条跨成员导入，超过 ' + data.page.changedEdgeLimit + ' 条不逐条画：看蓝色三角，或点成员只看它的线。'
  for (const edge of drawable) {
    if (edge.violating) draw(edge, '')
    else if (edge.excepted) draw(edge, '6 3')
    else if (edge.changed && drawTouched) draw(edge, '')
  }
}
window.addEventListener('resize', drawEdges)
document.getElementById('lines').addEventListener('change', event => { showGroupLines = event.target.checked; drawEdges() })

// ---- 明细 ----
const detail = document.getElementById('detail')
function select(path) {
  selected = selected === path ? null : path
  for (const [key, tile] of tiles) tile.classList.toggle('selected', key === selected)
  // 网址带上成员路径，交付说明里可以直接给出定位到某个成员的链接。
  history.replaceState(null, '', selected === null ? location.pathname : '#' + selected)
  drawEdges(); renderDetail()
}
function siteList(sites) {
  return $('ul', { class: 'plain mono' }, ...sites.map(site => $('li', { text: site.path + ':' + site.line + '  ' + site.specifier })))
}
function renderDetail() {
  detail.replaceChildren()
  const scope = selected === null ? report.functions : report.functions.filter(row => row.member === selected)
  if (selected !== null) {
    const member = memberByPath.get(selected)
    const coverage = { measured: '有数据，语句行命中 ' + pct(member.lineCoverage), 'no-data': '跑了测试但没有命中本包源码（测试在子进程或别处执行）', 'not-run': '这次没跑' }[member.coverage]
    detail.append($('h2', { text: member.path }),
      $('div', { class: 'meta', text: '第 ' + member.layer + ' 层 · 组 ' + member.group + ' · 函数 ' + member.functions + ' 个' }),
      $('div', { text: metric + '：均值 ' + num(member.mu) + ' · 最大 ' + num(member.max) + ' · 标准差 ' + num(member.sigma) + ' · 风险值（均值加标准差）' + num(member.risk) + ' · 超 alert ' + member.overAlert + '、超 warn ' + member.overWarn }),
      $('div', { text: '依赖它的 ' + member.fanIn + ' 个 · 它依赖的 ' + member.fanOut + ' 个 · 不稳定度 ' + member.instability.toFixed(2) + '（0 最稳定，越多人依赖越该稳定）' }),
      $('div', { text: '覆盖率：' + (report.coverageEnabled ? coverage : '未开启') }))
    const out = sorted(outgoing.get(selected) ?? []), inc = sorted(incoming.get(selected) ?? [])
    const edgeItem = (edge, other) => $('li', { class: edge.violating ? 'bad' : edge.excepted ? 'except' : '' },
      other + '（' + edge.count + ' 处导入' + (edge.violating ? '，违规' : edge.excepted ? '，已登记例外' : '') + (edge.changed ? '，本次变更触及' : '') + '）', siteList(edge.sites))
    detail.append($('h2', { text: '它依赖的（' + out.length + '）' }), out.length ? $('ul', { class: 'plain' }, ...out.map(edge => edgeItem(edge, edge.to))) : $('div', { class: 'empty', text: '无' }))
    detail.append($('h2', { text: '依赖它的（' + inc.length + '）' }), inc.length ? $('ul', { class: 'plain' }, ...inc.map(edge => edgeItem(edge, edge.from))) : $('div', { class: 'empty', text: '无' }))
  }
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
requestAnimationFrame(drawEdges)
`

/** 自包含、离线可开的审讯页：数据内联，无外部资源。 */
export function renderPage(report: Report, context: PageContext): string {
  const metric = report.coverageEnabled
    ? 'CRAP（没有覆盖率数据的函数用圈复杂度）'
    : '圈复杂度（未开覆盖率）'
  const base = context.baseRef === undefined ? '无基线' : `基线 ${context.baseRef}`
  const { bands, thresholds } = report
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>结构度量 ${context.shortHead}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>结构度量 <span class="mono">${context.shortHead}</span>${context.dirty ? '<span class="badge bad">工作树不干净，不能当作该提交的度量</span>' : ''}</h1>
<div class="meta">分支 <span class="mono">${escapeHtml(context.branch)}</span> · ${escapeHtml(base)} · 评级用 ${metric} · 函数 warn ${thresholds.warn} / alert ${thresholds.alert} · 成员色带 ${bands.green} / ${bands.yellow} / ${bands.red} · 生成于 ${context.generatedAt}</div>
<pre class="summary">${escapeHtml(context.summary.join('\n'))}</pre>
<h2>结构</h2>
<div class="legend">
<span><i class="swatch" style="background:var(--good-fill)"></i>风险值不超过 ${bands.green}</span>
<span><i class="swatch" style="background:var(--mid-fill)"></i>到 ${bands.yellow} 过渡为黄</span>
<span><i class="swatch" style="background:var(--bad-fill)"></i>到 ${bands.red} 及以上为红</span>
<span><i class="swatch" style="background:var(--nodata)"></i>跑了覆盖率但缺数据</span>
<span>成员上的数字＝函数评级分的均值加一个标准差；组框左边线＝组内最差成员</span>
<span>粗边框＝基线以来有变更；▲n＝本次变更里超阈值的函数个数</span>
<span>上沿三角＝有人依赖它，下沿三角＝它依赖别人；悬停看清单，点成员看明细并画出它的线</span>
<span style="color:var(--bad)">红＝方向违规或环</span>
<span style="color:var(--except)">橙＝已登记例外</span>
<span style="color:var(--changed)">蓝＝本次变更触及的导入</span>
<label><input type="checkbox" id="lines"> 画出组间连线（不含指向最内层的）</label>
</div>
<div id="note" class="empty"></div>
<div id="map"></div>
<div id="hover"></div>
<h2>方向违规与环</h2>
<div id="findings"></div>
<h2>已登记的例外</h2>
<div id="exceptions"></div>
<div id="detail"></div>
<script type="application/json" id="data">${embed({ report, page: { changedEdgeLimit: context.changedEdgeLimit } })}</script>
<script>${SCRIPT}</script>
</body>
</html>
`
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
