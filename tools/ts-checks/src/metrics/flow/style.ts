/** 结构图岛的样式。颜色取页面 token，深浅色跟随系统设置，不另配一套。 */
export const STRUCTURE_STYLE = `
/* 侧栏占满右列，与工具栏、画布、底栏三行等高；左列自上而下是这三行。 */
.structure-frame { margin-top:4px; border:1px solid var(--line); border-radius:var(--r-panel); overflow:hidden; background:var(--panel);
  display:grid; grid-template-columns:minmax(0,1fr) 360px; grid-template-rows:auto minmax(460px,62vh) auto; }
.structure-frame > .structure-bar, .structure-frame > #structure, .structure-frame > .structure-foot { grid-column:1; }
.structure-bar { display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; padding:8px 12px 8px 16px; border-bottom:1px solid var(--line); font-size:12.5px; color:var(--muted); }
.structure-bar .spacer { flex:1; }
.structure-bar button { height:28px; padding:0 10px; font-size:12.5px; }
.structure-bar label { display:flex; align-items:center; gap:8px; color:var(--fg); cursor:pointer; }
#structure { position:relative; min-width:0; background:var(--canvas); }
/* contain:size：侧栏内容再长也不撑高网格行，只在侧栏里滚动。 */
.structure-side { grid-column:2; grid-row:1 / -1; contain:size; min-width:0; overflow:auto; padding:18px 20px; border-left:1px solid var(--line); font-size:12.5px; line-height:1.65; overflow-wrap:anywhere; }
.structure-side h3 { font-size:14px; margin:0 0 6px; }
.structure-side h4 { font-size:12.5px; font-weight:600; margin:18px 0 6px; padding-top:14px; border-top:1px solid var(--line); }
.structure-side p { margin:6px 0; }
.structure-side ul.plain { padding-left:16px; }
.structure-side ul.plain ul { font-size:11.5px; color:var(--muted); }
@media (max-width:900px) { .structure-frame { display:block; } #structure { height:62vh; min-height:420px; } .structure-side { contain:none; border-left:0; border-top:1px solid var(--line); max-height:420px; } }
.structure-foot { padding:8px 16px; border-top:1px solid var(--line); font-size:12px; color:var(--muted); }
.structure-flow { position:absolute; inset:0; }
.structure-flow .react-flow { background:var(--canvas); --xy-background-pattern-dots-color-default: rgba(120,128,140,.3); }
.structure-flow .react-flow__node { cursor:default; }
.structure-flow .react-flow__node-member { cursor:pointer; }
.structure-flow .react-flow__node:focus, .structure-flow .react-flow__node:focus-visible { outline:none; }
.structure-layer { box-sizing:border-box; width:100%; height:100%; border:1px dashed color-mix(in srgb, var(--fg) 22%, var(--line)); border-radius:10px;
  background:color-mix(in srgb, var(--fg) 3%, transparent); }
.structure-layer-unplaced { border-color:var(--bad); }
.structure-layer-label { position:absolute; top:12px; left:16px; font-size:12px; color:var(--muted); letter-spacing:.02em; }
.structure-layer-unplaced .structure-layer-label { color:var(--bad); }
.structure-group { box-sizing:border-box; width:100%; height:100%; border:1px solid var(--line); border-left-width:4px; border-radius:8px;
  background:color-mix(in srgb, var(--panel) 88%, transparent); display:flex; align-items:baseline; gap:8px; padding:14px 20px 0 20px; }
.structure-group-name { font-size:12px; color:var(--fg); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.structure-group-risk { margin-left:auto; font-size:11px; color:var(--muted); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
.structure-card { box-sizing:border-box; width:100%; height:100%; padding:7px 10px 6px; border:1px solid; border-radius:6px; color:var(--fg);
  display:flex; flex-direction:column; justify-content:space-between; font-size:12px; line-height:1.35; }
.structure-card-nodata { background:var(--nodata); border-color:var(--muted); border-style:dashed; }
.structure-card-changed { border-width:3px; padding:5px 8px 4px; }
.structure-card-changed .structure-card-name { font-weight:700; }
.structure-flow .react-flow__node-member:hover .structure-card { box-shadow:0 0 0 2px color-mix(in srgb, var(--fg) 30%, transparent); }
.structure-card-selected { outline:3px solid var(--changed); outline-offset:1px; }
.structure-card-name { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.structure-card-meta { display:flex; align-items:baseline; gap:6px; font-size:11px; white-space:nowrap; }
.structure-card-score, .structure-card-empty { color:var(--muted); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
.structure-card-delta { color:var(--bad); font-weight:700; }
.structure-card-links { margin-left:auto; display:flex; gap:4px; }
.structure-link { padding:0 4px; border-radius:3px; border:1px solid color-mix(in srgb, var(--fg) 25%, transparent); color:var(--muted); font-size:10px; }
.structure-link-bad { border-color:var(--bad); color:var(--bad); }
.structure-link-except { border-color:var(--except); color:var(--except); }
.structure-link-changed { border-color:var(--changed); color:var(--changed); }
.structure-card { transition:box-shadow .12s ease, opacity .15s cubic-bezier(.23,1,.32,1); }
.structure-card-muted { opacity:.35; }
.structure-flow .react-flow__edge-path { transition:opacity .15s cubic-bezier(.23,1,.32,1), stroke-width .15s ease; }
.structure-edge-muted .react-flow__edge-path { opacity:.15; }
.structure-flow-dot { pointer-events:none; }
@media (prefers-reduced-motion: reduce) { .structure-flow-dot { display:none; } .structure-card, .structure-flow .react-flow__edge-path { transition:none; } }
.structure-handle { opacity:0; width:1px; height:1px; min-width:0; min-height:0; border:0; pointer-events:none; }
.structure-flow .react-flow__minimap { background:var(--panel); border:1px solid var(--line); border-radius:8px; }
.structure-flow .react-flow__minimap-mask { fill:color-mix(in srgb, var(--fg) 8%, transparent); }
.structure-flow .react-flow__attribution { background:transparent; color:var(--muted); }
`
