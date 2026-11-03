#!/usr/bin/env python3
"""把一个波段的波包、各线 spec.md 与 plan.md 合成一个可切换标签的页面。

用法：python3 tmp/skill-mcp-domain/waves/build-wave-doc.py w1
源文件是 Markdown，页面只是视图；改源文件后重跑并重发布。
"""
import html
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
wave = sys.argv[1] if len(sys.argv) > 1 else "w1"
W = HERE / wave
TABS = [
    ("pack", "波包", W / "wave-pack.md"),
    ("skill-spec", "Skill 实施规格", W / "skill" / "spec.md"),
    ("skill-plan", "Skill 交付方案", W / "skill" / "plan.md"),
    ("mcp-spec", "MCP 实施规格", W / "mcp" / "spec.md"),
    ("mcp-plan", "MCP 交付方案", W / "mcp" / "plan.md"),
    ("closure-skill", "闭包规格 · Skill", HERE.parent / "delegate" / "closures" / f"{wave}-skill-contract.md"),
    ("closure-mcp", "闭包规格 · MCP", HERE.parent / "delegate" / "closures" / f"{wave}-mcp-contract.md"),
]
docs = {tid: p.read_text(encoding="utf-8") for tid, _, p in TABS if p.exists()}
tabs = [(tid, label) for tid, label, p in TABS if p.exists()]
title = f"{wave.upper()} 实施方案与规格"

page = f"""<title>{html.escape(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@700&family=JetBrains+Mono:wght@400;500&display=swap">
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<style>
/* 布局：顶部一行标签切换文档，下面是单栏正文；表格与代码块各自横向滚动 */
:root{{--bg:#f6f7f5;--card:#fff;--ink:#1c2420;--muted:#5d6a64;--line:#d6ddd8;--accent:#2f6f5e;--accent2:#7a4a8c;
--display:"Noto Serif SC",serif;--body:"Noto Sans SC",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--bg:#121614;--card:#1a201d;--ink:#e1e8e4;--muted:#99a6a0;--line:#2c3531;--accent:#7cc4ad;--accent2:#c79ad8;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#121614;--card:#1a201d;--ink:#e1e8e4;--muted:#99a6a0;--line:#2c3531;--accent:#7cc4ad;--accent2:#c79ad8;color-scheme:dark}}
*{{box-sizing:border-box}}body{{background:var(--bg);color:var(--ink);font:15px/1.75 var(--body);margin:0}}
.wrap{{max-width:980px;margin:0 auto;padding-block:20px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}
header h1{{font-family:var(--display);font-size:1.7rem;margin:0 0 4px}}header p{{margin:0 0 14px;color:var(--muted);font-size:.88rem}}
nav{{display:flex;flex-wrap:wrap;gap:6px;position:sticky;top:env(safe-area-inset-top,0px);background:var(--bg);padding-block:8px;z-index:5;border-bottom:1px solid var(--line)}}
body::before{{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--bg)}}
nav a{{text-decoration:none;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:3px 12px;font-size:.85rem;background:var(--card)}}
nav a[aria-current="true"]{{color:var(--card);background:var(--accent);border-color:var(--accent)}}
nav a[href*="mcp"][aria-current="true"]{{background:var(--accent2);border-color:var(--accent2)}}
nav a:focus-visible{{outline:2px solid var(--accent);outline-offset:2px}}
article{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 22px 22px;margin-top:16px;min-width:0}}
article h1{{font-family:var(--display);font-size:1.45rem;text-wrap:balance}}article h2{{font-size:1.15rem;border-bottom:1px solid var(--line);padding-bottom:4px;margin-top:28px}}article h3{{font-size:1rem;margin-top:20px}}
article p,article li{{max-width:75ch}}code{{font-family:var(--mono);font-size:.84em;background:color-mix(in srgb,var(--line) 45%,transparent);padding:1px 4px;border-radius:3px;overflow-wrap:anywhere}}
pre{{overflow-x:auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px}}pre code{{background:none;padding:0}}
.tblwrap{{overflow-x:auto}}table{{border-collapse:collapse;font-size:.86rem;width:100%}}th,td{{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}}th{{background:color-mix(in srgb,var(--line) 40%,transparent)}}
blockquote{{margin:0;border-left:3px solid var(--line);padding-left:12px;color:var(--muted)}}
</style>
<div class="wrap">
<header><h1>{html.escape(title)}</h1><p>Skill 与 MCP 两条线 · 源文件在父工作树 <code>tmp/skill-mcp-domain/waves/{wave}/</code> 与 <code>delegate/closures/</code> · 页面由 <code>build-wave-doc.py</code> 生成</p></header>
<nav>{"".join(f'<a href="#{tid}" data-tab="{tid}">{html.escape(label)}</a>' for tid, label in tabs)}</nav>
<article id="doc"></article>
</div>
<script>
const DOCS = {json.dumps(docs, ensure_ascii=False)};
const FIRST = {json.dumps(tabs[0][0])};
function show() {{
  const id = (location.hash || '').slice(1);
  const tab = DOCS[id] !== undefined ? id : FIRST;
  const el = document.getElementById('doc');
  el.innerHTML = window.marked ? marked.parse(DOCS[tab]) : '<pre>' + DOCS[tab].replace(/[&<]/g, c => c === '&' ? '&amp;' : '&lt;') + '</pre>';
  el.querySelectorAll('table').forEach(t => {{ const w = document.createElement('div'); w.className = 'tblwrap'; t.replaceWith(w); w.appendChild(t); }});
  el.querySelectorAll('a[href]').forEach(a => {{ if (!/^https?:/.test(a.getAttribute('href'))) a.replaceWith(document.createTextNode(a.textContent)); }});
  document.querySelectorAll('nav a').forEach(a => a.setAttribute('aria-current', String(a.dataset.tab === tab)));
}}
window.addEventListener('hashchange', () => {{ show(); window.scrollTo(0, 0); }});
show();
</script>
"""
out = W / "doc.html"
out.write_text(page, encoding="utf-8")
print(out)
