import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { architectureBrowser } from './browser.ts'
import { architectureLayoutInput } from './layout.ts'
import { architectureViewport } from './viewport.ts'
import { architectureMatrix } from './matrix.ts'
import { conformanceBrowser } from './conformance-browser.ts'
import { selectArchitectureView, type ArchitectureView } from './view.ts'
import { architectureFlowBundle } from './flow/bundle.ts'
import { FLOW_STYLE } from './flow/style.ts'

export function architectureMarkup(graph: ArchitectureView): string {
  const data = JSON.stringify(graph)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
  const bundle = readFileSync(
    createRequire(import.meta.url).resolve('elkjs/lib/elk.bundled.js'),
    'utf8',
  )
  const flow = architectureFlowBundle()
  const inline = (script: string): string => script.replaceAll('</script', '<\\/script')
  return `<style>${flow.style}${FLOW_STYLE}</style>
<style>
button,select { font:inherit; color:inherit; background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:6px 9px; }
button { cursor:pointer; } button:disabled { cursor:wait; opacity:.45; }
button:focus-visible,select:focus-visible { outline:3px solid var(--changed); outline-offset:2px; }
[hidden] { display:none !important; }
.arch-nav { display:flex; gap:8px; margin-bottom:14px; }
#architecture-pane { --canvas:#fafbf9; }
@media (prefers-color-scheme: dark) { #architecture-pane { --canvas:#15171a; } }
.arch-heading { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
.arch-heading h1 { margin:0; font-size:22px; }
#arch-counts { font-size:12px; color:var(--muted); margin:0; }
#arch-coordinate { font-size:11px; overflow-wrap:anywhere; }
.arch-toolbar { display:flex; flex-wrap:wrap; gap:9px 14px; padding:12px 0; }
.arch-toolbar label { display:flex; align-items:center; gap:6px; font-size:12px; }
.arch-toolbar select { max-width:320px; }
#arch-kinds { display:flex; flex-wrap:wrap; gap:7px 13px; font-size:12px; }
.arch-filters { margin-bottom:12px; } .arch-filters summary { cursor:pointer; color:var(--muted); }
.arch-filters fieldset { margin:10px 0; border:1px solid var(--line); border-radius:6px; }
.arch-workspace { display:grid; grid-template-columns:190px minmax(0,1fr) 300px; border:1px solid var(--line); border-radius:10px; overflow:hidden; height:72vh; min-height:520px; background:var(--panel); }
.arch-sidebar { min-width:0; overflow:auto; padding:14px; background:var(--panel); }
.arch-sidebar h2 { font-size:11px; letter-spacing:.06em; color:var(--muted); margin:8px 0 12px; }
.arch-sidebar h3 { font-size:12px; }
.arch-sidebar p,.arch-sidebar li { font-size:12px; line-height:1.6; }
.arch-navigation { border-right:1px solid var(--line); }
.arch-card,.arch-item,.arch-edge { display:block; text-align:left; width:100%; margin:4px 0; padding:8px; overflow-wrap:anywhere; font-size:11px; }
.arch-card,.arch-item { transition:border-color .12s ease, background-color .12s ease, box-shadow .12s ease; }
.arch-card:hover,.arch-item:hover { border-color:color-mix(in srgb, var(--fg) 35%, var(--line)); }
.arch-card[aria-current=true],.arch-item[aria-current=true] { border-color:var(--changed); box-shadow:inset 3px 0 0 var(--changed); background:color-mix(in srgb, var(--changed) 12%, var(--panel)); color:var(--fg); font-weight:600; }
.arch-card[aria-current=true]:hover,.arch-item[aria-current=true]:hover { background:color-mix(in srgb, var(--changed) 18%, var(--panel)); }
.arch-canvas { display:flex; flex-direction:column; min-width:0; overflow:hidden; background:var(--canvas); }
.arch-canvas-bar { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 12px; border-bottom:1px solid var(--line); font-size:11px; background:var(--panel); }
#arch-breadcrumb { flex:1; overflow-wrap:anywhere; }
#arch-breadcrumb button { border:0; padding:3px; background:none; font-size:11px; }
#arch-diagram { flex:1; min-height:0; overflow:hidden; position:relative; }
#arch-diagram > svg { display:block; width:100%; height:100%; touch-action:none; cursor:grab; background:#fafbf9; }
#arch-diagram > svg:active { cursor:grabbing; }
#arch-diagram > svg [data-node-id],#arch-diagram > svg [data-edge-id] { cursor:pointer; }
#arch-diagram g[role=button]:hover rect { stroke:#1f6feb; stroke-width:2; }
#arch-diagram path[role=button]:hover { stroke:#1f6feb; stroke-width:4; }
.arch-canvas-footer { padding:8px 12px; border-top:1px solid var(--line); background:var(--panel); font-size:11px; color:var(--muted); }
.arch-loading,.arch-error { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:24px;
  background-image:radial-gradient(circle, rgba(120,128,140,.35) 1px, transparent 1.6px); background-size:22px 22px; }
.arch-loading { opacity:0; animation:arch-fade-in .25s ease .15s forwards; }
.arch-paper { background-color:#fafbf9; }
.arch-status-box { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:260px; max-width:560px; padding:18px 24px; border:1px solid var(--line); border-radius:8px; background:var(--panel); color:var(--fg); box-shadow:0 10px 30px -18px rgba(0,0,0,.4); }
.arch-error .arch-status-box { align-items:flex-start; border-color:var(--bad); border-left-width:4px; }
.arch-loading-ring { width:26px; height:26px; margin-bottom:6px; border-radius:50%; border:2.5px solid color-mix(in srgb, var(--line) 85%, transparent); border-top-color:var(--changed); animation:arch-spin .9s linear infinite; }
.arch-status-title { margin:0; font-size:13px; font-weight:600; }
.arch-status-detail { margin:0; font-size:11px; color:var(--muted); overflow-wrap:anywhere; }
.arch-error .arch-status-title { color:var(--bad); }
@keyframes arch-spin { to { transform:rotate(360deg); } }
@keyframes arch-fade-in { to { opacity:1; } }
@media (prefers-reduced-motion: reduce) { .arch-loading { animation:none; opacity:1; } .arch-loading-ring { animation:none; } }
.arch-inspector { border-left:1px solid var(--line); }
#arch-detail { overflow-wrap:anywhere; } #arch-detail h2 { font-size:15px; color:var(--ink); }
#arch-detail code { display:block; font-size:10px; overflow-wrap:anywhere; }
#arch-detail ul { padding-left:18px; } #arch-unknown li { overflow-wrap:anywhere; }
.arch-notice { padding:9px 12px; border:1px solid var(--line); border-radius:6px; background:var(--panel); font-size:12px; margin-top:12px; }
.arch-notice summary { cursor:pointer; }
.conformance-domains { display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:10px; }
.conformance-domain-card,.conformance-row { padding:12px; border:1px solid var(--line); border-radius:8px; margin:8px 0; overflow-wrap:anywhere; }
.conformance-domain-card p,.conformance-row p { font-size:12px; }
.conformance-row[data-state=deviation] { border-left:4px solid #ad6100; }
.conformance-row code { display:block; font-size:11px; }
#conformance-pane pre { white-space:pre-wrap; overflow-wrap:anywhere; }
@media(min-width:1700px) { .arch-workspace { grid-template-columns:220px minmax(0,1fr) 330px; } }
@media(max-width:1050px) { .arch-workspace { grid-template-columns:155px minmax(0,1fr) 245px; } .arch-sidebar { padding:9px; } }
@media(max-width:760px) { .arch-workspace { display:block; height:auto; } .arch-navigation { max-height:180px; border-bottom:1px solid var(--line); } .arch-canvas { height:65vh; min-height:360px; } .arch-inspector { max-height:420px; border-top:1px solid var(--line); } }
</style>
<nav class="arch-nav" aria-label="评审视图"><button id="arch-tab">架构视图</button><button id="conformance-tab">责任与符合性</button><button id="metrics-tab">复杂度与风险</button></nav>
<section id="architecture-pane">
<div class="arch-heading"><h1>全局实际架构</h1><p id="arch-counts"></p></div>
<p id="arch-coordinate" class="meta mono"></p>
<div class="arch-toolbar">
<button id="arch-home">系统总览</button>
<label>目录组或应用 <select id="arch-group"></select></label>
<label>聚焦组件 <select id="arch-focus"></select></label>
<label><input id="arch-neighbors" type="checkbox" checked>显示邻接</label>
</div>
<details class="arch-filters" open><summary>关系、变化与度量</summary>
<div class="arch-toolbar">
<label>变化范围 <select id="arch-changes"><option value="current">当前</option><option value="all">当前与已删除</option><option value="changed">新增与删除</option><option value="added">新增</option><option value="removed">删除</option></select></label>
<label><input id="arch-complexity" type="checkbox">叠加圈复杂度</label>
<label><input id="arch-coupling" type="checkbox">叠加耦合</label>
<label><input id="arch-conformance" type="checkbox">叠加符合性</label>
<button id="arch-export-svg" disabled>导出 SVG</button><button id="arch-export-json" disabled>导出 JSON</button>
</div>
<fieldset><legend>关系种类</legend><div id="arch-kinds"></div></fieldset>
</details>
<div class="arch-workspace">
<aside class="arch-sidebar arch-navigation" aria-label="架构导航"><h2>应用与目录组</h2><div id="arch-overview"></div><h2>当前图节点</h2><div id="arch-members"></div></aside>
<div class="arch-canvas">
<div class="arch-canvas-bar"><nav id="arch-breadcrumb" aria-label="当前架构路径"></nav><button id="arch-matrix">依赖矩阵</button><button id="arch-graph">关系图</button><button id="arch-zoom-in">放大</button><button id="arch-zoom-out">缩小</button><button id="arch-fit">适应全图</button></div>
<div id="arch-diagram" role="region" aria-label="架构画布" aria-busy="true" data-layout-state="loading"></div>
<div class="arch-canvas-footer"><span id="arch-layout-status" role="status" aria-live="polite">正在布局…</span> · <span id="arch-canvas-hint">拖动画布空白区域平移</span></div>
</div>
<aside class="arch-sidebar arch-inspector" aria-label="架构详情"><h2>所选节点或关系</h2><div id="arch-detail"></div><h2>关系清单</h2><div id="arch-relations"></div></aside>
</div>
<details class="arch-notice" open><summary>图例与证据范围</summary>
<p>静态声明视图。目录聚合不表示运行、部署、事务或租户边界。服务/事件同名连接不证明实际绑定。装配条目是源码声明；确认配置选择与实际运行绑定：未观测。架构预期及静态子集见“责任与符合性”；橙色标记表示所选预期下存在静态偏离。</p>
<p class="legend">蓝框/蓝线＝新增；红色虚框/虚线＝BASE 已删除。类型导入和可选服务使用虚线。耦合入/出为全部当前静态关系的去重邻接数，不是运行调用量。</p>
<p id="arch-measurement" class="meta"></p>
</details>
<details class="arch-notice"><summary>未知与未覆盖范围</summary><div id="arch-unknown"></div></details>
<details class="arch-notice"><summary>六问导航与尚未确认的边界</summary><div id="arch-guidance"></div></details>
</section>
<section id="conformance-pane" hidden>
<h1>系统责任与架构符合性</h1><p id="conformance-coordinate" class="meta"></p>
<div id="conformance-expected-path" class="arch-notice"></div>
<details class="arch-notice"><summary>已认可责任方向与候选实现映射</summary><div id="conformance-responsibility" class="conformance-domains"></div></details>
<div class="arch-toolbar"><label>结果 <select id="conformance-state"><option value="deviation">静态偏离</option><option value="new">新增偏离</option><option value="stock">存量偏离</option><option value="unknown">未知</option><option value="converged">有限静态检查符合</option><option value="all">全部</option></select></label><label>责任 <select id="conformance-domain"></select></label><label>成员 <select id="conformance-member"></select></label></div>
<p id="conformance-counts"></p><p id="conformance-selection" class="meta"></p><div id="conformance-rows"></div>
<details class="arch-notice" open><summary>预期语义变化</summary><div id="conformance-changes"></div></details>
<details class="arch-notice"><summary>机械、人工与行为证据边界</summary><div id="conformance-coverage"></div></details>
</section>
<script type="application/json" id="architecture-data">${data}</script>
<script>${inline(bundle)}</script>
<script>${inline(flow.script)}</script>`
}

export function architectureScript(): string {
  return `(${architectureBrowser.toString()})(${selectArchitectureView.toString()},${architectureLayoutInput.toString()},${architectureViewport.toString()},${architectureMatrix.toString()},new ELK(),${conformanceBrowser.toString()},window.ArchitectureFlow);`
}
