/** Styling of the React island. Colors follow the page tokens so dark mode needs no second palette. */
export const FLOW_STYLE = `
.arch-flow { position:absolute; inset:0; }
.arch-flow .react-flow { background:var(--canvas); --xy-background-pattern-dots-color-default: rgba(120,128,140,.35); }
.arch-flow .react-flow__node { width:270px; height:100px; }
.arch-flow .react-flow__node:focus, .arch-flow .react-flow__node:focus-visible { outline:none; }
.arch-node { box-sizing:border-box; width:270px; height:100px; padding:10px 14px 9px; border-radius:6px;
  background:var(--panel); color:var(--fg); border:1px solid var(--line); display:flex; flex-direction:column; gap:2px;
  position:relative; overflow:hidden; font-size:12px; line-height:1.45; transition:border-color .12s ease; }
.arch-node-service { border-color:color-mix(in srgb, #4c7bd9 55%, var(--line)); }
.arch-node-event { border-color:color-mix(in srgb, #9b5de5 50%, var(--line)); }
.arch-node-external { border-style:dashed; color:var(--muted); }
.arch-node { cursor:pointer; }
.arch-node-inert { cursor:default; }
.arch-band-green { box-shadow:inset 0 3px 0 var(--good); }
.arch-band-yellow { box-shadow:inset 0 3px 0 var(--mid); }
.arch-band-red { box-shadow:inset 0 3px 0 var(--bad); }
.arch-node-added { border-color:var(--changed); border-width:2px; padding:9px 13px 8px; }
.arch-node-removed { border-style:dashed; border-color:var(--bad); }
.arch-flow .react-flow__node:hover .arch-node:not(.arch-node-inert) { border-color:color-mix(in srgb, var(--fg) 45%, var(--line)); }
.arch-node-focused, .arch-flow .react-flow__node.selected .arch-node, .arch-flow .react-flow__node:focus-visible .arch-node { outline:2px solid var(--changed); outline-offset:1px; }
.arch-node-kind { display:flex; align-items:baseline; gap:8px; font-size:10.5px; color:var(--muted); min-height:15px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; letter-spacing:.02em; white-space:nowrap; }
.arch-node-kind-text { overflow:hidden; text-overflow:ellipsis; }
.arch-node-change { margin-left:auto; color:var(--changed); font-weight:600; }
.arch-node-removed .arch-node-change { color:var(--bad); }
.arch-node-deviation { margin-left:auto; color:#ad6100; font-weight:600; }
.arch-node-deviation::before { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:#ad6100; margin-right:5px; vertical-align:1px; }
.arch-node-change + .arch-node-deviation { margin-left:0; }
.arch-node-title { font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.arch-node-external .arch-node-title { font-weight:500; }
.arch-node-meta { margin-top:auto; font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-height:15px; }
.arch-node-meta span + span::before { content:' · '; }
.arch-handle { opacity:0; width:1px; height:1px; min-width:0; min-height:0; border:0; pointer-events:none; }
.arch-flow .react-flow__edge-path { transition:stroke-width .12s ease; }
.arch-flow .react-flow__edge:hover .react-flow__edge-path, .arch-flow .react-flow__edge.selected .react-flow__edge-path, .arch-flow .react-flow__edge:focus-visible .react-flow__edge-path { stroke:var(--changed) !important; stroke-width:3 !important; }
.arch-flow .react-flow__edge:focus, .arch-flow .react-flow__edge:focus-visible { outline:none; }
.arch-edge-label { position:absolute; font-size:11px; color:var(--muted); background:var(--canvas); border-radius:2px; padding:0 4px; white-space:nowrap; }
.arch-flow .react-flow__minimap { background:var(--panel); border:1px solid var(--line); border-radius:8px; }
.arch-flow .react-flow__minimap-mask { fill:color-mix(in srgb, var(--fg) 8%, transparent); }
.arch-flow .react-flow__attribution { background:transparent; color:var(--muted); }
`
