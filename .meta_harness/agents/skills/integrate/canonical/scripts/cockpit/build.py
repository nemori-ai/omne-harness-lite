"""Reduce 总控页模板生成器。用法：

    python build.py <reduce.json> [--out reduce.html] [--css panel.css]

读一份 reduce.json，生成一个不依赖外部资源的 HTML 页面。
数据格式与字段说明见 ../../references/cockpit.md。只用标准库。
"""
from __future__ import annotations

import datetime as dt
import html
import json
import pathlib
import sys

SCHEMA_VERSION = 1

TRACK_STATUS = {
    'running': ('在跑', 'run'),
    'waiting': ('等上游', 'warn'),
    'review': ('待评审', 'run'),
    'merged': ('已合入', 'ok'),
    'blocked': ('受阻', 'bad'),
    'dropped': ('已撤', 'idle'),
}

CARD_STAGE = {
    'not-started': ('未开工', 'idle'),
    'building': ('实现中', 'run'),
    'review': ('评审中', 'run'),
    'fixing': ('修复中', 'warn'),
    'accepted': ('已接受', 'ok'),
    'blocked': ('受阻', 'bad'),
    'deferred': ('移出本波', 'idle'),
}

REQUEST_STATUS = {
    'open': ('待裁定', 'warn'),
    'answered': ('已答复', 'ok'),
    'withdrawn': ('已撤回', 'idle'),
}

STEP_STATE = {
    'done': ('已完成', 'ok'),
    'active': ('进行中', 'run'),
    'pending': ('未开始', 'idle'),
    'blocked': ('受阻', 'bad'),
}

SEVERITY = {'bad': ('阻断', 'bad'), 'warn': ('注意', 'warn'), 'info': ('知会', 'idle')}

REQUIRED = ('schemaVersion', 'title', 'updatedAt', 'tracks', 'cards', 'requests', 'criticalPath', 'timeline')


class Bad(Exception):
    """输入不合法。消息会原样打印给用户，指出字段与合法取值。"""


e = html.escape


def parse_time(value: str, where: str) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        raise Bad(f'{where} 不是 UTC ISO 时间：{value!r}')
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)


NOW: dt.datetime | None = None  # --now 覆盖参照点，用于生成可复现的样例与截图


def elapsed(value: str, where: str) -> tuple[int, bool]:
    """距今分钟数与「时间在未来」标记。未来时间不折成 0，否则陈旧页面会显示成新的。"""
    moment = NOW or dt.datetime.now(dt.timezone.utc)
    delta = int((moment - parse_time(value, where)).total_seconds() // 60)
    return max(0, delta), delta < 0


def minutes_since(value: str, where: str) -> int:
    return elapsed(value, where)[0]


def check(d: dict) -> None:
    for key in REQUIRED:
        if key not in d:
            raise Bad(f'缺字段 {key}')
    if d['schemaVersion'] != SCHEMA_VERSION:
        raise Bad(f'schemaVersion 应为 {SCHEMA_VERSION}')
    parse_time(d['updatedAt'], 'updatedAt')
    if not str(d.get('title', '')).strip():
        raise Bad('title 不能为空')

    upstream = d.get('upstream') or {}
    if upstream and not upstream.get('name'):
        raise Bad('upstream 需要 name')

    for i, t in enumerate(d['tracks']):
        where = f'tracks[{i}]'
        if t.get('status') not in TRACK_STATUS:
            raise Bad(f'{where}.status={t.get("status")!r} 不在 {list(TRACK_STATUS)}')
        for key in ('name', 'head'):
            if not t.get(key):
                raise Bad(f'{where} 缺 {key}')
        if t.get('lead') is not None and not isinstance(t['lead'], int):
            raise Bad(f'{where}.lead 是相对上游的领先提交数，整数（落后写负数）')

    card_ids = set()
    for i, c in enumerate(d['cards']):
        where = f'cards[{i}]'
        if not c.get('id'):
            raise Bad(f'{where} 缺 id')
        if c['id'] in card_ids:
            raise Bad(f'cards 里 id 重复：{c["id"]}')
        card_ids.add(c['id'])
        if c.get('stage') not in CARD_STAGE:
            raise Bad(f'{where}.stage={c.get("stage")!r} 不在 {list(CARD_STAGE)}')
        if c.get('track') and c['track'] not in {t['name'] for t in d['tracks']}:
            raise Bad(f'{where}.track 指向不存在的轨道 {c["track"]}')
        binding = c.get('binding')
        if binding is not None and not isinstance(binding, dict):
            raise Bad(f'{where}.binding 应为对象（attempt、writeScope 等）')

    for i, r in enumerate(d['requests']):
        where = f'requests[{i}]'
        if r.get('status') not in REQUEST_STATUS:
            raise Bad(f'{where}.status={r.get("status")!r} 不在 {list(REQUEST_STATUS)}')
        if r.get('layer') != 3:
            raise Bad(f'{where}.layer 应为 3；第一、二层不进总控页')
        if not r.get('what'):
            raise Bad(f'{where} 缺 what')

    total = 0
    for i, s in enumerate(d['criticalPath']):
        where = f'criticalPath[{i}]'
        if s.get('state') not in STEP_STATE:
            raise Bad(f'{where}.state={s.get("state")!r} 不在 {list(STEP_STATE)}')
        if not isinstance(s.get('minutes'), int) or s['minutes'] <= 0:
            raise Bad(f'{where}.minutes 应为正整数')
        total += s['minutes']
    d['_criticalMinutes'] = total

    for i, ev in enumerate(d['timeline']):
        parse_time(ev.get('at'), f'timeline[{i}].at')
        if not ev.get('event'):
            raise Bad(f'timeline[{i}] 缺 event')

    for i, r in enumerate(d.get('risks', [])):
        if r.get('severity') not in SEVERITY:
            raise Bad(f'risks[{i}].severity={r.get("severity")!r} 不在 {list(SEVERITY)}')


def chip(label: str, tone: str) -> str:
    return f'<span class="chip {tone}">{e(label)}</span>'


def status_chip(table: dict, value: str) -> str:
    label, tone = table[value]
    return chip(label, tone)


def external(label: str, url: str | None) -> str:
    if not url:
        return e(label)
    return f'<a href="{e(url)}" target="_blank" rel="noreferrer">{e(label)}</a>'


def divergence(lead: int | None, upstream_name: str) -> str:
    """领先/落后：数字 + 方向 + 条长，三种编码。条长以 10 个提交为满格。"""
    if lead is None:
        return '<span class="muted">未报</span>'
    if lead == 0:
        return (f'<span class="divergence"><span>齐平</span>'
                f'<span class="track" aria-hidden="true"><span class="fill zero"></span></span>'
                f'<span class="num">0</span></span>')
    ahead = lead > 0
    width = min(50.0, abs(lead) * 5.0)
    tone = 'ahead' if ahead else 'behind'
    word = '领先' if ahead else '落后'
    side = 'left:50%' if ahead else 'right:50%'
    return (f'<span class="cell-inline"><span class="divergence"><span>{word}</span>'
            f'<span class="track" aria-hidden="true"><span class="fill {tone}" style="{side};width:{width:.1f}%"></span></span>'
            f'<span class="num">{abs(lead)}</span></span>'
            f'<span class="small muted">相对 {e(upstream_name)}</span></span>')


def render_tracks(d: dict) -> str:
    upstream = (d.get('upstream') or {}).get('name', '上游')
    rows = []
    for t in d['tracks']:
        note = f'<div class="small muted">{e(t["note"])}</div>' if t.get('note') else ''
        card = f'<div class="small">{external("#" + str(t["card"]), t.get("cardUrl"))}</div>' if t.get('card') else ''
        rows.append(
            '<tr>'
            f'<td data-label="轨道"><b>{e(t["name"])}</b>{card}<div class="small muted">{e(t.get("scope", ""))}</div></td>'
            f'<td data-label="状态">{status_chip(TRACK_STATUS, t["status"])}</td>'
            f'<td data-label="头提交"><span class="cell-inline"><code class="break">{e(t["head"])}</code>{note}</span></td>'
            f'<td data-label="相对上游">{divergence(t.get("lead"), upstream)}</td>'
            f'<td data-label="交回">{external(t.get("handoff", "—"), t.get("handoffUrl"))}</td>'
            '</tr>')
    return (f'<div class="table-wrap"><table class="grid-table">'
            f'<thead><tr><th>轨道</th><th>状态</th><th>头提交</th><th>相对上游</th><th>交回</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table></div>')


def render_cards(d: dict) -> str:
    rows = []
    for c in d['cards']:
        binding = c.get('binding') or {}
        scope = binding.get('writeScope') or []
        scope_txt = '、'.join(scope) if scope else '未登记'
        attempt = binding.get('attempt') or '—'
        rows.append(
            '<tr>'
            f'<td data-label="卡"><span class="cell-inline"><b>#{e(str(c["id"]))}</b> '
            f'<span class="small">{e(c.get("title", ""))}</span></span></td>'
            f'<td data-label="轨道">{e(c.get("track", "—"))}</td>'
            f'<td data-label="阶段">{status_chip(CARD_STAGE, c["stage"])}</td>'
            f'<td data-label="binding"><span class="cell-inline">'
            f'<code class="break">{e(str(attempt))}</code>'
            f'<span class="small muted break">写范围：{e(scope_txt)}</span></span></td>'
            f'<td data-label="负责人">{e(binding.get("owner") or "—")}</td>'
            f'<td data-label="等待">{external(c.get("waitingOn", "—"), c.get("waitingUrl"))}</td>'
            '</tr>')
    return (f'<div class="table-wrap"><table class="grid-table">'
            f'<thead><tr><th>卡</th><th>轨道</th><th>阶段</th><th>binding</th><th>负责人</th><th>等待</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table></div>')


def render_requests(d: dict) -> str:
    """第三层请求：只有未答复的上主区，答复过的折进 details。"""
    open_rows, closed_rows = [], []
    for r in d['requests']:
        waited_txt = '—'
        if r.get('since'):
            waited, future = elapsed(r['since'], 'requests.since')
            waited_txt = f'{waited} 分钟' + ('（时间在未来）' if future else '')
        link = external('原件', r.get('link')) if r.get('link') else ''
        row = (f'<li><div><b>{external(str(r["id"]), r.get("link"))}</b> '
               f'<span class="small muted">{e(r.get("from", ""))} · 等 {e(r.get("to", "Reduce"))}</span></div>'
               f'<div>{e(r["what"])}</div>'
               f'<div class="small muted">挂起 {waited_txt}{(" · " + e(r["note"])) if r.get("note") else ""} {link}</div></li>')
        if r['status'] == 'open':
            open_rows.append(row)
        else:
            closed = f'<div class="small muted">裁定：{e(r.get("answer") or "—")}</div>'
            closed_rows.append(row + closed)

    if not open_rows:
        main = '<p class="empty">没有待裁定的第三层请求。</p>'
    else:
        main = f'<ul class="request-list">{"".join(open_rows)}</ul>'
    folded = ''
    if closed_rows:
        folded = (f'<details><summary class="small">已答复与已撤回 <span class="muted">'
                  f'（{len(closed_rows)} 条）</span></summary>'
                  f'<ul class="request-list">{"".join(closed_rows)}</ul></details>')
    return f'<div class="card stack">{main}{folded}</div>'


def render_critical_path(d: dict) -> str:
    segments, items = [], []
    for step in d['criticalPath']:
        label, tone = STEP_STATE[step['state']]
        weight = step['minutes']
        done = step['state'] == 'done'
        segments.append(
            f'<div class="seg{" done" if done else ""}" style="flex-grow:{weight}" '
            f'aria-label="{e(step["item"])} {weight} 分钟 {e(label)}">'
            f'<span class="name">{e(step["item"])}</span>'
            f'<span class="min">{weight}′ · {e(label)}</span></div>')
        marker = '✓ ' if done else ''
        items.append(f'<li class="{"done" if done else ""}">{marker}<b>{e(step["item"])}</b>'
                     f' <span class="muted">{weight} 分钟 · {e(label)}</span></li>')
    return (f'<div class="path"><div class="path-bar">{"".join(segments)}</div>'
            f'<ol class="path-list">{"".join(items)}</ol>'
            f'<div class="small muted">合计 {d["_criticalMinutes"]} 分钟</div></div>')


def render_timeline(d: dict) -> str:
    items = []
    for ev in d['timeline'][:30]:
        stamp = ev['at'].replace('T', ' ').replace(':00Z', 'Z')
        items.append(f'<li><span class="at">{e(stamp)}</span><span>{e(ev["event"])}</span></li>')
    return f'<ul class="timeline">{"".join(items)}</ul>'


def render_risks(d: dict) -> str:
    risks = d.get('risks') or []
    if not risks:
        return '<p class="empty">未登记风险。</p>'
    items = []
    for r in risks:
        label, tone = SEVERITY[r['severity']]
        items.append(f'<li>{chip(label, tone)} <b>{e(r["risk"])}</b>'
                     f'<div class="small muted">影响：{e(r.get("impact", "—"))}</div>'
                     f'<div class="small muted">应对：{e(r.get("action", "—"))}</div></li>')
    return f'<ul class="request-list">{"".join(items)}</ul>'


def banner(d: dict) -> str:
    reqs = [r for r in d['requests'] if r['status'] == 'open']
    blocked = [t for t in d['tracks'] if t['status'] == 'blocked']
    active = [t for t in d['tracks'] if t['status'] in ('running', 'review', 'waiting')]
    if blocked:
        lead = f'{len(blocked)} 条轨道受阻：' + '、'.join(t['name'] for t in blocked)
        tone, detail = ' urgent', '先处理受阻轨道，再看裁定与合并。'
    elif reqs:
        oldest = min(reqs, key=lambda r: parse_time(r['since'], 'requests.since'))
        waited, future = elapsed(oldest['since'], 'requests.since')
        waited_txt = f'{waited} 分钟' + ('（时间在未来，核对时钟）' if future else '')
        lead = f'{len(reqs)} 条第三层请求等你裁定，最久一条挂了 {waited_txt}。'
        tone, detail = ' needs', f'来自 {oldest.get("from", "?")}：{oldest["what"]}'
    elif active:
        lead = f'{len(active)} 条轨道在推进，没有待裁定请求。'
        tone, detail = '', '按时间线检查下一次交回点。'
    else:
        lead = '本波没有在跑的轨道。'
        tone, detail = '', '确认是否已到收口阶段。'
    return (f'<div class="banner{tone}"><div class="lead">{e(lead)}</div>'
            f'<div class="detail">{e(detail)}</div></div>')


def tiles(d: dict) -> str:
    tracks = d['tracks']
    active = sum(1 for t in tracks if t['status'] in ('running', 'review', 'waiting'))
    accepted = sum(1 for c in d['cards'] if c['stage'] == 'accepted')
    open_reqs = sum(1 for r in d['requests'] if r['status'] == 'open')
    return (f'<div class="tiles">'
            f'<div class="tile"><div class="label">在跑轨道</div>'
            f'<div class="value">{active}<small> / {len(tracks)}</small></div></div>'
            f'<div class="tile"><div class="label">已接受卡</div>'
            f'<div class="value">{accepted}<small> / {len(d["cards"])}</small></div></div>'
            f'<div class="tile"><div class="label">待裁定第三层</div>'
            f'<div class="value">{open_reqs}</div></div>'
            f'<div class="tile"><div class="label">关键路径合计</div>'
            f'<div class="value">{d["_criticalMinutes"]}<small> 分钟</small></div></div>'
            f'</div>')


def render(d: dict, css: str) -> str:
    upstream = (d.get('upstream') or {}).get('name', '上游')
    updated = parse_time(d['updatedAt'], 'updatedAt')
    age, future = elapsed(d['updatedAt'], 'updatedAt')
    if future:
        age_tone, age_word = 'bad', '时间在未来'
    else:
        age_tone = 'ok' if age <= 10 else ('warn' if age <= 30 else 'bad')
        age_word = '新' if age <= 10 else ('偏旧' if age <= 30 else '过期')
    summary = f'<div class="detail">{e(d["summary"])}</div>' if d.get('summary') else ''
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(d["title"])}</title>
<style>{css}</style>
</head>
<body>
<div class="shell">
<header class="masthead">
  <h1>{e(d["title"])}</h1>
  <div class="meta">
    <span>上游 {e(upstream)}</span>
    <span>更新 {e(updated.strftime("%Y-%m-%d %H:%MZ"))}</span>
    {chip(f"数据{age_word} {age} 分钟", age_tone)}
  </div>
</header>

{banner(d)}
{summary}
{tiles(d)}

<section><h2>待你裁定</h2>{render_requests(d)}</section>
<section><h2>轨道</h2>{render_tracks(d)}</section>
<section><h2>卡与 binding</h2>{render_cards(d)}</section>
<section><h2>关键路径</h2><div class="card">{render_critical_path(d)}</div></section>
<section><h2>风险</h2><div class="card">{render_risks(d)}</div></section>
<section><h2>时间线</h2><div class="card">{render_timeline(d)}</div></section>

<footer class="notes">
  <p>本页由 reduce.json 生成，不读取网络，也不包含秘密与个人绝对路径。
  待裁定只列未答复的第三层请求；答复后把 status 改 answered 并填 answer，页面自动折起。</p>
</footer>
</div>
</body>
</html>
'''


def add_notes(d: dict) -> dict:
    return d


def stylesheet_drift(css_path: pathlib.Path) -> str | None:
    """两份 panel.css 必须逐字节相同：技能各自独立装载，样式各带一份。

    在仓库内运行 generator 时核对另一份；技能被复制到宿主目录后找不到对端，
    返回 None，不阻止生成。
    """
    known = {
        'integrate/canonical/scripts/cockpit/panel.css': 'line/canonical/scripts/progress/panel.css',
        'line/canonical/scripts/progress/panel.css': 'integrate/canonical/scripts/cockpit/panel.css',
    }
    parts = css_path.resolve().parts
    for suffix, peer in known.items():
        tail = tuple(suffix.split('/'))
        if parts[-len(tail):] != tail:
            continue
        root = pathlib.Path(*parts[:-len(tail)])
        other = root / peer
        if not other.exists():
            return None
        if other.read_bytes() != css_path.read_bytes():
            return f'样式副本已分叉：{css_path} 与 {other}。请同步两份 panel.css。'
    return None


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        print(__doc__)
        return 2
    data_path = pathlib.Path(args[0])
    out_path = pathlib.Path(args[args.index('--out') + 1]) if '--out' in args else data_path.with_name('reduce.html')
    css_path = (pathlib.Path(args[args.index('--css') + 1]) if '--css' in args
                else pathlib.Path(__file__).resolve().parent / 'panel.css')
    if '--now' in args:
        global NOW
        NOW = parse_time(args[args.index('--now') + 1], '--now')
    drift = stylesheet_drift(css_path)
    if drift:
        print(drift, file=sys.stderr)
        return 2
    try:
        data = json.loads(data_path.read_text(encoding='utf-8'))
        check(data)
    except FileNotFoundError as err:
        print(f'找不到输入：{err.filename}', file=sys.stderr)
        return 2
    except json.JSONDecodeError as err:
        print(f'reduce.json 不是合法 JSON：{err}', file=sys.stderr)
        return 2
    except Bad as err:
        print(f'reduce.json 不合法：{err}', file=sys.stderr)
        return 2
    css = css_path.read_text(encoding='utf-8')
    out_path.write_text(render(data, css), encoding='utf-8', newline='\n')
    print(f'built {out_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
