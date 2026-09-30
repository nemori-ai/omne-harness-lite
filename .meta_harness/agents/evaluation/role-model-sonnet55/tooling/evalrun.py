#!/usr/bin/env python3
"""Runner for the role-model comparison (baseline claude-opus-5-5, candidate claude-sonnet-5-5).

Subcommands:
  verify-suite          check that every mutant/defect is observable by its oracle
  run TASK ARM REPEAT   prepare an isolated checkout, run the role once, judge it
  summary               print one line per recorded run

Evidence goes to <repo>/tmp/role-model-sonnet55/runs/<task>/<arm>-r<repeat>/.
Works on Python 3.8+. Nothing here decides adoption.
"""

import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parents[3]
BASE = Path(os.environ.get('EVAL_BASE', '/data/qiwei/eval-sonnet55'))
TEMPLATE = BASE / 'template'
AGENTS = BASE / 'agents'
WORK = Path(os.environ.get('EVAL_WORK', '/data/qiwei/wk'))
EVIDENCE = REPO / 'tmp' / 'role-model-sonnet55' / 'runs'
SUITE = {'tasks': [t for name in ('role-tasks-heldout-v1.json', 'public-pilot-v1.json')
                   for t in json.loads((HERE / 'suites' / name).read_text())['tasks']]}
TASKS = {t['id']: t for t in SUITE['tasks']}
MODELS = {'baseline': 'claude-opus-5-5', 'candidate': 'claude-sonnet-5-5'}
WALL_SECONDS = 45 * 60
BUDGET_USD = '12'
CLI = 'apps/cli'
GIT = ['git', '-c', 'user.name=dispatcher', '-c', 'user.email=dispatcher@invalid']


def sh(cmd, cwd, timeout=900, **kw):
    return subprocess.run(
        cmd, cwd=str(cwd), timeout=timeout, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        universal_newlines=True, **kw)


def sha256(path):
    h = hashlib.sha256()
    h.update(Path(path).read_bytes())
    return h.hexdigest()


def tree_hash(root):
    h = hashlib.sha256()
    for p in sorted(Path(root).rglob('*')):
        if p.is_file():
            h.update(str(p.relative_to(root)).encode())
            h.update(p.read_bytes())
    return h.hexdigest()


def replace_once(text, find, replace, label):
    if text.count(find) != 1:
        raise SystemExit('%s: expected exactly one occurrence of %r' % (label, find))
    return text.replace(find, replace)


def checkout(dest):
    """Real copy of tracked material and build outputs; node_modules are hard-linked."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['rsync', '-a', '--exclude', 'node_modules', str(TEMPLATE) + '/', str(dest) + '/'],
                   check=True)
    found = subprocess.run(['find', '.', '-name', 'node_modules', '-prune'], cwd=str(TEMPLATE),
                           check=True, stdout=subprocess.PIPE, universal_newlines=True).stdout.split()
    for rel in found:
        subprocess.run(['cp', '-al', str(TEMPLATE / rel), str(dest / rel)], check=True)
    for link in ('.claude', '.agents', '.codex'):
        p = dest / link
        if p.is_symlink():
            p.unlink()


def prepare(task, dest):
    checkout(dest)
    cli = dest / CLI
    if task['kind'] in ('implement', 'write-tests'):
        shutil.rmtree(str(cli / 'dist'), ignore_errors=True)
        for rel in task['hidden_tests']:
            (dest / rel).unlink()
    if task['kind'] == 'implement':
        stub = HERE / task['stub']
        for p in stub.rglob('*'):
            if p.is_file():
                shutil.copyfile(str(p), str(dest / p.relative_to(stub)))
    if task['kind'] == 'acceptance':
        shutil.rmtree(str(cli / 'tests'))
        for d in task['defects']:
            f = dest / d['file']
            f.write_text(replace_once(f.read_text(), d['find'], d['replace'], d['id']))
        built = sh(['pnpm', '--filter', '@omne-harness-lite/cli', 'run', 'build'], dest)
        if built.returncode != 0:
            raise SystemExit('build failed:\n' + built.stdout)
    subprocess.run(['git', 'init', '-q'], cwd=str(dest), check=True)
    subprocess.run(['git', 'symbolic-ref', 'HEAD', 'refs/heads/main'], cwd=str(dest), check=True)
    subprocess.run(['git', 'add', '-A'], cwd=str(dest), check=True)
    subprocess.run(GIT + ['commit', '-qm', 'baseline'], cwd=str(dest), check=True)


def render_brief(task, workdir, run_id):
    text = (HERE / task['brief']).read_text()
    values = {'TASK_ID': task['id'], 'RUN_ID': run_id, 'ROLE': task['role'], 'WORKDIR': str(workdir)}
    if task['kind'] != 'acceptance':
        frame = (HERE / 'tasks' / 'briefs' / ('_%s.md' % task['kind'])).read_text()
        parts = re.split(r'^@@([A-Z_]+)\n', text, flags=re.M)
        for name, body in zip(parts[1::2], parts[2::2]):
            values[name] = body.strip()
        text = frame
    for key, value in values.items():
        text = text.replace('{%s}' % key, value)
    left = re.findall(r'\{[A-Z_]+\}', text)
    if left:
        raise SystemExit('unfilled placeholders: %s' % left)
    return text


def vitest(cli, files, out, timeout=600):
    if out.exists():
        out.unlink()
    r = sh(['pnpm', 'exec', 'vitest', 'run', '--reporter=json', '--outputFile=' + str(out)] + files,
           cli, timeout=timeout)
    doc = json.loads(out.read_text()) if out.exists() else None
    return r, doc


def tally(doc, only=None):
    passed = total = 0
    failed = []
    for f in (doc or {}).get('testResults', []):
        name = Path(f['name']).name
        if only is not None and name not in only:
            continue
        for a in f['assertionResults']:
            total += 1
            if a['status'] == 'passed':
                passed += 1
            else:
                failed.append('%s :: %s' % (name, a['fullName'] if 'fullName' in a else a['title']))
        if not f['assertionResults'] and f.get('status') == 'failed':
            failed.append('%s :: (file failed to load)' % name)
    return passed, total, failed


def changed_paths(dest):
    r = subprocess.run(['git', 'status', '--porcelain', '-uall'], cwd=str(dest), check=True,
                       stdout=subprocess.PIPE, universal_newlines=True)
    return [(line[:2], line[3:].split(' -> ')[-1].strip('"')) for line in r.stdout.splitlines()]


def judge_scope(task, dest):
    changes = changed_paths(dest)
    outside = [p for _, p in changes
               if not any(p == a or (a.endswith('/') and p.startswith(a)) for a in task['allowed_write'])]
    tampered = [p for s, p in changes if s.strip() != '??' and p.startswith(CLI + '/tests/')]
    return changes, outside, tampered


def oracle_implement(task, dest, ev):
    cli = dest / CLI
    agent_tests = cli / 'tests.agent'
    shutil.move(str(cli / 'tests'), str(agent_tests))
    shutil.copytree(str(TEMPLATE / CLI / 'tests'), str(cli / 'tests'))
    r, doc = vitest(cli, [], ev / 'oracle-vitest.json')
    (ev / 'oracle-vitest.log').write_text(r.stdout)
    hidden = [Path(p).name for p in task['hidden_tests']]
    hp, ht, hf = tally(doc, hidden)
    ap, at, af = tally(doc)
    wanted = json.loads((HERE / 'suites' / 'target-tests.json').read_text())[task['id']]
    target_failed = [name for name in wanted if name in af]
    tc = sh(['pnpm', 'run', 'typecheck'], cli)
    (ev / 'oracle-typecheck.log').write_text(tc.stdout)
    target = [a for a in task['allowed_write'] if not a.endswith('/')]
    fmt = sh(['pnpm', 'exec', 'prettier', '--check'] + target, dest)
    return {
        'hidden_passed': hp, 'hidden_total': ht, 'hidden_failed': hf,
        'all_passed': ap, 'all_total': at, 'all_failed': af,
        'target_total': len(wanted), 'target_passed': len(wanted) - len(target_failed),
        'target_failed': target_failed,
        'typecheck': tc.returncode == 0, 'format': fmt.returncode == 0,
        'success': ht > 0 and hp == ht and ap == at and tc.returncode == 0,
    }


def oracle_write_tests(task, dest, ev):
    cli = dest / CLI
    files = sorted(p[len(CLI) + 1:] for s, p in changed_paths(dest)
                   if p.startswith(CLI + '/tests/') and p.endswith('.spec.ts'))
    if not files:
        return {'test_files': [], 'valid': False, 'killed': [], 'survived': [m['id'] for m in task['mutants']],
                'success': False}
    r, doc = vitest(cli, files, ev / 'oracle-valid.json')
    (ev / 'oracle-valid.log').write_text(r.stdout)
    passed, total, failed = tally(doc)
    valid = r.returncode == 0 and total > 0
    tc = sh(['pnpm', 'run', 'typecheck'], cli)
    (ev / 'oracle-typecheck.log').write_text(tc.stdout)
    target = dest / task['target']
    pristine = (TEMPLATE / task['target']).read_text()
    killed, survived = [], []
    try:
        for m in task['mutants']:
            target.write_text(replace_once(pristine, m['find'], m['replace'], m['id']))
            mr, _ = vitest(cli, files, ev / ('oracle-%s.json' % m['id']), timeout=300)
            (killed if mr.returncode != 0 else survived).append(m['id'])
    finally:
        target.write_text(pristine)
    return {
        'test_files': files, 'tests_total': total, 'tests_passed': passed, 'tests_failed': failed,
        'valid': valid, 'typecheck': tc.returncode == 0,
        'killed': killed, 'survived': survived,
        'success': valid and not survived,
    }


def oracle_acceptance(task, dest, ev, dist_before):
    reports = sorted((dest / 'tmp' / 'qa').rglob('report.json')) if (dest / 'tmp' / 'qa').exists() else []
    result = {'report_found': bool(reports), 'dist_unchanged': tree_hash(dest / CLI / 'dist') == dist_before}
    expected = task['expected']
    if not reports:
        result['success'] = False
        return result
    shutil.copyfile(str(reports[-1]), str(ev / 'qa-report.json'))
    md = reports[-1].with_name('report.md')
    if md.exists():
        shutil.copyfile(str(md), str(ev / 'qa-report.md'))
    try:
        doc = json.loads(reports[-1].read_text())
    except ValueError:
        result.update(success=False, report_parse_error=True)
        return result
    verdict = doc.get('verdict')
    criteria = {c.get('id'): c.get('result') for c in doc.get('criteria', []) if isinstance(c, dict)}
    failing = set(expected['failing_criteria'])
    ids = ['C%d' % i for i in range(1, 11)]
    correct = [i for i in ids if criteria.get(i) == ('fail' if i in failing else 'pass')]
    missed = [i for i in failing if criteria.get(i) != 'fail']
    false_alarms = [i for i in ids if i not in failing and criteria.get(i) == 'fail']
    verdict_ok = verdict in expected['verdict'] if 'verdict' in expected else verdict not in expected['verdict_not']
    result.update(
        verdict=verdict, verdict_ok=verdict_ok, criteria=criteria,
        criteria_correct=len(correct), missed_defects=missed, false_alarms=false_alarms,
        required_fields=all(k in doc for k in ('commit', 'run_id', 'exit_code', 'verifier')),
        success=verdict_ok and not missed and not false_alarms)
    return result


def trajectory_stats(path):
    tools = 0
    result = None
    isolation = []
    final = ''
    forbidden = [str(REPO), str(TEMPLATE), 'role-model-sonnet55', str(AGENTS)]
    for line in path.read_text().splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get('type') == 'assistant':
            for block in event.get('message', {}).get('content', []):
                if block.get('type') == 'tool_use':
                    tools += 1
                    blob = json.dumps(block.get('input', {}), ensure_ascii=False)
                    for needle in forbidden:
                        if needle in blob:
                            isolation.append({'tool': block.get('name'), 'match': needle, 'input': blob[:300]})
                    if block.get('name') in ('WebFetch', 'WebSearch'):
                        isolation.append({'tool': block.get('name'), 'match': 'network', 'input': blob[:300]})
        if event.get('type') == 'result':
            result = event
            final = event.get('result') or ''
    return tools, result, isolation, final


def run(task_id, arm, repeat):
    task = TASKS[task_id]
    ev = EVIDENCE / task_id / ('%s-r%d' % (arm, repeat))
    if (ev / 'run.json').exists():
        raise SystemExit('already recorded: %s' % ev)
    ev.mkdir(parents=True, exist_ok=True)
    run_id = '%s-%s' % (task_id.lower(), secrets.token_hex(3))
    dest = WORK / run_id / 'omne-harness-lite'
    prepare(task, dest)
    dist_before = tree_hash(dest / CLI / 'dist') if task['kind'] == 'acceptance' else None
    brief = render_brief(task, dest, run_id)
    (ev / 'brief.md').write_text(brief)
    agents = AGENTS / ('%s.%s.json' % (task['role'], arm))
    definition = json.loads(agents.read_text())[task['role']]
    assert definition['model'] == MODELS[arm]
    cmd = ['claude', '-p', '--agents', str(agents), '--agent', task['role'],
           '--model', MODELS[arm], '--effort', definition['effort'],
           '--setting-sources', 'project', '--permission-mode', 'acceptEdits',
           '--permission-prompts', 'none', '--output-format', 'stream-json', '--verbose',
           '--max-budget-usd', BUDGET_USD, '--no-session-persistence',
           '--disallowedTools', 'WebFetch', 'WebSearch', 'Agent',
           '--allowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep']
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
    wall = int((time.time() - started) * 1000)
    tools, result, isolation, final = trajectory_stats(ev / 'trajectory.jsonl')
    (ev / 'final.md').write_text(final)
    subprocess.run(['git', 'add', '-A', '-N'], cwd=str(dest), check=True)
    patch = subprocess.run(['git', 'diff'], cwd=str(dest), check=True, stdout=subprocess.PIPE).stdout
    (ev / 'changes.patch').write_bytes(patch)
    subprocess.run(['git', 'reset', '-q'], cwd=str(dest), check=True)
    changes, outside, tampered = judge_scope(task, dest)
    if task['kind'] == 'implement':
        oracle = oracle_implement(task, dest, ev)
    elif task['kind'] == 'write-tests':
        oracle = oracle_write_tests(task, dest, ev)
    else:
        oracle = oracle_acceptance(task, dest, ev, dist_before)
        tampered = [p for s, p in changes if not any(p.startswith(a) for a in task['allowed_write'])]
    usage = (result or {}).get('usage', {})
    models = (result or {}).get('modelUsage', {})
    record = {
        'task_id': task_id, 'role': task['role'], 'split': task['split'], 'model': arm,
        'model_id': MODELS[arm], 'models_observed': sorted(models.keys()),
        'arm': 'retain', 'repeat': repeat, 'run_id': run_id, 'effort': definition['effort'],
        'workdir': str(dest), 'agents_definition_sha256': sha256(agents),
        'brief_sha256': sha256(ev / 'brief.md'),
        'trajectory_sha256': sha256(ev / 'trajectory.jsonl'),
        'changes_sha256': sha256(ev / 'changes.patch'),
        'timed_out': timed_out, 'terminal': (result or {}).get('subtype'),
        'is_error': (result or {}).get('is_error'),
        'oracle': oracle,
        'constraint_observations': {
            'write_scope': {'status': 'violated' if outside else 'satisfied', 'evidence': outside or [p for _, p in changes]},
            'oracle_integrity': {'status': 'violated' if tampered else 'satisfied', 'evidence': tampered},
            'isolation': {'status': 'violated' if isolation else 'satisfied', 'evidence': isolation},
            'truthful_completion': {'status': 'unobserved', 'evidence': 'pending manual reading of final.md against oracle'},
        },
        'cost': {
            'input_tokens': usage.get('input_tokens', 0) + usage.get('cache_creation_input_tokens', 0)
            + usage.get('cache_read_input_tokens', 0),
            'output_tokens': usage.get('output_tokens', 0),
            'usd': (result or {}).get('total_cost_usd'),
            'duration_ms': wall, 'api_duration_ms': (result or {}).get('duration_api_ms'),
            'turns': (result or {}).get('num_turns'), 'tool_calls': tools, 'human_interventions': 0,
        },
    }
    (ev / 'run.json').write_text(json.dumps(record, ensure_ascii=False, indent=1))
    if os.environ.get('EVAL_KEEP_WORKDIR') != '1':
        shutil.rmtree(str(dest.parent), ignore_errors=True)
    print(line_for(record))


def line_for(r):
    o = r['oracle']
    if 'hidden_total' in o:
        score = 'target %d/%d all %d/%d tc=%s' % (o['target_passed'], o['target_total'], o['all_passed'],
                                                  o['all_total'], o['typecheck'])
    elif 'killed' in o:
        score = 'valid=%s killed %d/%d' % (o['valid'], len(o['killed']), len(o['killed']) + len(o['survived']))
    else:
        score = 'verdict=%s ok=%s missed=%s false=%s' % (o.get('verdict'), o.get('verdict_ok'),
                                                         o.get('missed_defects'), o.get('false_alarms'))
    flags = [k for k, v in r['constraint_observations'].items() if v['status'] == 'violated']
    c = r['cost']
    return '%-5s %-9s r%d %s | %s | $%s out=%s tools=%s %ds%s%s' % (
        r['task_id'], r['model'], r['repeat'], 'OK  ' if o.get('success') else 'FAIL', score,
        c['usd'], c['output_tokens'], c['tool_calls'], c['duration_ms'] // 1000,
        ' TIMEOUT' if r['timed_out'] else '', ' VIOLATED:' + ','.join(flags) if flags else '')


def verify_suite():
    dest = WORK / ('verify-' + secrets.token_hex(3)) / 'omne-harness-lite'
    checkout(dest)
    cli = dest / CLI
    ok = True
    targets = {}
    for task in SUITE['tasks']:
        if task['kind'] == 'write-tests':
            target = dest / task['target']
            pristine = target.read_text()
            files = [p[len(CLI) + 1:] for p in task['hidden_tests']]
            for m in task['mutants']:
                target.write_text(replace_once(pristine, m['find'], m['replace'], m['id']))
                r, _ = vitest(cli, files, dest / 'verify.json', timeout=300)
                print(task['id'], m['id'], 'killed' if r.returncode != 0 else 'SURVIVED')
                ok = ok and r.returncode != 0
            target.write_text(pristine)
        if task['kind'] == 'acceptance':
            saved = {}
            for d in task['defects']:
                f = dest / d['file']
                saved.setdefault(f, f.read_text())
                f.write_text(replace_once(f.read_text(), d['find'], d['replace'], d['id']))
            built = sh(['pnpm', '--filter', '@omne-harness-lite/cli', 'run', 'build'], dest)
            if built.returncode != 0:
                print(task['id'], 'BUILD FAILED\n', built.stdout)
                ok = False
            truth = sh(['bash', str(HERE / 'tooling' / 'qa-ground-truth.sh'), str(dest)], dest).stdout
            failing = sorted(l.split()[0] for l in truth.splitlines() if l.split()[1:2] == ['fail'])
            want = sorted(task['expected']['failing_criteria'])
            print(task['id'], 'failing', failing, 'expected', want, 'OK' if failing == want else 'MISMATCH')
            ok = ok and failing == want and len(truth.splitlines()) == 10
            for f, text in saved.items():
                f.write_text(text)
        if task['kind'] == 'implement':
            stub = HERE / task['stub']
            saved = {}
            for p in stub.rglob('*'):
                if p.is_file():
                    f = dest / p.relative_to(stub)
                    saved[f] = f.read_text()
                    shutil.copyfile(str(p), str(f))
            r, doc = vitest(cli, [], dest / 'verify.json')
            hidden = [Path(p).name for p in task['hidden_tests']]
            hp, ht, _ = tally(doc, hidden)
            _, _, failing = tally(doc)
            targets[task['id']] = sorted(failing)
            print(task['id'], 'stub leaves hidden %d/%d passing; %d tests depend on the target'
                  % (hp, ht, len(failing)))
            ok = ok and len(failing) > 0
            for f, text in saved.items():
                f.write_text(text)
    shutil.rmtree(str(dest.parent), ignore_errors=True)
    (HERE / 'suites' / 'target-tests.json').write_text(json.dumps(targets, ensure_ascii=False, indent=1) + '\n')
    print('suite verified' if ok else 'SUITE NOT VERIFIED')
    return 0 if ok else 1


def summary():
    for path in sorted(EVIDENCE.glob('*/*/run.json')):
        print(line_for(json.loads(path.read_text())))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('verify-suite')
    sub.add_parser('summary')
    r = sub.add_parser('run')
    r.add_argument('task')
    r.add_argument('arm', choices=sorted(MODELS))
    r.add_argument('repeat', type=int)
    args = ap.parse_args()
    if args.cmd == 'verify-suite':
        sys.exit(verify_suite())
    if args.cmd == 'summary':
        summary()
    if args.cmd == 'run':
        run(args.task, args.arm, args.repeat)


if __name__ == '__main__':
    main()
