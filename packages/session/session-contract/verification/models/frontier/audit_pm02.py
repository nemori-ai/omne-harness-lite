#!/usr/bin/env python3
"""Check the concrete B1 trace independently of the passive phase monitor."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re

BASE = Path(__file__).resolve().parent
WITNESS = 'witness-pm02-frozen-accept-race'
NEGATIVE = 'negative-pm02-frozen-stale-root'


def value(text):
    text = text.strip()
    if text in {'TRUE', 'FALSE'}:
        return text == 'TRUE'
    if text.startswith('"'):
        return json.loads(text)
    if text.startswith('<<'):
        return [int(x.strip()) for x in text[2:-2].split(',')]
    if text.startswith('{'):
        return {int(x.strip()) for x in text[1:-1].split(',') if x.strip()}
    if '..' in text:
        lo, hi = map(int, text.split('..'))
        return set(range(lo, hi + 1))
    return int(text)


def record(text):
    parts = re.split(r',\s*(?=\w+\s*\|->)', text.strip()[1:-1])
    return {key.strip(): value(val) for key, val in (p.split('|->', 1) for p in parts)}


def parse(log):
    headers = list(re.finditer(r'^State (\d+): <([^>]+)>\n', log, re.MULTILINE))
    states = []
    for i, header in enumerate(headers):
        end = headers[i + 1].start() if i + 1 < len(headers) else len(log)
        body = log[header.end():end]
        state = re.search(r'/\\ s = (\[.*?\])\n/\\ prep = (<<.*?>>)', body, re.DOTALL)
        assert state, 'Missing state body'
        states.append({'action': header[2].split(' line ')[0],
                       'line': log[:header.start()].count('\n') + 1,
                       's': record(state[1]),
                       'prep': [record(p) for p in re.findall(r'\[[^\]]+\]', state[2])]})
    return states


def common(states, actions):
    assert [s['action'] for s in states] == actions
    for row in states[:-1]:
        s = row['s']
        assert s['run'] == 'active' and not s['truth']
        assert s['release'] == [0, 0, 0] and s['se35'] == s['terminalCount'] == s['published'] == 0
    final = states[-1]['s']
    assert final['run'] == 'failed' and final['truth'] and final['original'] == 'invalid'
    assert final['se35'] == final['terminalCount'] == final['published'] == 1
    assert final['release'][0] == 0 and final['taken'] == set()
    assert final['beforeFrozen'] and final['beforePending'] == {1, 2, 3}
    assert all(s['s']['invokeCount'] <= 1 and not s['s']['executionCreated'] for s in states)


def expansion(before, after, worker):
    assert before['s']['frozen'] and after['s']['frozen']
    assert before['s']['pending'] == before['s']['accepted'] == {1, 2}
    assert after['s']['pending'] == after['s']['accepted'] == {1, 2, 3}
    assert after['s']['root'] == before['s']['root'] + 1
    assert before['prep'] == after['prep']
    prepared = after['prep'][worker]
    assert prepared['frozen'] and prepared['stage'] == 'ready'
    assert prepared['pending'] == {1, 2} and prepared['root'] == before['s']['root']


def witness(states):
    common(states, ['Initial predicate', 'InvokeReject', 'Freeze', 'Prepare',
                    'Accept', 'Conflict', 'Prepare', 'Publish'])
    assert not states[1]['s']['frozen'] and states[1]['s']['rejectKnown']
    assert states[2]['s']['frozen'] and states[2]['s']['root'] == states[1]['s']['root'] + 1
    worker, = [i for i, p in enumerate(states[3]['prep']) if p['stage'] == 'ready']
    expansion(states[3], states[4], worker)
    assert states[5]['s']['root'] == states[4]['s']['root']
    assert states[5]['s']['pending'] == {1, 2, 3} and states[5]['prep'][worker]['stage'] == 'idle'
    assert states[6]['prep'][worker] == dict(stage='ready', root=states[6]['s']['root'],
                                           pending={1, 2, 3}, frozen=True)
    assert states[7]['prep'][worker]['stage'] == 'done'
    assert states[7]['s']['pending'] == set() and states[7]['s']['release'] == [0, 1, 1]
    assert states[7]['s']['root'] == states[6]['s']['root'] + 1


def negative(states):
    common(states, ['Initial predicate', 'InvokeReject', 'Prepare', 'Accept', 'Publish'])
    assert all(s['s']['frozen'] for s in states)
    worker, = [i for i, p in enumerate(states[2]['prep']) if p['stage'] == 'ready']
    expansion(states[2], states[3], worker)
    assert states[3]['prep'][worker]['root'] != states[3]['s']['root']
    assert states[4]['s']['pending'] == {3} and states[4]['s']['release'] == [0, 1, 0]
    assert states[4]['prep'][worker]['stage'] == 'done'


def rejected(check, states):
    try:
        check(states)
    except (AssertionError, KeyError, ValueError):
        return True
    return False


def arguments():
    if not __debug__:
        raise SystemExit("Audit requires Python assertions; do not use -O or PYTHONOPTIMIZE")
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if BASE == args.output.resolve().parent or BASE in args.output.resolve().parents:
        parser.error('output must be outside the model resource directory')
    return args


def load_fixture():
    def decode(item):
        if isinstance(item, dict):
            if set(item) == {'$set'}:
                return set(item['$set'])
            return {key: decode(value) for key, value in item.items()}
        if isinstance(item, list):
            return [decode(value) for value in item]
        return item
    return decode(json.loads((BASE / 'fixtures/pm02-rejected-traces.json').read_text()))


def main():
    args = arguments()
    run = args.run.resolve()
    paths = {name: run / name / 'tlc.log' for name in [WITNESS, NEGATIVE]}
    parsed = {name: parse(p.read_text()) for name, p in paths.items()}
    witness(parsed[WITNESS])
    negative(parsed[NEGATIVE])
    old_rows = load_fixture()
    checks = [{'case': 'reject-r2-prepare-accept-freeze-witness',
               'pass': rejected(witness, old_rows['witness-pm02-race'])},
              {'case': 'reject-r2-prepare-freeze-stale-negative',
               'pass': rejected(negative, old_rows['negative-pm02-stale-root'])}]
    mutations = [
        ('missing-accept-state', WITNESS, witness, lambda x: x.pop(4)),
        ('accept-before-freeze', WITNESS, witness, lambda x: x[3]['s'].update(frozen=False)),
        ('first-input-se38', WITNESS, witness, lambda x: x[-1]['s'].update(release=[1, 1, 1])),
        ('new-input-not-released', WITNESS, witness, lambda x: x[-1]['s'].update(release=[0, 1, 0])),
        ('new-input-still-pending', WITNESS, witness, lambda x: x[-1]['s'].update(pending={3})),
        ('second-publication', WITNESS, witness, lambda x: x[-1]['s'].update(published=2)),
        ('negative-without-omission', NEGATIVE, negative, lambda x: x[-1]['s'].update(pending=set())),
        ('negative-without-root-change', NEGATIVE, negative, lambda x: x[3]['s'].update(root=x[2]['s']['root'])),
    ]
    for name, source, check, mutate in mutations:
        changed = copy.deepcopy(parsed[source])
        mutate(changed)
        checks.append({'case': name, 'pass': rejected(check, changed)})
    assert all(c['pass'] for c in checks)
    report = {'trace_checks_pass': True, 'selftests': checks,
              'phase_monitor_not_used_as_oracle': True,
              'traces': {name: {'path': str(paths[name]),
                                'sha256': hashlib.sha256(paths[name].read_bytes()).hexdigest(),
                                'states': states} for name, states in parsed.items()}}
    args.output.open('x').write(json.dumps(report, indent=2, default=sorted) + '\n')
    print(json.dumps({'actual_traces_checked': len(parsed), 'false-success_controls': len(checks)}))


if __name__ == '__main__':
    main()
