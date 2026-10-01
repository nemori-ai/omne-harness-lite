#!/usr/bin/env python3
"""Runner for the design-reviewer comparison (three old reviewers against the merged role).

  evalrun.py agents OLD_DIR NEW_DIR      freeze the role definitions of both arms as --agents JSON
  evalrun.py prepare MODE DEST           copy the workspace and seed the defects of one mode
  evalrun.py run MODE ARM REPEAT         prepare, run the role once read-only, record evidence
  evalrun.py summary                     one line per recorded run

Evidence goes to <repo>/tmp/design-reviewer-merge/runs/<mode>/<arm>-r<repeat>/ in the main checkout.
Seeds are judged by a person against the final message; nothing here scores a run or decides adoption.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parents[3]
MAIN = Path(os.environ.get('EVAL_MAIN_CHECKOUT', str(REPO)))
BASE = Path(os.environ.get('EVAL_BASE', '/data/qiwei/eval-design-reviewer'))
AGENTS = BASE / 'agents'
WORK = BASE / 'work'
EVIDENCE = MAIN / 'tmp' / 'design-reviewer-merge' / 'runs'
SEEDS = json.loads((HERE / 'suites' / 'seeds-v1.json').read_text())['modes']
OLD_ROLE = {'expression': 'spec-reviewer', 'choice': 'architecture-reviewer', 'plan': 'plan-reviewer'}
NEW_ROLE = 'design-reviewer'
# Both arms of one mode run on the model the old role pins today, so only the role text differs.
MODEL = {'expression': 'claude-opus-5-5', 'choice': 'claude-fable-5-1', 'plan': 'claude-fable-5-1'}
EFFORT = 'xhigh'
WALL_SECONDS = 50 * 60
BUDGET_USD = '20'
READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep']
COPY = ['AGENTS.md', 'CLAUDE.md', '.meta_harness/AGENTS.md', '.meta_harness/CLAUDE.md', '.meta_harness/README.md',
        '.meta_harness/agents', '.meta_harness/design', '.meta_harness/tooling']


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def tree_hash(root):
    h = hashlib.sha256()
    for p in sorted(Path(root).rglob('*')):
        if p.is_file():
            h.update(str(p.relative_to(root)).encode())
            h.update(p.read_bytes())
    return h.hexdigest()


def replace_once(text, find, replace, label):
    if text.count(find) != 1:
        raise SystemExit('%s: expected exactly one occurrence of %r, found %d' % (label, find, text.count(find)))
    return text.replace(find, replace)


def definition(path):
    """Turn a generated Claude Code agent file (front matter + prompt) into an --agents entry."""
    text = Path(path).read_text()
    _, front, body = text.split('---\n', 2)
    fields = {}
    for line in front.splitlines():
        key, _, value = line.partition(':')
        fields[key.strip()] = value.strip().strip("'\"")
    return {'description': fields['description'], 'prompt': body.strip(),
            'tools': READ_ONLY_TOOLS, 'model': fields['model']}


def freeze_agents(old_dir, new_dir):
    AGENTS.mkdir(parents=True, exist_ok=True)
    for role in sorted(set(OLD_ROLE.values())):
        out = AGENTS / ('%s.old.json' % role)
        out.write_text(json.dumps({role: definition(Path(old_dir) / ('%s.md' % role))}, ensure_ascii=False, indent=1))
        print(out.name, sha256(out))
    out = AGENTS / ('%s.new.json' % NEW_ROLE)
    out.write_text(json.dumps({NEW_ROLE: definition(Path(new_dir) / ('%s.md' % NEW_ROLE))}, ensure_ascii=False, indent=1))
    print(out.name, sha256(out))


def candidate(dest, contract_id, version, add_clause=None):
    """Present the seeded contract as an unfrozen candidate so that neither arm reports the edit itself."""
    registry = dest / '.meta_harness/design/registry'
    catalog = json.loads((registry / 'catalog.json').read_text())
    resources = []
    for item in catalog['contracts']:
        c = item['coordinate']
        if c['contract_id'] == contract_id and c['version'] == version:
            item['status'] = 'candidate'
            item.pop('acceptance', None)
            resources = item['resources']
            if add_clause:
                dep = next(d for d in item['dependencies']
                           if d['coordinate']['contract_id'] == add_clause['contract_id']
                           and d['coordinate']['version'] == add_clause['version'])
                dep['clauses'].append(add_clause['add_clause'])
    if not resources:
        raise SystemExit('coordinate not in catalog: %s v%s' % (contract_id, version))
    (registry / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    frozen = json.loads((registry / 'frozen.json').read_text())
    key = next(k for k, v in frozen.items() if isinstance(v, (list, dict)) and k not in ('format', 'baseline_id'))
    if isinstance(frozen[key], dict):
        frozen[key] = {p: h for p, h in frozen[key].items() if p not in resources}
    else:
        frozen[key] = [e for e in frozen[key] if e.get('path') not in resources]
    (registry / 'frozen.json').write_text(json.dumps(frozen, ensure_ascii=False, indent=2) + '\n')


def prepare(mode, dest):
    spec = SEEDS[mode]
    dest.mkdir(parents=True)
    for rel in COPY:
        src = REPO / rel
        if src.is_dir():
            # Raw execution evidence is 378 MB and no review needs it; both arms get the same copy without it.
            subprocess.run(['rsync', '-a', '--exclude', '__pycache__', '--exclude', '/record/evidence/',
                            str(src) + '/', str(dest / rel) + '/'], check=True)
        else:
            (dest / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(str(src), str(dest / rel))
    target = dest / spec['file']
    if mode == 'plan':
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(str(HERE / 'materials' / 'plan-under-review.md'), str(target))
    else:
        text = target.read_text()
        for seed in spec['seeds']:
            if 'find' in seed:
                text = replace_once(text, seed['find'], seed['replace'], seed['id'])
        target.write_text(text)
    if mode == 'expression':
        dep = next(s['catalog_dependency'] for s in spec['seeds'] if 'catalog_dependency' in s)
        candidate(dest, spec['contract_id'], spec['version'], dep)
    subprocess.run(['git', 'init', '-q'], cwd=str(dest), check=True)
    subprocess.run(['git', 'add', '-A'], cwd=str(dest), check=True)
    subprocess.run(['git', '-c', 'user.name=dispatcher', '-c', 'user.email=dispatcher@invalid',
                    'commit', '-qm', 'material under review'], cwd=str(dest), check=True)


def tool_report(dest, spec):
    """The merged role reads a design review report in expression mode; produce it on the seeded copy."""
    out = subprocess.run(
        ['uv', 'run', '--locked', 'python', str(REPO / '.meta_harness/tooling/src/design_review.py'),
         '--root', str(dest / '.meta_harness/design'), '--contract', spec['target']],
        cwd=str(REPO), env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
    if out.returncode != 0:
        raise SystemExit('design review report failed:\n' + out.stdout)
    return out.stdout


def render_brief(mode, arm, dest):
    text = (HERE / 'briefs' / ('%s.md' % mode)).read_text()
    extra = ''
    if arm == 'new':
        extra = (HERE / 'briefs' / '_new-arm.md').read_text().replace('{MODE}', {
            'expression': '表达', 'choice': '选择', 'plan': '计划'}[mode])
        if mode == 'expression':
            extra += '\n## 设计评审报告（派发者在本检出上跑出的原始输出）\n\n```\n%s```\n' % tool_report(dest, SEEDS[mode])
    return text.replace('{WORKDIR}', str(dest)).replace('{ARM_EXTRA}', extra)


def trajectory_stats(path):
    tools, other_tools, result, final = 0, [], None, ''
    for line in path.read_text().splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get('type') == 'assistant':
            for block in event.get('message', {}).get('content', []):
                if block.get('type') == 'tool_use':
                    tools += 1
                    if block.get('name') not in READ_ONLY_TOOLS:
                        other_tools.append(block.get('name'))
        if event.get('type') == 'result':
            result = event
            final = event.get('result') or ''
    return tools, other_tools, result, final


def run(mode, arm, repeat):
    role = NEW_ROLE if arm == 'new' else OLD_ROLE[mode]
    ev = EVIDENCE / mode / ('%s-r%d' % (arm, repeat))
    if (ev / 'run.json').exists():
        raise SystemExit('already recorded: %s' % ev)
    ev.mkdir(parents=True, exist_ok=True)
    dest = WORK / ('%s-%s-r%d-%d' % (mode, arm, repeat, int(time.time()))) / 'workspace'
    prepare(mode, dest)
    before = tree_hash(dest)
    brief = render_brief(mode, arm, dest)
    (ev / 'brief.md').write_text(brief)
    agents = AGENTS / ('%s.%s.json' % (role, arm))
    cmd = ['claude', '-p', '--agents', str(agents), '--agent', role, '--model', MODEL[mode], '--effort', EFFORT,
           '--setting-sources', 'project', '--permission-mode', 'dontAsk',
           '--output-format', 'stream-json', '--verbose', '--max-budget-usd', BUDGET_USD,
           '--no-session-persistence', '--disallowedTools', 'WebFetch', 'WebSearch', 'Agent',
           '--allowedTools'] + READ_ONLY_TOOLS
    started = time.time()
    timed_out = False
    with open(str(ev / 'trajectory.jsonl'), 'w') as out, open(str(ev / 'stderr.log'), 'w') as err:
        p = subprocess.Popen(cmd, cwd=str(dest), stdin=subprocess.PIPE, stdout=out, stderr=err,
                             universal_newlines=True)
        try:
            p.communicate(brief, timeout=WALL_SECONDS)
        except subprocess.TimeoutExpired:
            timed_out = True
            p.kill()
            p.communicate()
    tools, other_tools, result, final = trajectory_stats(ev / 'trajectory.jsonl')
    (ev / 'final.md').write_text(final)
    usage = (result or {}).get('usage', {})
    record = {
        'mode': mode, 'arm': arm, 'role': role, 'repeat': repeat, 'model_id': MODEL[mode], 'effort': EFFORT,
        'models_observed': sorted((result or {}).get('modelUsage', {}).keys()),
        'workdir': str(dest), 'agents_definition_sha256': sha256(agents),
        'brief_sha256': sha256(ev / 'brief.md'), 'trajectory_sha256': sha256(ev / 'trajectory.jsonl'),
        'timed_out': timed_out, 'terminal': (result or {}).get('subtype'), 'is_error': (result or {}).get('is_error'),
        'workspace_unchanged': tree_hash(dest) == before, 'tools_outside_read_only': other_tools,
        'tool_calls': tools, 'wall_ms': int((time.time() - started) * 1000),
        'cost_usd': (result or {}).get('total_cost_usd'),
        'output_tokens': usage.get('output_tokens'), 'final_chars': len(final),
    }
    (ev / 'run.json').write_text(json.dumps(record, ensure_ascii=False, indent=1))
    print(json.dumps(record, ensure_ascii=False))


def summary():
    for path in sorted(EVIDENCE.glob('*/*/run.json')):
        r = json.loads(path.read_text())
        print('%-10s %-3s r%d %-22s %s unchanged=%s other_tools=%s %ss $%s' % (
            r['mode'], r['arm'], r['repeat'], r['role'], r['terminal'], r['workspace_unchanged'],
            r['tools_outside_read_only'], r['wall_ms'] // 1000, r['cost_usd']))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    a = sub.add_parser('agents')
    a.add_argument('old_dir')
    a.add_argument('new_dir')
    p = sub.add_parser('prepare')
    p.add_argument('mode', choices=sorted(SEEDS))
    p.add_argument('dest', type=Path)
    r = sub.add_parser('run')
    r.add_argument('mode', choices=sorted(SEEDS))
    r.add_argument('arm', choices=('old', 'new'))
    r.add_argument('repeat', type=int)
    sub.add_parser('summary')
    args = parser.parse_args()
    if args.command == 'agents':
        freeze_agents(args.old_dir, args.new_dir)
    elif args.command == 'prepare':
        prepare(args.mode, args.dest)
    elif args.command == 'run':
        run(args.mode, args.arm, args.repeat)
    else:
        summary()


if __name__ == '__main__':
    main()
