"""刷新在途闭包的工作树事实，写回 progress.json 的 closures[].facts，再重建页面。
用法: python facts.py tmp/line-<线>/progress.json [--loop --interval 120]
只读本机工作树（Windows 路径直接读；host 为 wsl 的经 wsl.exe 读 WSL 自己的文件系统），不访问 GitHub，不改仓库。"""
import datetime as dt
import json
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).parent
WSL = r'''
for arg in "$@"; do
  wt=${arg%%|*}; rest=${arg#*|}; base=${rest%%|*}; pdir=${rest#*|}
  [ -d "$wt" ] || { echo "$arg#missing"; continue; }
  c=$(git -C "$wt" rev-list --count "$base"..HEAD 2>/dev/null || echo '?')
  s=$(git -C "$wt" status --short | wc -l)
  m=$(find "$wt/$pdir" -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
  h=$(git -C "$wt" log -1 --format='%h %s' | cut -c1-70)
  echo "$arg#$c#$s#${m:-}#$h"
done
'''


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout.strip()


def win_facts(c, base):
    wt = pathlib.Path(c['worktree'])
    if not wt.exists():
        return {'missing': True}
    commits = run(['git', '-C', str(wt), 'rev-list', '--count', f'{base}..HEAD'])
    changed = len([x for x in run(['git', '-C', str(wt), 'status', '--short']).splitlines() if x])
    pdir = wt / c.get('processDir', '')
    latest = max((p.stat().st_mtime for p in pdir.rglob('*') if p.is_file()), default=None) if c.get('processDir') and pdir.exists() else None
    head = run(['git', '-C', str(wt), 'log', '-1', '--format=%h %s'])[:70]
    return {'commits': int(commits) if commits.isdigit() else commits, 'changed': changed,
            'lastWriteMin': int((time.time() - latest) // 60) if latest else None, 'head': head}


def wsl_facts(items, base):
    if not items:
        return {}
    args = [f'{c["worktree"]}|{base}|{c.get("processDir", ".")}' for c in items]
    out = subprocess.run(['wsl.exe', '-d', 'Ubuntu-24.04', '--exec', 'bash', '-ls', '-s', '--', *args],
                         input=WSL.encode(), capture_output=True).stdout.decode('utf-8', 'replace')
    res = {}
    for line in out.replace('\r', '').splitlines():
        p = line.split('#')
        if len(p) == 5:
            m = float(p[3]) if p[3] else None
            res[p[0]] = {'commits': p[1], 'changed': int(p[2]),
                         'lastWriteMin': int((time.time() - m) // 60) if m else None, 'head': p[4]}
    return res


def once(path):
    d = json.loads(path.read_text(encoding='utf-8'))
    base = d['branch']
    live = [c for c in d['closures'] if c.get('status') in ('running', 'review', 'fixing') and c.get('worktree')]
    wsl = wsl_facts([c for c in live if c.get('host') == 'wsl'], base)
    for c in live:
        if c.get('host') == 'wsl':
            c['facts'] = wsl.get(f'{c["worktree"]}|{base}|{c.get("processDir", ".")}', {'missing': True})
        else:
            c['facts'] = win_facts(c, base)
    d['resources']['subagentsRunning'] = len(live)
    d['updatedAt'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    path.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding='utf-8')
    subprocess.run([sys.executable, str(HERE / 'build.py'), str(path)], check=False)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    path = pathlib.Path(sys.argv[1])
    interval = int(sys.argv[sys.argv.index('--interval') + 1]) if '--interval' in sys.argv else 120
    while True:
        once(path)
        if '--loop' not in sys.argv:
            break
        time.sleep(interval)


if __name__ == '__main__':
    main()
