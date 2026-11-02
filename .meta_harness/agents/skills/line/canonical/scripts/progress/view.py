"""线进度页模板（呈现版）生成器。用法：

    python view.py <progress.json> [--out progress-page.html] [--css panel.css]

读同一份 progress.json，生成一份可长期保存、可发给线外读者的静态 HTML。
与同目录 build.py 的分工：build.py 拥有数据格式（校验、枚举、facts 刷新、自动重载），
本脚本只负责呈现，校验直接调用 build.check，不另立规则。
字段与取舍见 ../../references/wave-progress.md「两页分工」。只用标准库。
"""
from __future__ import annotations

import datetime as dt
import html
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build as schema  # noqa: E402  同目录的 build.py，数据契约的唯一拥有者

CRITERION_TONE = {'met': ('有证据', 'ok'), 'partial': ('部分', 'warn'), 'open': ('未完成', 'idle'),
                  'deferred': ('移出本波', 'warn'), 'na': ('不适用', 'idle')}
EVIDENCE_TONE = {'answered': ('已答复', 'ok'), 'open': ('待答复', 'warn')}

e = html.escape
NOW: dt.datetime | None = None  # --now 覆盖，用于生成可复现的样例与截图


def age_of(value: str) -> tuple[int, bool]:
    """距今分钟数与「时间在未来」标记。静态快照可以带 --now 固定参照点。"""
    moment = NOW or dt.datetime.now(dt.timezone.utc)
    delta = int((moment - schema.parse_t(value)).total_seconds() // 60)
    return max(0, delta), delta < 0


def age_text(value: str) -> str:
    minutes, future = age_of(value)
    return f'{minutes} 分钟前' + ('（数据时间在未来）' if future else '')


def chip(label: str, tone: str) -> str:
    return f'<span class="chip {tone}">{e(label)}</span>'


def external(label: str, url: str | None) -> str:
    if not url:
        return e(label)
    return f'<a href="{e(url)}" target="_blank" rel="noreferrer">{e(label)}</a>'


def fmt_time(value: str) -> str:
    return value.replace('T', ' ').replace(':00Z', 'Z') if value else '—'


def criteria_rows(d: dict) -> list[dict]:
    """把判据摊平成行，编号取「成果 id + 序号」，方便引用与回链。"""
    rows = []
    for item in d['deliverables']:
        counted = [c for c in item.get('criteria', []) if c['state'] != 'na']
        for index, criterion in enumerate(item.get('criteria', []), start=1):
            rows.append({
                'id': f'{item["id"]}-{index}',
                'deliverable': item,
                'total': len(counted),
                'criterion': criterion,
            })
    return rows


def met_count(item: dict) -> tuple[int, int]:
    counted = [c for c in item.get('criteria', []) if c['state'] != 'na']
    return sum(1 for c in counted if c['state'] == 'met'), len(counted)


def render_criteria(rows: list[dict]) -> str:
    if not rows:
        return '<p class="empty">本波还没有登记判据。</p>'
    body = []
    for row in rows:
        criterion = row['criterion']
        item = row['deliverable']
        label, tone = CRITERION_TONE[criterion['state']]
        evidence = ' '.join(external(link.get('label', '证据'), link.get('url'))
                            for link in criterion.get('evidence', []))
        if not evidence and criterion['state'] == 'met':
            evidence = '<span class="chip bad">缺证据</span>'
        note = f'<span class="small muted break">{e(criterion["note"])}</span>' if criterion.get('note') else ''
        body.append(
            '<tr>'
            f'<td data-label="判据" class="is-num nowrap"><code>{e(row["id"])}</code></td>'
            f'<td data-label="判据内容"><span class="cell-inline">'
            f'<span>{e(criterion["text"])}</span>{note}</span></td>'
            f'<td data-label="所属成果"><span class="cell-inline">'
            f'<b>{e(item["id"])}</b><span class="small muted">{e(item.get("title", ""))}</span></span></td>'
            f'<td data-label="状态">{chip(label, tone)}</td>'
            f'<td data-label="证据"><span class="cell-inline">{evidence or "—"}</span></td>'
            '</tr>')
    return (f'<div class="table-wrap"><table class="grid-table">'
            f'<thead><tr><th>判据</th><th>判据内容</th><th>所属成果</th><th>状态</th><th>证据</th></tr></thead>'
            f'<tbody>{"".join(body)}</tbody></table></div>')


def render_closures(d: dict) -> str:
    closures = d['closures']
    if not closures:
        return '<p class="empty">本波还没有切闭包。</p>'
    deliverable_titles = {x['id']: x.get('title', '') for x in d['deliverables']}
    body = []
    for closure in closures:
        label, tone = schema.CLOS[closure['status']]
        writer = closure.get('writer') or {}
        serves = '、'.join(f'{cid} {deliverable_titles.get(cid, "")}'.strip()
                          for cid in closure.get('deliverables', [])) or '未登记'
        report = ''
        if closure.get('report'):
            report = external(closure['report'].get('label', '验收报告'), closure['report'].get('url'))
        elif closure.get('acceptance'):
            report = '<span class="chip idle">未附报告</span>'
        else:
            report = '—'
        verdict = closure.get('verdict')
        if verdict:
            report += f'<span class="small muted break"> · {e(verdict)}</span>'
        body.append(
            '<tr>'
            f'<td data-label="闭包"><span class="cell-inline"><b>{e(closure["id"])}</b>'
            f'<span class="small muted">{e(closure.get("title", ""))}</span></span></td>'
            f'<td data-label="写者"><span class="cell-inline">{e(writer.get("role", "—"))}'
            f'<span class="small muted">{e(writer.get("model", ""))} @ {e(writer.get("effort", ""))}</span></span></td>'
            f'<td data-label="分支"><code class="break">{e(closure.get("branch", "—"))}</code></td>'
            f'<td data-label="状态">{chip(label, tone)}</td>'
            f'<td data-label="轮次" class="is-num">{closure.get("rounds", 1)}</td>'
            f'<td data-label="服务成果"><span class="small">{e(serves)}</span></td>'
            f'<td data-label="验收报告"><span class="cell-inline">{report}</span></td>'
            '</tr>')
    return (f'<div class="table-wrap"><table class="grid-table">'
            f'<thead><tr><th>闭包</th><th>写者</th><th>分支</th><th>状态</th><th>轮次</th>'
            f'<th>服务成果</th><th>验收报告</th></tr></thead>'
            f'<tbody>{"".join(body)}</tbody></table></div>')


def render_evidence(rows: list[dict]) -> str:
    """证据索引：同一链接只列一次，标出它支撑哪些判据。"""
    index: dict[str, dict] = {}
    for row in rows:
        for link in row['criterion'].get('evidence', []):
            url = link.get('url')
            if not url:
                continue
            entry = index.setdefault(url, {'label': link.get('label', '证据'), 'ids': []})
            entry['ids'].append(row['id'])
    if not index:
        return '<p class="empty">本波还没有登记证据链接。</p>'
    items = []
    for url, entry in index.items():
        items.append(f'<li>{external(entry["label"], url)}'
                     f'<div class="small muted">支撑 {e("、".join(entry["ids"]))}</div></li>')
    return f'<ul class="request-list">{"".join(items)}</ul>'


def render_timeline(d: dict) -> str:
    events = d.get('timeline') or []
    if not events:
        return '<p class="empty">本波还没有时间线条目。</p>'
    items = ''.join(f'<li><span class="at">{e(fmt_time(x["at"]))}</span><span>{e(x["event"])}</span></li>'
                    for x in events)
    return f'<ul class="timeline">{items}</ul>'


def render_deliverables(d: dict) -> str:
    cards = []
    for item in d['deliverables']:
        label, tone = schema.DELIV[item['status']]
        met, total = met_count(item)
        cards.append(
            f'<div class="card"><div class="cell-inline">'
            f'<span><b>{e(item["id"])}</b> {e(item.get("title", ""))}</span>'
            f'<span class="small muted">{e(item.get("risk", ""))} · 判据 {met}/{total}</span>'
            f'</div><div style="margin-top:6px">{chip(label, tone)}</div></div>')
    return f'<div class="tiles">{"".join(cards)}</div>'


def banner(d: dict) -> str:
    rows = criteria_rows(d)
    met = sum(1 for row in rows if row['criterion']['state'] == 'met')
    counted = sum(1 for row in rows if row['criterion']['state'] != 'na')
    blocked = [x for x in d['closures'] if x['status'] == 'blocked']
    open_asks = [a for a in d['asks'] if a['status'] == 'open']
    if blocked:
        lead = f'{len(blocked)} 个闭包受阻：' + '、'.join(x['id'] for x in blocked)
        tone = ' urgent'
    elif open_asks:
        lead = f'{len(open_asks)} 项等待线的外部决定，其余按计划推进。'
        tone = ' needs'
    else:
        lead = '本波没有受阻闭包，也没有待答复的外部请求。'
        tone = ''
    detail = f'判据带证据 {met}/{counted}；现在：{d["summary"]}'
    return (f'<div class="banner{tone}"><div class="lead">{e(lead)}</div>'
            f'<div class="detail">{e(detail)}</div></div>')


def tiles(d: dict) -> str:
    rows = criteria_rows(d)
    met = sum(1 for row in rows if row['criterion']['state'] == 'met')
    counted = sum(1 for row in rows if row['criterion']['state'] != 'na')
    merged = sum(1 for x in d['closures'] if x['status'] == 'merged')
    asks = sum(1 for a in d['asks'] if a['status'] == 'open')
    return (f'<div class="tiles">'
            f'<div class="tile"><div class="label">判据带证据</div><div class="value">{met}<small> / {counted}</small></div></div>'
            f'<div class="tile"><div class="label">闭包已合入</div><div class="value">{merged}<small> / {len(d["closures"])}</small></div></div>'
            f'<div class="tile"><div class="label">待答复的外部请求</div><div class="value">{asks}</div></div>'
            f'<div class="tile"><div class="label">本波</div><div class="value">W{d["wave"]}</div></div>'
            f'</div>')


def render(d: dict, css: str) -> str:
    rows = criteria_rows(d)
    note = d.get('resources', {}).get('note', '')
    resource_note = f'<p>本线资源：{e(note)}</p>' if note else ''
    age, future = age_of(d['updatedAt'])
    updated_tone = 'bad' if future else ('ok' if age <= 10 else ('warn' if age <= 30 else 'bad'))
    asks = [a for a in d['asks'] if a['status'] == 'open']
    ask_html = ''
    if asks:
        items = ''.join(f'<li>{chip("等 " + str(a.get("to", "")), "warn")} '
                        f'{external(a["what"], a.get("link"))}'
                        f'<div class="small muted">挂起 {age_text(a["since"]) if a.get("since") else "—"}'
                        f' · 第 {a.get("layer", "?")} 层</div></li>' for a in asks)
        ask_html = f'<section><h2>等外部决定 <span class="count">{len(asks)} 项</span></h2><div class="card"><ul class="request-list">{items}</ul></div></section>'
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(d["lineName"])} 波 {d["wave"]} 进度</title>
<style>{css}</style>
</head>
<body>
<div class="shell">
<header class="masthead">
  <h1>{e(d["lineName"])} 波 {d["wave"]} 进度</h1>
  <div class="meta">
    <span>#{d["parentCard"]}</span>
    <span><code>{e(d["branch"])}@{e(d["head"])}</code></span>
    <span>{e(d["attempt"])}</span>
    <span>更新 {e(fmt_time(d["updatedAt"]))}</span>
    {chip("数据 " + age_text(d["updatedAt"]), updated_tone)}
  </div>
</header>

{banner(d)}
{tiles(d)}

<section><h2>判据 <span class="count">{len(rows)} 条</span></h2>{render_criteria(rows)}</section>
<section><h2>成果</h2>{render_deliverables(d)}</section>
<section><h2>闭包 <span class="count">{len(d["closures"])}</span></h2>{render_closures(d)}</section>
{ask_html}
<section><h2>证据链接</h2><div class="card">{render_evidence(rows)}</div></section>
<section><h2>波次时间线</h2><div class="card">{render_timeline(d)}</div></section>

<footer class="notes">
  <p>本页是 progress.json 的静态呈现版，供交回与复盘后保存；在跑时的实时页仍由同目录 build.py 生成
  （60 秒自动重载、facts.py 刷新工作树事实）。判据只有带至少一条证据链接时才算有证据。</p>
  {resource_note}
</footer>
</div>
</body>
</html>
'''


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
    out_path = pathlib.Path(args[args.index('--out') + 1]) if '--out' in args else data_path.with_name('progress-page.html')
    css_path = (pathlib.Path(args[args.index('--css') + 1]) if '--css' in args
                else pathlib.Path(__file__).resolve().parent / 'panel.css')
    if '--now' in args:
        global NOW
        NOW = schema.parse_t(args[args.index('--now') + 1])
    drift = stylesheet_drift(css_path)
    if drift:
        print(drift, file=sys.stderr)
        return 2
    try:
        data = json.loads(data_path.read_text(encoding='utf-8'))
        schema.check(data)
    except FileNotFoundError as err:
        print(f'找不到输入：{err.filename}', file=sys.stderr)
        return 2
    except json.JSONDecodeError as err:
        print(f'progress.json 不是合法 JSON：{err}', file=sys.stderr)
        return 2
    except schema.Bad as err:
        print(f'progress.json 不合法：{err}', file=sys.stderr)
        return 2
    out_path.write_text(render(data, css_path.read_text(encoding='utf-8')), encoding='utf-8', newline='\n')
    print(f'built {out_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
