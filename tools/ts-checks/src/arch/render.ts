import { architectureBrowser } from './browser.ts'
import { selectArchitectureView, type ArchitectureView } from './view.ts'

export function architectureMarkup(graph: ArchitectureView): string {
  const data = JSON.stringify(graph)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
  return `<style>
button,select { font:inherit; color:inherit; background:var(--panel); border:1px solid var(--line); border-radius:5px; padding:5px 8px; }
button { cursor:pointer; } button:focus-visible,select:focus-visible { outline:3px solid var(--changed); }
[hidden] { display:none !important; }
.arch-nav { display:flex; gap:8px; margin-bottom:16px; }
.arch-toolbar { display:flex; flex-wrap:wrap; gap:12px; padding:12px 0; }
.arch-toolbar label { display:flex; align-items:center; gap:6px; }
.arch-toolbar select { max-width:420px; }
#arch-kinds { display:flex; flex-wrap:wrap; gap:8px 16px; }
#arch-overview { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin:16px 0; }
.arch-card { padding:18px; text-align:left; border-left:4px solid var(--changed); }
#arch-diagram { overflow:auto; max-height:65vh; border:1px solid var(--line); margin-top:12px; background:var(--panel); }
#arch-diagram svg { display:block; min-width:760px; width:100%; height:auto; }
#arch-diagram g[role=button] { cursor:pointer; }
.arch-edge { display:block; text-align:left; width:100%; margin:4px 0; overflow-wrap:anywhere; }
#arch-detail { padding:12px; border-left:4px solid var(--changed); background:var(--panel); overflow-wrap:anywhere; }
#arch-detail h3 { font-size:13px; } #arch-detail li,#arch-unknown li { overflow-wrap:anywhere; }
.arch-notice { padding:10px; border:1px solid var(--line); border-radius:6px; background:var(--panel); }
</style>
<nav class="arch-nav" aria-label="评审视图"><button id="arch-tab">架构视图</button><button id="metrics-tab">复杂度与风险</button></nav>
<section id="architecture-pane">
<h1>全局实际架构</h1>
<p id="arch-coordinate" class="meta mono"></p><p id="arch-counts"></p>
<p class="arch-notice">静态声明视图。目录聚合不表示运行、部署、事务或租户边界。服务/事件同名连接不证明实际绑定。装配条目是源码声明；确认配置选择与实际运行绑定：未观测。架构预期与规划：未提供。</p>
<div class="arch-toolbar">
<button id="arch-home">系统总览</button>
<label>目录组或应用 <select id="arch-group"></select></label>
<label>聚焦组件 <select id="arch-focus"></select></label>
<label><input id="arch-neighbors" type="checkbox" checked>显示邻接</label>
<label>变化范围 <select id="arch-changes"><option value="current">当前</option><option value="all">当前与已删除</option><option value="changed">新增与删除</option><option value="added">新增</option><option value="removed">删除</option></select></label>
<label><input id="arch-complexity" type="checkbox">叠加圈复杂度</label>
<label><input id="arch-coupling" type="checkbox">叠加耦合</label>
<button id="arch-export-svg">导出 SVG</button><button id="arch-export-json">导出 JSON</button>
</div>
<fieldset><legend>关系种类</legend><div id="arch-kinds"></div></fieldset>
<p class="legend">蓝框/蓝线＝新增；红色虚框/虚线＝BASE 已删除。类型导入和可选服务使用虚线。耦合入/出为全部当前静态关系的去重邻接数，不是运行调用量。</p>
<p id="arch-measurement" class="meta"></p><div id="arch-overview"></div>
<div id="arch-diagram"></div><div id="arch-relations"></div><div id="arch-detail"></div>
<details><summary>未知与未覆盖范围</summary><div id="arch-unknown"></div></details>
<details><summary>六问导航与尚未确认的边界</summary><div id="arch-guidance"></div></details>
</section>
<script type="application/json" id="architecture-data">${data}</script>`
}

export function architectureScript(): string {
  return `(${architectureBrowser.toString()})(${selectArchitectureView.toString()});`
}
