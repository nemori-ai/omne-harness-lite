import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { gzipSync } from 'node:zlib'
import { transformSync } from 'esbuild'
import { architectureBrowser } from './browser.ts'
import { architectureLayoutInput } from './layout.ts'
import { architectureViewport } from './viewport.ts'
import { architectureMatrix } from './matrix.ts'
import { conformanceBrowser } from './conformance-browser.ts'
import { selectArchitectureView, type ArchitectureView } from './view.ts'

let elk: string | undefined

/**
 * elkjs 不发布压缩过的 elk.bundled.js（只有 elk-worker.min.js），这里在生成页面时压缩一次并缓存。
 * 它的版权声明是普通注释，压缩会删掉，所以先摘出带 Copyright 的声明块，去重后放回开头。
 */
export function elkScript(): string {
  if (elk !== undefined) return elk
  const source = readFileSync(
    createRequire(import.meta.url).resolve('elkjs/lib/elk.bundled.js'),
    'utf8',
  )
  const notices = [
    ...new Set(
      (source.match(/\/\*[\s\S]*?\*\//gu) ?? []).filter(text => text.includes('Copyright')),
    ),
  ]
  const code = transformSync(source, { minify: true, legalComments: 'none', target: 'es2020' }).code
  elk = `${notices.join('\n')}\n${code}`
  return elk
}

export function architectureMarkup(graph: ArchitectureView): string {
  // 架构数据有几十 MB 且高度重复：gzip 后以 base64 内联，体积约为原来的 5%。
  // base64 只含字母、数字与 +/=，不可能提前闭合脚本标签。
  const data = gzipSync(JSON.stringify(graph), { level: 9 }).toString('base64')
  const bundle = elkScript()
  const inline = (script: string): string => script.replaceAll('</script', '<\\/script')
  // React Flow 的 bundle 与样式由 renderPage 内联一次，架构视图与结构图共用。
  return `<style>
/* 视图切换：吸顶的分段控件；当前视图由面板是否隐藏决定，不另设状态。 */
body:has(.arch-nav) { --sticky-top:57px; }
.arch-nav { position:sticky; top:0; z-index:20; display:flex; gap:4px; height:57px; align-items:center;
  margin:-32px calc(50% - 50vw) 28px; padding:0 max(32px, calc(50vw - 880px));
  background:color-mix(in srgb, var(--bg) 86%, transparent); -webkit-backdrop-filter:saturate(1.4) blur(10px); backdrop-filter:saturate(1.4) blur(10px);
  border-bottom:1px solid var(--line); }
.arch-nav button { height:32px; padding:0 14px; border:0; background:transparent; color:var(--muted); font-size:13.5px; font-weight:500; border-radius:var(--r-ctrl); }
.arch-nav button:hover:not(:disabled) { background:color-mix(in srgb, var(--fg) 6%, transparent); color:var(--fg); border:0; }
body:has(#architecture-pane:not([hidden])) #arch-tab,
body:has(#conformance-pane:not([hidden])) #conformance-tab,
body:has(#metrics-pane:not([hidden])) #metrics-tab { background:var(--ink); color:var(--on-ink); }
.arch-heading { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px 24px; }
.arch-heading h1 { margin:0; }
#arch-counts { font-size:13px; color:var(--muted); margin:0; font-variant-numeric:tabular-nums; }
#arch-coordinate { font-size:12px; margin:6px 0 0; overflow-wrap:anywhere; color:var(--faint); }
.arch-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; padding:18px 0 14px; }
.arch-toolbar label { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--muted); }
.arch-toolbar select { max-width:320px; color:var(--fg); }
/* 折叠区：自绘箭头，标题与内容共用一个面板。 */
.arch-filters, .arch-notice { margin:0 0 12px; background:var(--panel); border:1px solid var(--line); border-radius:var(--r-panel); }
.arch-filters > summary, .arch-notice > summary { list-style:none; display:flex; align-items:center; gap:10px; padding:12px 16px; cursor:pointer;
  font-size:13px; font-weight:600; color:var(--fg); border-radius:var(--r-panel); }
.arch-filters > summary::-webkit-details-marker, .arch-notice > summary::-webkit-details-marker { display:none; }
.arch-filters > summary::before, .arch-notice > summary::before { content:''; width:6px; height:6px; margin:0 2px 2px;
  border-right:1.5px solid var(--muted); border-bottom:1.5px solid var(--muted); transform:rotate(-45deg); transition:transform .15s ease; }
.arch-filters[open] > summary::before, .arch-notice[open] > summary::before { transform:rotate(45deg); margin-bottom:4px; }
.arch-filters > summary:hover, .arch-notice > summary:hover { background:var(--panel-2); }
.arch-filters[open] > summary, .arch-notice[open] > summary { border-bottom-left-radius:0; border-bottom-right-radius:0; }
.arch-filters .arch-toolbar { padding:4px 16px 14px; }
.arch-filters fieldset { margin:0 16px 16px; padding:12px 14px 14px; border:1px solid var(--line); border-radius:var(--r-item); }
.arch-filters legend { padding:0 6px; font-size:12px; color:var(--muted); }
#arch-kinds { display:flex; flex-wrap:wrap; gap:8px; font-size:12.5px; }
#arch-kinds label { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 12px 0 10px; border:1px solid var(--line-strong);
  border-radius:999px; background:var(--panel); cursor:pointer; transition:background-color .12s ease, border-color .12s ease; }
#arch-kinds label:has(input:checked) { background:var(--panel-2); border-color:color-mix(in srgb, var(--fg) 35%, var(--line-strong)); }
#arch-kinds label:has(input:not(:checked)) { color:var(--muted); }
.arch-notice > :not(summary) { margin-left:16px; margin-right:16px; }
.arch-notice > :last-child:not(summary) { margin-bottom:14px; }
.arch-notice p, .arch-notice li { font-size:13px; line-height:1.7; }
#architecture-pane .arch-notice:first-of-type { margin-top:16px; }
.arch-workspace { display:grid; grid-template-columns:200px minmax(0,1fr) 320px; border:1px solid var(--line); border-radius:var(--r-panel);
  overflow:hidden; height:72vh; min-height:520px; background:var(--panel); margin-bottom:16px; }
.arch-sidebar { min-width:0; overflow:auto; padding:16px; background:var(--panel); }
.arch-sidebar h2 { font-size:12px; font-weight:600; color:var(--muted); margin:6px 0 10px; }
.arch-sidebar h2 ~ h2 { margin-top:22px; }
.arch-sidebar h3 { font-size:13px; }
.arch-sidebar p, .arch-sidebar li { font-size:12.5px; line-height:1.65; }
.arch-navigation { border-right:1px solid var(--line); }
.arch-card, .arch-item, .arch-edge { display:block; height:auto; text-align:left; width:100%; margin:0 0 6px; padding:8px 10px; line-height:1.45;
  overflow-wrap:anywhere; font-size:12px; border-color:var(--line); border-radius:var(--r-item); }
.arch-card:hover, .arch-item:hover, .arch-edge:hover { border-color:color-mix(in srgb, var(--fg) 28%, var(--line-strong)); }
.arch-card[aria-current=true], .arch-item[aria-current=true] { border-color:var(--line-strong); box-shadow:inset 3px 0 0 var(--ink);
  background:var(--panel-2); color:var(--fg); font-weight:600; }
.arch-card[aria-current=true]:hover, .arch-item[aria-current=true]:hover { background:color-mix(in srgb, var(--panel-2) 70%, var(--line)); }
.arch-canvas { display:flex; flex-direction:column; min-width:0; overflow:hidden; background:var(--canvas); }
.arch-canvas-bar { display:flex; align-items:center; flex-wrap:wrap; gap:6px; padding:8px 12px; border-bottom:1px solid var(--line); font-size:12px; background:var(--panel); }
.arch-canvas-bar button { height:28px; padding:0 10px; font-size:12.5px; }
#arch-breadcrumb { flex:1; overflow-wrap:anywhere; color:var(--muted); }
#arch-breadcrumb button { height:auto; border:0; padding:3px 4px; background:none; font-size:12px; color:var(--fg); }
#arch-breadcrumb button:hover { text-decoration:underline; background:none; }
#arch-diagram { flex:1; min-height:0; overflow:hidden; position:relative; }
#arch-diagram > svg { display:block; width:100%; height:100%; touch-action:none; cursor:grab; background:#fafbf9; }
#arch-diagram > svg:active { cursor:grabbing; }
#arch-diagram > svg [data-node-id],#arch-diagram > svg [data-edge-id] { cursor:pointer; }
#arch-diagram g[role=button]:hover rect { stroke:#1f6feb; stroke-width:2; }
#arch-diagram path[role=button]:hover { stroke:#1f6feb; stroke-width:4; }
.arch-canvas-footer { padding:8px 12px; border-top:1px solid var(--line); background:var(--panel); font-size:12px; color:var(--muted); }
.arch-loading,.arch-error { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:24px;
  background-image:radial-gradient(circle, rgba(120,128,140,.35) 1px, transparent 1.6px); background-size:22px 22px; }
.arch-loading { opacity:0; animation:arch-fade-in .25s ease .15s forwards; }
.arch-paper { background-color:#fafbf9; }
.arch-status-box { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:260px; max-width:560px; padding:18px 24px; border:1px solid var(--line); border-radius:var(--r-item); background:var(--panel); color:var(--fg); box-shadow:var(--shadow-float); }
.arch-error .arch-status-box { align-items:flex-start; border-color:var(--bad); border-left-width:4px; }
.arch-loading-ring { width:26px; height:26px; margin-bottom:6px; border-radius:50%; border:2.5px solid color-mix(in srgb, var(--line) 85%, transparent); border-top-color:var(--changed); animation:arch-spin .9s linear infinite; }
.arch-status-title { margin:0; font-size:13px; font-weight:600; }
.arch-status-detail { margin:0; font-size:12px; color:var(--muted); overflow-wrap:anywhere; }
.arch-error .arch-status-title { color:var(--bad); }
@keyframes arch-spin { to { transform:rotate(360deg); } }
@keyframes arch-fade-in { to { opacity:1; } }
@media (prefers-reduced-motion: reduce) { .arch-loading { animation:none; opacity:1; } .arch-loading-ring { animation:none; } }
.arch-inspector { border-left:1px solid var(--line); }
#arch-detail { overflow-wrap:anywhere; } #arch-detail h2 { font-size:15px; color:var(--fg); margin:4px 0 8px; }
#arch-detail code { display:block; font-size:11px; color:var(--muted); overflow-wrap:anywhere; }
#arch-detail ul { padding-left:18px; } #arch-detail button { margin:6px 0; } #arch-unknown li { overflow-wrap:anywhere; }
#conformance-pane .arch-toolbar { padding-top:20px; }
#conformance-counts { font-size:14px; font-weight:500; margin:4px 0 2px; font-variant-numeric:tabular-nums; }
#conformance-selection { margin:0 0 12px; }
.conformance-domains { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:10px; }
.conformance-domain-card, .conformance-row { padding:12px 14px; background:var(--panel); border:1px solid var(--line); border-radius:var(--r-item); margin:8px 0; overflow-wrap:anywhere; }
.conformance-domain-card p, .conformance-row p { font-size:12.5px; line-height:1.65; }
.conformance-row[data-state=deviation] { border-left:4px solid #ad6100; }
.conformance-row code { display:block; font-size:11.5px; color:var(--muted); }
#conformance-expected-path { padding:4px 16px; }
#conformance-pane pre { white-space:pre-wrap; overflow-wrap:anywhere; }
@media(min-width:1700px) { .arch-workspace { grid-template-columns:230px minmax(0,1fr) 350px; } }
@media(max-width:1050px) { .arch-workspace { grid-template-columns:160px minmax(0,1fr) 250px; } .arch-sidebar { padding:10px; } }
@media(max-width:760px) { .arch-nav { margin:-20px -16px 20px; padding:0 16px; } .arch-workspace { display:block; height:auto; } .arch-navigation { max-height:180px; border-right:0; border-bottom:1px solid var(--line); } .arch-canvas { height:65vh; min-height:360px; } .arch-inspector { max-height:420px; border-left:0; border-top:1px solid var(--line); } }
</style>
<nav class="arch-nav" aria-label="评审视图"><button id="arch-tab">架构视图</button><button id="conformance-tab">责任与符合性</button><button id="metrics-tab">复杂度与风险</button></nav>
<section id="architecture-pane">
<header class="pane-head">
<div class="arch-heading"><h1>全局实际架构</h1><p id="arch-counts"></p></div>
<p id="arch-coordinate" class="meta mono"></p>
</header>
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
<header class="pane-head"><h1>系统责任与架构符合性</h1><p id="conformance-coordinate" class="meta"></p></header>
<div id="conformance-expected-path" class="arch-notice"></div>
<details class="arch-notice"><summary>已认可责任方向与候选实现映射</summary><div id="conformance-responsibility" class="conformance-domains"></div></details>
<div class="arch-toolbar"><label>结果 <select id="conformance-state"><option value="deviation">静态偏离</option><option value="new">新增偏离</option><option value="stock">存量偏离</option><option value="unknown">未知</option><option value="converged">有限静态检查符合</option><option value="all">全部</option></select></label><label>责任 <select id="conformance-domain"></select></label><label>成员 <select id="conformance-member"></select></label></div>
<p id="conformance-counts"></p><p id="conformance-selection" class="meta"></p><div id="conformance-rows"></div>
<details class="arch-notice" open><summary>预期语义变化</summary><div id="conformance-changes"></div></details>
<details class="arch-notice"><summary>机械、人工与行为证据边界</summary><div id="conformance-coverage"></div></details>
</section>
<script type="application/gzip" id="architecture-data" data-encoding="base64">${data}</script>
<script>${inline(bundle)}</script>`
}

/**
 * 先用浏览器原生的 DecompressionStream 解压架构数据，再启动视图；解压是异步的，视图在数据就绪后才挂上。
 * 解压或解析失败时在布局状态栏显示原因并把画布标为失败，不静默留空。
 */
export function architectureScript(): string {
  return `(async () => {
  const diagram = document.getElementById('arch-diagram');
  const status = document.getElementById('arch-layout-status');
  let graph;
  try {
    const packed = document.getElementById('architecture-data').textContent.trim();
    const binary = atob(packed);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    graph = JSON.parse(await new Response(stream).text());
  } catch (error) {
    status.textContent = '架构数据无法解压：' + (error instanceof Error ? error.message : String(error));
    diagram.dataset.layoutState = 'failed';
    diagram.setAttribute('aria-busy', 'false');
    throw error;
  }
  (${architectureBrowser.toString()})(graph,${selectArchitectureView.toString()},${architectureLayoutInput.toString()},${architectureViewport.toString()},${architectureMatrix.toString()},new ELK(),${conformanceBrowser.toString()},window.ArchitectureFlow);
})();`
}
