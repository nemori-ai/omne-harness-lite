#!/usr/bin/env python3
"""Validate B2 from concrete actions and values, never from watch fields."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re

BASE = Path(__file__).resolve().parent
TOKEN = re.compile(r'\s*("(?:[^"\\]|\\.)*"|\|->|<<|>>|\.\.|[\[\]{},]|-?\d+|[A-Za-z_]\w*)')


def value(text):
    tokens = []
    pos = 0
    while match := TOKEN.match(text, pos):
        tokens.append(match[1])
        pos = match.end()
    cursor = 0

    def parse():
        nonlocal cursor
        item = tokens[cursor]
        cursor += 1
        if item in ('[', '{', '<<'):
            end = {'[': ']', '{': '}', '<<': '>>'}[item]
            result = {} if item == '[' else []
            while tokens[cursor] != end:
                if item == '[':
                    key = tokens[cursor]
                    cursor += 1
                    assert tokens[cursor] == '|->'
                    cursor += 1
                    result[key] = parse()
                else:
                    result.append(parse())
                if tokens[cursor] != end:
                    assert tokens[cursor] == ','
                    cursor += 1
            cursor += 1
            if item == '<<':
                return tuple(result)
            if item == '{':
                return result if any(isinstance(x, dict) for x in result) else set(result)
            return result
        if item.startswith('"'):
            return json.loads(item)
        if item in ('TRUE', 'FALSE'):
            return item == 'TRUE'
        result = int(item)
        if cursor < len(tokens) and tokens[cursor] == '..':
            cursor += 1
            hi = int(tokens[cursor])
            cursor += 1
            return set(range(result, hi + 1))
        return result
    return parse()


def parse(log):
    headers = list(re.finditer(r'^State (\d+): <([^>]+)>\n', log, re.MULTILINE))
    states = []
    for i, header in enumerate(headers):
        end = headers[i + 1].start() if i + 1 < len(headers) else len(log)
        body = log[header.end():end]
        variables = list(re.finditer(r'^/\\ (\w+) = ', body, re.MULTILINE))
        row = dict(action=header[2].split(' line ')[0], line=log[:header.start()].count('\n') + 1)
        for j, var in enumerate(variables):
            stop = variables[j + 1].start() if j + 1 < len(variables) else len(body)
            if var[1] != 'watch':
                row[var[1]] = value(body[var.end():stop])
        assert all(k in row for k in ('s', 'p', 'take', 'normal'))
        states.append(row)
    assert len(states) >= 2
    return states


def next_action(rows, action, after=0, predicate=lambda r: True):
    return next(i for i in range(after + 1, len(rows)) if rows[i]['action'] == action and predicate(rows[i]))


def taken(raw):
    return set().union(*(event['batch'] for event in raw))


def common(rows):
    assert rows[0]['s']['accepted'] == {1}
    assert rows[0]['s']['admissions'] == {1} and len(rows[0]['s']['raw']) == 2
    assert rows[0]['s']['raw'][1]['kind'] == 'effect'
    assert all(r['s']['frozen'] for r in rows)
    assert all(r['s']['active'] and r['s']['grant'] and not r['s']['done'] for r in rows[:-1])
    assert all(r['s']['release'] == (0, 0) for r in rows[:-1])
    final, before = rows[-1]['s'], rows[-2]['s']
    assert rows[-1]['action'] == 'PublishRelease'
    assert final['run'] == 'cancelled' and not final['grant'] and not final['active']
    assert final['root'] == before['root'] + 1


def chain(rows, was_taken):
    common(rows)
    capture = next_action(rows, 'Capture')
    directory = next_action(rows, 'ReadDirectory', capture)
    ready = next_action(rows, 'DirectoryReady', directory)
    assert rows[directory]['p']['dirs'] == {1}
    assert rows[capture]['p']['q'] == {1} and rows[capture]['p']['limit'] == 2
    assert rows[ready]['p']['es'] == {1} and rows[ready]['p']['rels'] == {(1, 1)}
    accept = next_action(rows, 'Accept', ready)
    assert rows[accept]['s']['accepted'] == {1, 2} and rows[accept]['s']['pending'] == {1, 2}
    assert rows[accept]['p'] == rows[accept - 1]['p']
    admit = next_action(rows, 'Admit', accept)
    assert rows[admit]['s']['admissions'] == {1, 2} and rows[admit]['s']['rels'] == {(1, 1), (2, 1)}
    assert rows[admit]['s']['root'] == rows[admit - 1]['s']['root'] + 1
    assert all(r['s']['se35'] == set() for r in rows)
    after = admit
    if was_taken:
        prepare = next_action(rows, 'PrepareTake', admit)
        after = next_action(rows, 'PublishTake', prepare)
        assert 2 in taken(rows[after]['s']['raw']) and rows[after]['s']['pending'] == {1, 2}
        assert rows[after]['s']['se14'] == set() and rows[after]['take']['stage'] == 'idle'
    first = next_action(rows, 'PublishPrefix', after, lambda r: r['s']['cursor'] == 1)
    assert rows[first]['s']['pending'] == {2} and rows[first]['p']['limit'] == 2
    assert rows[first]['p']['raw'] == rows[capture]['p']['raw']
    assert rows[first]['s']['effects'] == {1} and 2 not in rows[first]['s']['effects']
    assert rows[first]['s']['root'] == rows[first - 1]['s']['root'] + 1
    tail = next_action(rows, 'PublishPrefix', first, lambda r: r['s']['cursor'] == 2)
    assert {1, 2} <= rows[tail]['s']['effects']
    refresh = next_action(rows, 'Refresh', tail)
    assert rows[refresh]['p']['stage'] == 'idle'
    recapture = next_action(rows, 'Capture', refresh)
    assert rows[recapture]['p']['q'] == {2}
    assert rows[recapture]['p']['root'] == rows[recapture]['s']['root']
    assert rows[recapture]['p']['limit'] == (3 if was_taken else 2)
    final, before = rows[-1]['s'], rows[-2]
    assert before['p']['root'] == before['s']['root']
    assert final['release'] == ((0, 0) if was_taken else (0, 1)) and final['pending'] == set()
    assert final['audit'][0]['expected'] == final['audit'][0]['actual'] == before['s']['pending']
    assert final['audit'][0]['covered']
    if was_taken:
        assert 3 in final['se14'] and 3 in final['effects']
    else:
        assert 2 not in taken(final['raw']) and 2 in final['admissions']
    return dict(capture=rows[capture]['line'], directory_ready=rows[ready]['line'], accept=rows[accept]['line'],
                admit=rows[admit]['line'], old_prefix=rows[first]['line'], old_tail=rows[tail]['line'],
                refresh=rows[refresh]['line'], recapture=rows[recapture]['line'], final=rows[-1]['line'])


def old_root(rows):
    common(rows)
    accept = next_action(rows, 'Accept')
    assert rows[accept - 1]['p']['stage'] == 'ready'
    assert rows[accept]['s']['pending'] == {2} and rows[accept]['p']['q'] == set()
    assert rows[-2]['p']['root'] != rows[-2]['s']['root']
    assert not rows[-1]['s']['audit'][0]['covered']
    return dict(accept=rows[accept]['line'], final=rows[-1]['line'])


def old_coverage(rows):
    common(rows)
    accept = next_action(rows, 'Accept')
    admit = next_action(rows, 'Admit', accept)
    take = next_action(rows, 'PublishTake', admit)
    refresh = next_action(rows, 'Refresh', take)
    before = rows[-2]
    assert before['p']['root'] == before['s']['root']
    assert before['p']['limit'] == 2 and len(before['s']['raw']) == 3
    assert 2 in taken(before['s']['raw']) and before['s']['pending'] == {2}
    assert rows[-1]['s']['release'] == (0, 1) and not rows[-1]['s']['audit'][0]['covered']
    return dict(accept=rows[accept]['line'], admit=rows[admit]['line'], taken=rows[take]['line'],
                refresh=rows[refresh]['line'], final=rows[-1]['line'])


def dropped_tail(rows):
    prefix = next_action(rows, 'PublishPrefix')
    assert rows[prefix]['s']['cursor'] == 1 and rows[prefix]['p']['limit'] == 2
    assert rows[prefix]['p']['q'] - rows[prefix]['s']['pending'] == {1}
    assert rows[-1]['action'] == 'Refresh' and 2 not in rows[-1]['s']['effects']
    return dict(prefix=rows[prefix]['line'], dropped=rows[-1]['line'])


def final_agent(rows):
    take = next_action(rows, 'PublishTake', predicate=lambda r: r['p']['stage'] == 'ready')
    assert rows[take - 1]['p']['root'] == rows[take - 1]['s']['root'] == rows[take - 1]['take']['root']
    assert rows[take]['p']['root'] != rows[take]['s']['root']
    conflict = next_action(rows, 'FinalConflict', take)
    assert rows[conflict]['s'] == rows[conflict - 1]['s']
    assert rows[-1]['s']['release'] == (0, 0) and 3 in rows[-1]['s']['se14']
    return dict(taken=rows[take]['line'], conflict=rows[conflict]['line'], final=rows[-1]['line'])


def final_session(rows):
    pub = next_action(rows, 'PublishRelease')
    assert rows[pub]['take']['stage'] == 'ready' and rows[pub]['s']['release'] == (0, 1)
    reject = next_action(rows, 'RejectTake', pub)
    assert rows[reject]['s'] == rows[reject - 1]['s'] and 2 not in taken(rows[reject]['s']['raw'])
    return dict(final=rows[pub]['line'], reject=rows[reject]['line'])


def normal_winner(rows):
    end = next_action(rows, 'AgentEnd')
    assert rows[end]['s']['raw'][-1]['kind'] == 'ended'
    pub = next_action(rows, 'PublishNormalEnd', end)
    before, final = rows[pub - 1], rows[pub]
    assert before['normal']['root'] == before['s']['root']
    assert set(range(1, len(before['s']['raw']))) <= before['s']['effects']
    assert final['s']['winner'] == 'normal' and final['s']['run'] == 'completed'
    assert not final['s']['active'] and not final['s']['grant']
    assert final['s']['release'] == (0, 0) and 2 in taken(final['s']['raw'])
    return dict(ended=rows[end]['line'], final=rows[pub]['line'])


def cancel_window(rows):
    end = next_action(rows, 'AgentEnd')
    pub = next_action(rows, 'PublishRelease', end)
    final = rows[pub]['s']
    assert final['winner'] == 'cancel' and final['run'] == 'cancelled'
    assert final['cursor'] == len(final['raw']) - 1
    assert len(final['raw']) not in final['effects']
    return dict(ended=rows[end]['line'], final=rows[pub]['line'])


def rejected(fn, rows):
    try:
        fn(rows)
    except (AssertionError, KeyError, ValueError, StopIteration, IndexError):
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


def main():
    args = arguments()
    run = args.run.resolve()
    checks = {'witness-new-taken': lambda r: chain(r, True), 'witness-new-pending': lambda r: chain(r, False),
              'negative-old-root': old_root, 'negative-old-coverage-taken': old_coverage,
              'negative-old-coverage-history': old_coverage, 'negative-drop-tail': dropped_tail,
              'witness-final-agent-wins': final_agent, 'witness-final-session-wins': final_session,
              'witness-normal-ended-wins': normal_winner, 'witness-cancel-before-ended': cancel_window}
    results, parsed = {}, {}
    for name, fn in checks.items():
        path = run / name / 'tlc.log'
        parsed[name] = parse(path.read_text())
        results[name] = dict(log=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                             checkpoints=fn(parsed[name]),
                             actions=[dict(action=r['action'], line=r['line']) for r in parsed[name]])
    controls = {}
    example = parsed['witness-new-taken']
    for action in ('Capture', 'ReadDirectory', 'Accept', 'Admit', 'PublishTake', 'Refresh'):
        mutated = [r for r in example if r['action'] != action]
        controls['missing-' + action] = rejected(lambda r: chain(r, True), mutated)
    for key, val in [('frozen', False), ('admissions', {1}), ('se35', {1}), ('release', (0, 1))]:
        mutated = copy.deepcopy(example)
        for row in mutated:
            row['s'][key] = val
        controls['wrong-' + key] = rejected(lambda r: chain(r, True), mutated)
    controls['pending-is-not-taken'] = rejected(lambda r: chain(r, True), parsed['witness-new-pending'])
    controls['taken-is-not-pending'] = rejected(lambda r: chain(r, False), example)
    report = dict(run=str(run), traces=results, false_success_controls=controls,
                  all_pass=all(controls.values()))
    args.output.open('x').write(json.dumps(report, indent=2) + '\n')
    print(json.dumps(dict(traces=len(results), false_success_controls=len(controls), all_pass=report['all_pass'])))
    assert report['all_pass']

if __name__ == '__main__':
    main()
