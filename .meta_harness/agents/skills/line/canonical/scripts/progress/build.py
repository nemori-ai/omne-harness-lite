"""线波段进展页生成器（v1）。用法: python build.py <progress.json> [--out progress.html]
只用标准库。校验失败退出 2 并指出字段。数据格式见 ../../references/wave-progress.md。"""
import datetime as dt
import html
import json
import pathlib
import sys

DELIV = {'not-started': ('未开始', 'mut'), 'in-progress': ('进行中', 'run'), 'review': ('待评审', 'rev'),
         'merged': ('已合入父分支', 'ok'), 'blocked': ('阻塞', 'bad'), 'deferred': ('移出本波', 'mut')}
CLOS = {'planned': ('计划', 'mut'), 'running': ('进行中', 'run'), 'review': ('评审中', 'rev'),
        'fixing': ('修复中', 'warn'), 'merged': ('已合入', 'ok'), 'blocked': ('阻塞', 'bad'), 'dropped': ('撤销', 'mut')}
CRIT = {'met': ('有证据', 'ok'), 'partial': ('部分', 'warn'), 'open': ('未完成', 'mut'),
        'deferred': ('移出本波', 'mut'), 'na': ('不适用', 'mut')}
AXIS = {'scope': '范围', 'direction': '方向', 'progress': '进度', 'quality': '质量', 'stuck': '卡住', 'resource': '资源'}
REQ = ['docs', 'schemaVersion', 'line', 'lineName', 'wave', 'parentCard', 'branch', 'head', 'attempt', 'updatedAt',
       'summary', 'productValue', 'eta', 'deliverables', 'closures', 'deviations', 'asks', 'resources']


class Bad(Exception):
    pass


def check(d):
    for k in REQ:
        if k not in d:
            raise Bad(f'缺字段 {k}')
    if d['schemaVersion'] != 1:
        raise Bad('schemaVersion 应为 1')
    parse_t(d['updatedAt'], 'updatedAt')
    pv = d['productValue']
    if not pv.get('headline') or not pv.get('increments'):
        raise Bad('productValue 需要 headline 与至少一条 increments')
    for i, x in enumerate(pv['increments']):
        if not x.get('who') or not x.get('canNow'):
            raise Bad(f'productValue.increments[{i}] 需要 who 与 canNow')
    if d['eta'].get('confidence') not in ('高', '中', '低'):
        raise Bad('eta.confidence 应为 高/中/低')
    for i, x in enumerate(d['deliverables']):
        if x.get('status') not in DELIV:
            raise Bad(f'deliverables[{i}].status={x.get("status")!r} 不在 {list(DELIV)}')
        for j, c in enumerate(x.get('criteria', [])):
            if c.get('state') not in CRIT:
                raise Bad(f'deliverables[{i}].criteria[{j}].state={c.get("state")!r}')
            if c['state'] == 'met' and not c.get('evidence'):
                raise Bad(f'deliverables[{i}].criteria[{j}] 标 met 但没有证据')
    names = [pathlib.Path(x.get('path', '')).name for x in d.get('docs', [])]
    for need in ('spec.md', 'plan.md'):
        if need not in names:
            raise Bad(f'docs 必须登记本波 {need}')
    ids = {c.get('id') for c in d['closures']}
    for i, c in enumerate(d['closures']):
        if c.get('status') not in CLOS:
            raise Bad(f'closures[{i}].status={c.get("status")!r} 不在 {list(CLOS)}')
        for dep in c.get('deps', []):
            if dep not in ids:
                raise Bad(f'closures[{i}].deps 指向不存在的闭包 {dep}')
    for i, x in enumerate(d['deviations']):
        if x.get('axis') not in AXIS or x.get('level') not in ('warn', 'bad'):
            raise Bad(f'deviations[{i}] 的 axis/level 不合法')
    for i, a in enumerate(d['asks']):
        if a.get('status') not in ('open', 'answered'):
            raise Bad(f'asks[{i}].status 应为 open/answered')


def parse_t(s, where=''):
    try:
        return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception:
        raise Bad(f'{where} 不是 UTC ISO 时间：{s!r}')


def now():
    return dt.datetime.now(dt.timezone.utc)


def mins(t):
    return int((now() - parse_t(t)).total_seconds() // 60) if t else None


e = html.escape


def link(label, url):
    return f'<a href="{e(url)}" target="_blank">{e(label)}</a>' if url else e(label)


def chip(text, cls):
    return f'<span class="chip {cls}">{e(text)}</span>'


def dag_svg(closures):
    """按依赖分层的闭包图：同层从上到下，边从依赖指向使用方。"""
    byid = {c['id']: c for c in closures}
    level = {}

    def lv(cid, seen=()):
        if cid in level:
            return level[cid]
        deps = [d for d in byid[cid].get('deps', []) if d not in seen]
        level[cid] = 0 if not deps else 1 + max(lv(d, seen + (cid,)) for d in deps)
        return level[cid]
    for c in closures:
        lv(c['id'])
    cols = {}
    for c in closures:
        cols.setdefault(level[c['id']], []).append(c)
    W, H, GX, GY = 150, 44, 60, 16
    pos = {}
    for x, col in sorted(cols.items()):
        for y, c in enumerate(col):
            pos[c['id']] = (20 + x * (W + GX), 20 + y * (H + GY))
    width = 40 + (max(cols) + 1) * (W + GX) if cols else 200
    height = 40 + max(len(v) for v in cols.values()) * (H + GY) if cols else 80
    out = [f'<svg viewBox="0 0 {width} {height}" class="dag" role="img" aria-label="闭包依赖图">',
           '<defs><marker id="ar" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
           '<path d="M0,0 L10,5 L0,10 z" class="arrow"/></marker></defs>']
    for c in closures:
        for d in c.get('deps', []):
            (x1, y1), (x2, y2) = pos[d], pos[c['id']]
            out.append(f'<line x1="{x1 + W}" y1="{y1 + H / 2}" x2="{x2}" y2="{y2 + H / 2}" class="edge" marker-end="url(#ar)"/>')
    for c in closures:
        x, y = pos[c['id']]
        label, cls = CLOS[c['status']]
        crit = ' crit' if c.get('critical') else ''
        out.append(f'<g class="node {cls}{crit}"><rect x="{x}" y="{y}" width="{W}" height="{H}" rx="7"/>'
                   f'<text x="{x + 8}" y="{y + 18}" class="nid">{e(c["id"])}</text>'
                   f'<text x="{x + 8}" y="{y + 35}" class="nst">{e(label)}</text></g>')
    out.append('</svg>')
    return ''.join(out)


def md(text):
    """最小 Markdown 渲染：标题、段落、无序/有序列表、表格、代码块、行内代码、粗体、链接。不依赖外网。"""
    import re
    out, lines, i = [], text.replace('\r', '').split('\n'), 0

    def inline(t):
        t = e(t)
        t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
        t = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', t)
        t = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2" target="_blank">\1</a>', t)
        return t
    while i < len(lines):
        ln = lines[i]
        if ln.startswith('```'):
            j = i + 1
            while j < len(lines) and not lines[j].startswith('```'):
                j += 1
            out.append('<pre><code>' + e('\n'.join(lines[i + 1:j])) + '</code></pre>')
            i = j + 1
            continue
        m = re.match(r'^(#{1,6})\s+(.*)', ln)
        if m:
            lvl = min(6, len(m.group(1)) + 2)
            out.append(f'<h{lvl}>{inline(m.group(2))}</h{lvl}>')
            i += 1
            continue
        if ln.lstrip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i + 1]):
            head = [c.strip() for c in ln.strip().strip('|').split('|')]
            rows, j = [], i + 2
            while j < len(lines) and lines[j].lstrip().startswith('|'):
                rows.append([c.strip() for c in lines[j].strip().strip('|').split('|')])
                j += 1
            out.append('<table><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr>'
                       + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in rows) + '</table>')
            i = j
            continue
        if re.match(r'^\s*([-*]|\d+\.)\s+', ln):
            tag = 'ol' if re.match(r'^\s*\d+\.', ln) else 'ul'
            items, j = [], i
            while j < len(lines) and re.match(r'^\s*([-*]|\d+\.)\s+', lines[j]):
                items.append(re.sub(r'^\s*([-*]|\d+\.)\s+', '', lines[j]))
                j += 1
            out.append(f'<{tag}>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + f'</{tag}>')
            i = j
            continue
        if ln.strip():
            para, j = [ln], i + 1
            while j < len(lines) and lines[j].strip() and not re.match(r'^(#|```|\s*\||\s*([-*]|\d+\.)\s)', lines[j]):
                para.append(lines[j])
                j += 1
            out.append('<p>' + inline(' '.join(para)) + '</p>')
            i = j
            continue
        i += 1
    return '\n'.join(out)


def load_docs(d, path):
    """docs[].path 相对仓库根（progress.json 在 <根>/tmp/line-<线>/ 下）；也接受绝对路径。"""
    root = path.resolve().parents[2]
    res = []
    for k, x in enumerate(d.get('docs', [])):
        p = pathlib.Path(x['path'])
        f = p if p.is_absolute() else root / p
        body = f.read_text(encoding='utf-8') if f.exists() else None
        res.append({'id': f'doc-{k}', 'label': x.get('label') or p.name, 'path': x['path'], 'file': f, 'body': body})
    return res


def flow_rows(path):
    f = path.parent / 'delegate' / 'flow.jsonl'
    if not f.exists():
        return []
    rows = []
    for line in f.read_text(encoding='utf-8').splitlines():
        try:
            rows.append(json.loads(line))
        except Exception:
            pass
    return rows


def render(d, path):
    age = mins(d['updatedAt'])
    agecls = 'ok' if age is not None and age <= 10 else ('warn' if age is not None and age <= 30 else 'bad')
    crit = [c for x in d['deliverables'] for c in x.get('criteria', []) if c['state'] != 'na']
    met = sum(1 for c in crit if c['state'] == 'met')
    pct = int(100 * met / len(crit)) if crit else 0
    eta = d['eta']
    left = None
    if eta.get('deliverAt'):
        left = int((parse_t(eta['deliverAt']) - now()).total_seconds() // 60)
    asks = [a for a in d['asks'] if a['status'] == 'open']
    dev = d['deviations']
    res = d['resources']
    over = res.get('heavyNow', 0) > res.get('cap', 3)

    strip = ''.join(f'<div class="dl {DELIV[x["status"]][1]}"><b>{e(x["id"])}</b> {e(x["title"])}'
                    f'<div class="sub">{DELIV[x["status"]][0]} · {x.get("risk", "")} · '
                    f'{sum(1 for c in x.get("criteria", []) if c["state"] == "met")}/{len([c for c in x.get("criteria", []) if c["state"] != "na"])}</div></div>'
                    for x in d['deliverables'])

    attn = []
    for a in asks:
        attn.append(f'<li class="ask">{chip("第" + str(a.get("layer", "?")) + "层", "rev")} 交 <b>{e(a["to"])}</b>：'
                    f'{link(a["what"], a.get("link"))} <span class="mut">（{mins(a.get("since")) or "?"} 分钟）</span></li>')
    for x in dev:
        attn.append(f'<li>{chip(AXIS[x["axis"]], x["level"])} {e(x["text"])}</li>')
    if over:
        attn.append(f'<li>{chip("资源", "bad")} 重活 {res["heavyNow"]} 个，超过上限 {res.get("cap", 3)}</li>')
    attn_html = ''.join(attn) or '<li class="mut">没有待处理事项，也没有偏差信号</li>'

    cp = eta.get('criticalPath', [])
    total = sum(max(1, s.get('minutes', 1)) for s in cp) or 1
    bar = ''.join(f'<div class="seg {"done" if s.get("doneAt") else ""}" style="flex:{max(1, s.get("minutes", 1))}" '
                  f'title="{e(s["item"])} {s.get("minutes", "?")} 分钟">{e(s["item"])}<small>{s.get("minutes", "?")}′</small></div>'
                  for s in cp)

    crow = []
    for c in d['closures']:
        w = c.get('writer') or {}
        f = c.get('facts') or {}
        last = f.get('lastWriteMin')
        stale = ' class="bad"' if c['status'] == 'running' and isinstance(last, int) and last > 20 else ''
        crow.append(f'<tr><td><b>{e(c["id"])}</b>{" ★" if c.get("critical") else ""}<div class="sub">{e(c.get("title", ""))}</div></td>'
                    f'<td>{chip(*CLOS[c["status"]])}</td><td>{e(w.get("role", ""))}<div class="sub">{e(w.get("model", ""))} @ {e(w.get("effort", ""))}</div></td>'
                    f'<td>{c.get("rounds", 1)} 轮 / 追加 {c.get("additions", 0)}</td>'
                    f'<td{stale}>{f.get("commits", "—")} 提交 · {f.get("changed", "—")} 改动 · '
                    f'{("最近写入 " + str(last) + " 分钟前") if last is not None else "—"}<div class="sub">{e(f.get("head", ""))}</div></td>'
                    f'<td>{e(c.get("host", ""))}</td></tr>')

    drow = []
    for x in d['deliverables']:
        for c in x.get('criteria', []):
            ev = '、'.join(link(v.get('label', '证据'), v.get('url')) for v in c.get('evidence', [])) or '—'
            drow.append(f'<tr><td>{e(x["id"])}</td><td>{e(c["text"])}{("<div class=sub>" + e(c["note"]) + "</div>") if c.get("note") else ""}</td>'
                        f'<td>{chip(*CRIT[c["state"]])}</td><td>{ev}</td></tr>')

    arch = ''.join(f'<div class="ba"><h4>{e(a["id"])} {e(a.get("title", ""))}</h4><div class="cols">'
                   f'<div><b>交付前</b><p>{e(a.get("before", ""))}</p></div><div><b>交付后</b><p>{e(a.get("after", ""))}</p></div></div>'
                   f'{("<p class=sub>仍留下：" + e(a["left"]) + "</p>") if a.get("left") else ""}</div>'
                   for a in d.get('architecture', []))

    pv = d['productValue']
    inc = ''.join(f'<tr><td>{e(x["who"])}</td><td><b>{e(x["canNow"])}</b></td><td class="mut">{e(x.get("before", ""))}</td>'
                  f'<td>{chip(*DELIV.get(x.get("status", "not-started"), DELIV["not-started"]))}</td></tr>' for x in pv['increments'])
    notyet = ''.join(f'<li>{e(x)}</li>' for x in pv.get('notYet', []))
    pv_html = (f'<div class="pv"><p class="headline">{e(pv["headline"])}</p>'
               f'{("<p>" + e(pv["why"]) + "</p>") if pv.get("why") else ""}'
               f'<table><tr><th>谁</th><th>本波交付后能做到</th><th>之前</th><th>进度</th></tr>{inc}</table>'
               f'{("<p class=sub><b>本波还做不到</b>（之后哪一波补上写在括号里）：</p><ul class=sub>" + notyet + "</ul>") if notyet else ""}</div>')

    rows = flow_rows(path)
    roles = {}
    for r in rows:
        k = (r.get('role', '?'), str(r.get('requested', r.get('model', '?'))))
        roles.setdefault(k, {'n': 0, 'esc': 0})
        roles[k]['n'] += 1
        roles[k]['esc'] += 1 if r.get('escalation') else 0
    for c in d['closures']:
        w = c.get('writer') or {}
        k = (w.get('role', '?'), f'{w.get("model", "?")}@{w.get("effort", "?")}')
        roles.setdefault(k, {'n': 0, 'esc': 0})
    role_html = ''.join(f'<tr><td>{e(k[0])}</td><td>{e(k[1])}</td><td>{v["n"]}</td><td>{v["esc"]}</td></tr>'
                        for k, v in sorted(roles.items()))

    dec = ''.join(f'<li>{chip("第" + str(x.get("layer", "?")) + "层", "mut")} {link(x["id"] + " " + x.get("title", ""), x.get("link"))}</li>'
                  for x in d.get('decisions', []))
    dl = load_docs(d, path)
    nav = ''.join(f'<a href="#{x["id"]}">{e(x["label"])}</a>' for x in dl)
    docs = ''.join(f'<details id="{x["id"]}" class="doc"{" open" if k == 0 else ""}><summary><b>{e(x["label"])}</b> '
                   f'<code>{e(x["path"])}</code> <a href="{x["file"].as_uri()}" target="_blank">原文件</a></summary>'
                   + (f'<div class="md">{md(x["body"])}</div>' if x['body'] is not None else '<p class="badt">文件不存在</p>')
                   + '</details>' for k, x in enumerate(dl))
    tl = ''.join(f'<li><span class="mut">{e(x["at"][11:16])}Z</span> {e(x["event"])}</li>' for x in d.get('timeline', [])[:20])
    card = f'https://github.com/nemori-ai/omne-harness-lite/issues/{d["parentCard"]}'
    eta_txt = (f'{e(eta.get("deliverAt", "?")[5:16].replace("T", " "))}Z 交付'
               + (f'（还剩约 {left // 60} 小时 {left % 60} 分）' if left is not None and left > 0 else (' <b class="badt">已超时</b>' if left is not None else '')))

    return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(d["lineName"])} 波 {d["wave"]} 进展</title>
<script>setTimeout(function(){{var u=location.href.split("?")[0];location.replace(u+"?t="+Date.now())}},60000)</script>
<style>
:root{{--bg:#f6f6f3;--fg:#1d1d1b;--mut:#77766f;--line:#d9d8d2;--card:#fff;--ok:#2f7d4a;--run:#1f5fbf;--rev:#7a4cc2;--warn:#b26a00;--bad:#c62828}}
@media (prefers-color-scheme:dark){{:root{{--bg:#141513;--fg:#e8e7e2;--mut:#9a9993;--line:#34352f;--card:#1e1f1c;--ok:#58b37a;--run:#6a9cf0;--rev:#b18cf0;--warn:#e0a040;--bad:#ef6b6b}}}}
*{{box-sizing:border-box}}body{{margin:0;padding:14px 16px 40px;background:var(--bg);color:var(--fg);font:14px/1.55 system-ui,"Microsoft YaHei",sans-serif}}
h1{{font-size:19px;margin:0}}h2{{font-size:15px;margin:22px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}}h4{{margin:0 0 6px}}
a{{color:var(--run)}}.mut,.sub{{color:var(--mut)}}.sub{{font-size:12px}}code{{font-size:12px}}
.top{{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline}}.age{{padding:2px 8px;border-radius:10px;font-size:12px;border:1px solid}}
.age.ok{{color:var(--ok)}}.age.warn{{color:var(--warn)}}.age.bad{{color:var(--bad);font-weight:700}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}}
.dl{{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--mut);border-radius:8px;padding:8px 10px}}
.dl.ok{{border-left-color:var(--ok)}}.dl.run{{border-left-color:var(--run)}}.dl.rev{{border-left-color:var(--rev)}}.dl.bad{{border-left-color:var(--bad)}}
.kpi{{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0}}.k{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;min-width:200px}}
.k b{{font-size:18px}}.prog{{height:8px;background:var(--line);border-radius:4px;overflow:hidden;margin-top:6px}}.prog i{{display:block;height:100%;background:var(--ok)}}
.chip{{display:inline-block;padding:0 7px;border-radius:9px;font-size:12px;border:1px solid currentColor;margin-right:4px}}
.chip.ok{{color:var(--ok)}}.chip.run{{color:var(--run)}}.chip.rev{{color:var(--rev)}}.chip.warn{{color:var(--warn)}}.chip.bad{{color:var(--bad)}}.chip.mut{{color:var(--mut)}}
ul{{margin:4px 0;padding-left:20px}}li{{margin:3px 0}}.badt{{color:var(--bad)}}
.cp{{display:flex;gap:3px;margin:6px 0}}.seg{{background:var(--card);border:1px solid var(--run);border-radius:5px;padding:4px 6px;font-size:12px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}}
.seg.done{{border-color:var(--ok);opacity:.6}}.seg small{{margin-left:4px;color:var(--mut)}}
table{{border-collapse:collapse;width:100%;background:var(--card)}}td,th{{border:1px solid var(--line);padding:5px 7px;text-align:left;vertical-align:top}}td.bad{{color:var(--bad)}}
.dag{{width:100%;max-height:420px;background:var(--card);border:1px solid var(--line);border-radius:8px}}
.dag rect{{fill:var(--card);stroke:var(--mut);stroke-width:1.5}}.dag .crit rect{{stroke-width:3}}
.dag .ok rect{{stroke:var(--ok)}}.dag .run rect{{stroke:var(--run)}}.dag .rev rect{{stroke:var(--rev)}}.dag .warn rect{{stroke:var(--warn)}}.dag .bad rect{{stroke:var(--bad)}}
.dag text{{fill:var(--fg);font-size:12px}}.dag .nst{{fill:var(--mut)}}.dag .edge{{stroke:var(--mut)}}.dag .arrow{{fill:var(--mut)}}
.ba{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:8px}}.cols{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}
.cols p{{margin:4px 0}}.jump a{{margin-right:8px;padding:2px 8px;border:1px solid var(--run);border-radius:10px;text-decoration:none;font-size:12px}}
.doc{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:8px}}.doc summary{{cursor:pointer}}
.md{{max-height:70vh;overflow:auto;border-top:1px solid var(--line);margin-top:8px;padding-top:4px}}.md table{{font-size:12px}}
pre{{background:var(--bg);border:1px solid var(--line);padding:8px;overflow:auto;font-size:12px}}.pv{{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--run);border-radius:8px;padding:10px 12px}}
.pv .headline{{font-size:16px;font-weight:600;margin:0 0 6px}}.pv table{{margin-top:6px}}@media (max-width:640px){{.cols{{grid-template-columns:1fr}}}}
</style></head><body>
<div class="top"><h1>{e(d["lineName"])} · 波 {d["wave"]}</h1><a href="{card}" target="_blank">#{d["parentCard"]}</a>
<span class="mut"><code>{e(d["branch"])}@{e(d["head"])}</code> · {e(d["attempt"])}</span>
<nav class="jump">{nav}<a href="#docs">全部文档</a></nav>
<span class="age {agecls}">更新于 {e(d["updatedAt"][11:16])}Z（{age} 分钟前）</span></div>
<h2 style="margin-top:12px">本波对产品意味着什么</h2>{pv_html}
<p><b>现在：</b>{e(d["summary"])}</p>
<div class="kpi">
<div class="k">判据有证据<br><b>{met}/{len(crit)}</b><div class="prog"><i style="width:{pct}%"></i></div></div>
<div class="k">预计完整交付（置信度 {e(eta["confidence"])}）<br><b>{eta_txt}</b>{("<div class=sub>变化原因：" + e(eta["changedReason"]) + "</div>") if eta.get("changedReason") else ""}</div>
<div class="k">资源<br><b class="{"badt" if over else ""}">重活 {res.get("heavyNow", 0)}/{res.get("cap", 3)}</b><div class="sub">子代理在跑 {res.get("subagentsRunning", "?")} · {e(res.get("note", ""))}</div></div>
</div>
<h2>需要谁做什么 · 偏差信号</h2><ul>{attn_html}</ul>
<h2>本波成果</h2><div class="grid">{strip}</div>
<h2>关键路径</h2><div class="cp">{bar or '<span class="mut">未填写</span>'}</div><div class="sub">共约 {total} 分钟；淡色段已完成</div>
<h2>闭包依赖图</h2>{dag_svg(d["closures"]) if d["closures"] else '<p class="mut">尚无闭包</p>'}
<div class="sub">★ / 粗边框 = 关键路径；箭头从依赖指向使用方</div>
<h2>闭包表（工作树事实由 facts.py 刷新）</h2>
<table><tr><th>闭包</th><th>状态</th><th>写者与档位</th><th>轮次</th><th>工作树事实</th><th>宿主</th></tr>{''.join(crow)}</table>
<h2>判据与证据</h2><table><tr><th>成果</th><th>判据</th><th>状态</th><th>证据</th></tr>{''.join(drow)}</table>
<h2>交付前后对比</h2>{arch or '<p class="mut">未填写</p>'}
<h2>角色与模型配置（来自闭包表与 delegate/flow.jsonl）</h2>
<table><tr><th>角色</th><th>模型@档位</th><th>流水行数</th><th>升级次数</th></tr>{role_html}</table>
<h2>决策记录</h2><ul>{dec or '<li class="mut">无</li>'}</ul>
<h2 id="docs">本波文档（spec、plan 等）</h2>{docs or '<p class="mut">未登记</p>'}
<h2>时间线</h2><ul>{tl or '<li class="mut">无</li>'}</ul>
</body></html>'''


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    path = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else path.with_name('progress.html')
    try:
        d = json.loads(path.read_text(encoding='utf-8'))
        check(d)
    except (Bad, json.JSONDecodeError) as x:
        print(f'progress.json 不合法：{x}', file=sys.stderr)
        sys.exit(2)
    out.write_text(render(d, path), encoding='utf-8')
    print(f'built {out}')


if __name__ == '__main__':
    main()
