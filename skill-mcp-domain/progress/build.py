#!/usr/bin/env python3
"""Skill 与 MCP 交付进展页：progress.json → progress.html。只用标准库。

用法（父工作树根）：python3 tmp/skill-mcp-domain/progress/build.py
状态只取枚举值，遇到枚举外的值报错退出。判据只有带证据链接时才能是 met。
"""
import html
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
CLOSURE_STATES = {"待派", "进行中", "待评审", "修复中", "待合入", "已合入", "受阻", "已丢弃"}
CRITERION_STATES = {"open", "partial", "met", "deferred"}
WAVE_STATES = {"预案", "准备中", "进行中", "波末核对", "已放行"}
UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def fail(msg):
    sys.exit(f"progress.json 无效：{msg}")


def check(data):
    if not UTC.match(data.get("updatedAt", "")):
        fail("updatedAt 必须是 UTC ISO")
    for w in data["waves"]:
        if w["state"] not in WAVE_STATES:
            fail(f"波 {w['id']} 状态 {w['state']}")
        for c in w.get("closures", []):
            if c["state"] not in CLOSURE_STATES:
                fail(f"闭包 {c['id']} 状态 {c['state']}")
        for k in w.get("criteria", []):
            if k["state"] not in CRITERION_STATES:
                fail(f"判据 {k['id']} 状态 {k['state']}")
            if k["state"] == "met" and not k.get("evidence"):
                fail(f"判据 {k['id']} 标为 met 但没有证据链接")


def e(value):
    return html.escape(str(value))


def link(item):
    url, text = item.get("url"), item.get("text", item.get("url", ""))
    return f'<a href="{e(url)}">{e(text)}</a>' if url else e(text)


def build(data):
    check(data)
    pending = [d for d in data.get("decisions", []) if d.get("status") != "answered"]
    current = next((w for w in data["waves"] if w["state"] in {"准备中", "进行中", "波末核对"}), data["waves"][0])
    closures = current.get("closures", [])
    merged = sum(1 for c in closures if c["state"] == "已合入")
    met = sum(1 for k in current.get("criteria", []) if k["state"] == "met")
    total_k = len(current.get("criteria", []))
    bar = lambda n, d: ("■" * (10 * n // d) + "□" * (10 - 10 * n // d)) if d else "□" * 10

    rows = "".join(
        f'<tr><td><code>{e(c["id"])}</code></td><td><span class="line {e(c["line"])}">{e(c["line"])}</span></td>'
        f'<td><span class="st s-{e(c["state"])}">{e(c["state"])}</span></td><td>{e(c.get("round", ""))}</td>'
        f'<td>{e(c.get("note", ""))}</td><td>{" ".join(link(x) for x in c.get("links", []))}</td></tr>'
        for c in closures
    )
    crit = "".join(
        f'<tr><td><code>{e(k["id"])}</code></td><td>{e(k["text"])}</td><td><span class="k k-{e(k["state"])}">{e(k["state"])}</span></td>'
        f'<td>{" ".join(link(x) for x in k.get("evidence", []))}</td></tr>'
        for k in current.get("criteria", [])
    )
    waves = "".join(
        f'<li class="w-{e(w["state"])}"><strong>{e(w["id"])}</strong> {e(w["title"])} <span class="muted">· {e(w["state"])}</span></li>'
        for w in data["waves"]
    )
    decisions = (
        "".join(f'<li><strong>{e(d["question"])}</strong><br><span class="muted">{e(d.get("context", ""))}</span></li>' for d in pending)
        if pending
        else '<li class="muted">没有需要你决定的事项。</li>'
    )
    log = "".join(f'<li><span class="muted">{e(x["at"])}</span> {e(x["text"])}</li>' for x in reversed(data.get("log", [])[-12:]))
    links = " · ".join(link(x) for x in data.get("links", []))

    return f"""<title>Skill 与 MCP 交付进展</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* 布局：顶部是新鲜度与待决定事项，其次当前波的闭包表与判据表，右侧波段与最近动态 */
:root{{--bg:#f5f6f4;--card:#fff;--ink:#1d2421;--muted:#5f6b66;--line:#d7ddd9;--skill:#2f6f5e;--mcp:#7a4a8c;--reduce:#8a6a1f;--ok:#2f7a3d;--warn:#9a6b00;--bad:#b23a2e;
--body:"Noto Sans SC",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--bg:#121614;--card:#1a201d;--ink:#e1e8e4;--muted:#99a6a0;--line:#2c3531;--skill:#7cc4ad;--mcp:#c79ad8;--reduce:#d8b765;--ok:#7fcf8c;--warn:#e0b44c;--bad:#ef8a7e;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#121614;--card:#1a201d;--ink:#e1e8e4;--muted:#99a6a0;--line:#2c3531;--skill:#7cc4ad;--mcp:#c79ad8;--reduce:#d8b765;--ok:#7fcf8c;--warn:#e0b44c;--bad:#ef8a7e;color-scheme:dark}}
*{{box-sizing:border-box}}body{{background:var(--bg);color:var(--ink);font:15px/1.65 var(--body);margin:0}}
.wrap{{max-width:1120px;margin:0 auto;padding-block:24px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:22px}}
h1{{font-size:1.7rem;margin:0}}h2{{font-size:1.1rem;margin:0 0 8px}}code{{font-family:var(--mono);font-size:.84em}}.muted{{color:var(--muted)}}
a{{color:inherit}}
.fresh{{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;font-size:.88rem;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card)}}
.fresh.stale-y{{border-color:var(--warn);background:color-mix(in srgb,var(--warn) 12%,var(--card))}}.fresh.stale-r{{border-color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,var(--card))}}
.grid{{display:grid;grid-template-columns:minmax(0,2.2fr) minmax(0,1fr);gap:18px}}@media (max-width:820px){{.grid{{grid-template-columns:1fr}}}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-width:0}}
.decide{{border-left:4px solid var(--warn)}}.decide ul{{margin:0;padding-left:18px}}
.bar{{font-family:var(--mono);letter-spacing:1px}}
.tbl{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;font-size:.86rem}}th,td{{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}}th{{color:var(--muted);font-weight:500}}
.line{{font-size:.75rem;padding:1px 7px;border-radius:999px;border:1px solid}}.line.Skill{{color:var(--skill)}}.line.MCP{{color:var(--mcp)}}.line.Reduce{{color:var(--reduce)}}
.st,.k{{font-size:.78rem;padding:1px 8px;border-radius:999px;white-space:nowrap;background:color-mix(in srgb,var(--muted) 15%,transparent)}}
.s-已合入,.k-met{{background:color-mix(in srgb,var(--ok) 20%,transparent);color:var(--ok)}}.s-进行中,.s-待评审,.s-修复中,.s-待合入,.k-partial{{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}}.s-受阻{{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}}
ul.plain{{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:.88rem}}
</style>
<div class="wrap">
<header><h1>Skill 与 MCP 交付进展</h1><div class="muted">父分支 <code>PanQiWei/skill-mcp</code> @ <code>{e(data.get("head", ""))}</code> · {links}</div></header>
<div class="fresh" id="fresh" data-updated="{e(data["updatedAt"])}"><span>更新于 <code>{e(data["updatedAt"])}</code></span><span id="age" class="muted"></span>
<span>当前波 <strong>{e(current["id"])}</strong> {e(current["state"])}</span>
<span>闭包 <span class="bar">{bar(merged, len(closures))}</span> {merged}/{len(closures)} 已合入</span>
<span>判据 <span class="bar">{bar(met, total_k)}</span> {met}/{total_k} 有证据</span></div>
<section class="card decide"><h2>待你决定</h2><ul>{decisions}</ul></section>
<div class="grid">
<div style="display:flex;flex-direction:column;gap:18px;min-width:0">
<section class="card"><h2>{e(current["id"])} 闭包</h2><div class="tbl"><table><thead><tr><th>闭包</th><th>线</th><th>状态</th><th>轮次</th><th>说明</th><th>链接</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section class="card"><h2>{e(current["id"])} 判据</h2><div class="tbl"><table><thead><tr><th>ID</th><th>判据</th><th>状态</th><th>证据</th></tr></thead><tbody>{crit}</tbody></table></div></section>
</div>
<div style="display:flex;flex-direction:column;gap:18px;min-width:0">
<section class="card"><h2>波段</h2><ul class="plain">{waves}</ul></section>
<section class="card"><h2>最近动态</h2><ul class="plain">{log}</ul></section>
</div></div></div>
<script>
(function(){{var el=document.getElementById('fresh');var t=Date.parse(el.dataset.updated);if(isNaN(t))return;var m=Math.floor((Date.now()-t)/60000);
document.getElementById('age').textContent=m<1?'刚刚':m+' 分钟前';if(m>30)el.classList.add('stale-r');else if(m>10)el.classList.add('stale-y');}})();
</script>
"""


data = json.loads((HERE / "progress.json").read_text(encoding="utf-8"))
(HERE / "progress.html").write_text(build(data), encoding="utf-8")
print("progress.html 已生成")
