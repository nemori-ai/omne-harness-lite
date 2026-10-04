#!/usr/bin/env python3
"""One seeded trial of the implementation-reviewer role.

  implrun.py agent GENERATED_MD      freeze the role definition as --agents JSON
  implrun.py prepare DEST            export HEAD, install, build, commit a baseline (skipped when DEST exists),
                                     then apply the seeds on the baseline as a delivery commit
  implrun.py run DEST                run the role once on a prepared checkout and record evidence

Evidence goes to <main checkout>/tmp/implementation-reviewer-trial/. A person judges the final message
against the seed list; nothing here scores the run.
"""

import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parents[3]
MAIN = Path(os.environ.get('EVAL_MAIN_CHECKOUT', str(REPO)))
BASE = Path(os.environ.get('EVAL_BASE', '/data/qiwei/eval-implementation-reviewer'))
AGENT = BASE / 'implementation-reviewer.json'
EVIDENCE = MAIN / 'tmp' / 'implementation-reviewer-trial'
SEEDS = json.loads((HERE / 'suites' / 'implementation-seeds-v1.json').read_text())
ROLE = 'implementation-reviewer'
MODEL = 'claude-fable-5-1'
EFFORT = 'high'
TOOLS = ['Read', 'Glob', 'Grep', 'Bash']
WALL_SECONDS = 75 * 60
BUDGET_USD = '30'
GIT = ['git', '-c', 'user.name=implementer', '-c', 'user.email=implementer@invalid']


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sh(cmd, cwd, **kw):
    return subprocess.run(cmd, cwd=str(cwd), check=True, **kw)


def out(cmd, cwd):
    return subprocess.run(cmd, cwd=str(cwd), check=True, stdout=subprocess.PIPE, universal_newlines=True).stdout.strip()


def replace_once(text, find, replace, label):
    if text.count(find) != 1:
        raise SystemExit('%s: expected exactly one occurrence of %r, found %d' % (label, find, text.count(find)))
    return text.replace(find, replace)


def freeze_agent(generated):
    text = Path(generated).read_text()
    _, front, body = text.split('---\n', 2)
    assert ('name: %s' % ROLE) in front
    BASE.mkdir(parents=True, exist_ok=True)
    AGENT.write_text(json.dumps({ROLE: {
        'description': 'Independent review of one implementation delivery.',
        'prompt': body.strip(), 'tools': TOOLS, 'model': MODEL}}, ensure_ascii=False, indent=1))
    print(AGENT.name, sha256(AGENT), len(body))


def prepare(dest):
    if not (dest / '.git').exists():
        baseline(dest)
    seed(dest)


def baseline(dest):
    dest.mkdir(parents=True)
    archive = subprocess.Popen(['git', 'archive', 'HEAD'], cwd=str(REPO), stdout=subprocess.PIPE)
    sh(['tar', '-x', '-C', str(dest)], dest, stdin=archive.stdout)
    if archive.wait() != 0:
        raise SystemExit('git archive failed')
    # The evaluation directory holds the seed list with its ground truth.
    sh(['rm', '-rf', str(dest / '.meta_harness/agents/evaluation')], dest)
    sh(['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'], dest,
       stdout=subprocess.DEVNULL)
    sh(['pnpm', 'run', 'build'], dest, stdout=subprocess.DEVNULL)
    sh(['git', 'init', '-q'], dest)
    sh(['git', 'symbolic-ref', 'HEAD', 'refs/heads/main'], dest)
    sh(['git', 'add', '-A'], dest)
    sh(GIT + ['commit', '-qm', 'baseline'], dest)


def seed(dest):
    # Re-seeding an existing checkout starts again from its baseline commit.
    sh(['git', 'reset', '-q', '--hard', out(['git', 'rev-list', '--max-parents=0', 'HEAD'], dest)], dest)
    for item in SEEDS['seeds']:
        if 'file' not in item:
            continue
        path = dest / item['file']
        text = path.read_text()
        for edit in item.get('edits', []):
            text = replace_once(text, edit['find'], edit['replace'], item['id'])
        path.write_text(text + item.get('append', ''))
    sh(['git', 'add', '-A'], dest)
    sh(GIT + ['commit', '-qm', 'session-tenancy-table: operator description and file-based reader',
              '-m', 'Harness: claude-code\nAgent-Role: developer'], dest)
    member = dest / SEEDS['member']
    sh(['pnpm', 'run', 'build'], member, stdout=subprocess.DEVNULL)
    test = subprocess.run(['pnpm', 'run', 'test'], cwd=str(member), stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, universal_newlines=True)
    print('member tests exit', test.returncode)
    print('\n'.join(test.stdout.splitlines()[-6:]))
    print('baseline', out(['git', 'rev-parse', 'HEAD~1'], dest), 'delivery', out(['git', 'rev-parse', 'HEAD'], dest))


def trajectory(path):
    tools, names, result, final = 0, {}, None, ''
    for line in path.read_text().splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get('type') == 'assistant':
            for block in event.get('message', {}).get('content', []):
                if block.get('type') == 'tool_use':
                    tools += 1
                    names[block.get('name')] = names.get(block.get('name'), 0) + 1
        if event.get('type') == 'result':
            result = event
            final = event.get('result') or ''
    return tools, names, result, final


def run(dest):
    if (EVIDENCE / 'run.json').exists():
        raise SystemExit('already recorded: %s' % EVIDENCE)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    head, base = out(['git', 'rev-parse', 'HEAD'], dest), out(['git', 'rev-parse', 'HEAD~1'], dest)
    note = (HERE / 'briefs' / 'implementation-delivery-note.md').read_text().strip()
    brief = (HERE / 'briefs' / 'implementation-review.md').read_text()
    for key, value in {'WORKDIR': str(dest), 'BASE': base, 'HEAD': head, 'DELIVERY_NOTE': note}.items():
        brief = brief.replace('{%s}' % key, value)
    (EVIDENCE / 'brief.md').write_text(brief)
    cmd = ['claude', '-p', '--agents', str(AGENT), '--agent', ROLE, '--model', MODEL, '--effort', EFFORT,
           '--setting-sources', 'project', '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
           '--output-format', 'stream-json', '--verbose', '--max-budget-usd', BUDGET_USD,
           '--no-session-persistence', '--disallowedTools', 'WebFetch', 'WebSearch', 'Agent', 'Edit', 'Write',
           '--allowedTools'] + TOOLS
    started = time.time()
    timed_out = False
    with open(str(EVIDENCE / 'trajectory.jsonl'), 'w') as stream, open(str(EVIDENCE / 'stderr.log'), 'w') as err:
        p = subprocess.Popen(cmd, cwd=str(dest), stdin=subprocess.PIPE, stdout=stream, stderr=err,
                             universal_newlines=True)
        try:
            p.communicate(brief, timeout=WALL_SECONDS)
        except subprocess.TimeoutExpired:
            timed_out = True
            p.kill()
            p.communicate()
    tools, names, result, final = trajectory(EVIDENCE / 'trajectory.jsonl')
    (EVIDENCE / 'final.md').write_text(final)
    status = out(['git', 'status', '--porcelain'], dest)
    (EVIDENCE / 'git-status-after.txt').write_text(status + '\n')
    record = {
        'role': ROLE, 'model_id': MODEL, 'effort': EFFORT,
        'models_observed': sorted((result or {}).get('modelUsage', {}).keys()),
        'workdir': str(dest), 'baseline': base, 'delivery': head,
        'agent_definition_sha256': sha256(AGENT), 'brief_sha256': sha256(EVIDENCE / 'brief.md'),
        'trajectory_sha256': sha256(EVIDENCE / 'trajectory.jsonl'),
        'timed_out': timed_out, 'terminal': (result or {}).get('subtype'), 'is_error': (result or {}).get('is_error'),
        'head_unchanged': out(['git', 'rev-parse', 'HEAD'], dest) == head,
        'tracked_files_changed': [l for l in status.splitlines() if not l.startswith('??')],
        'untracked_after': [l for l in status.splitlines() if l.startswith('??')],
        'tool_calls': tools, 'tool_names': names, 'wall_ms': int((time.time() - started) * 1000),
        'cost_usd': (result or {}).get('total_cost_usd'), 'final_chars': len(final),
    }
    (EVIDENCE / 'run.json').write_text(json.dumps(record, ensure_ascii=False, indent=1))
    print(json.dumps(record, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('agent').add_argument('generated')
    sub.add_parser('prepare').add_argument('dest', type=Path)
    sub.add_parser('run').add_argument('dest', type=Path)
    args = parser.parse_args()
    if args.command == 'agent':
        freeze_agent(args.generated)
    elif args.command == 'prepare':
        prepare(args.dest)
    else:
        run(args.dest)


if __name__ == '__main__':
    main()
