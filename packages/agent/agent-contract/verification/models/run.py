#!/usr/bin/env python3
"""Run TLC on Finishing.tla serially and keep the evidence; export the replay traces.

Usage, from the repository root, through the test slot:

    node scripts/with-test-slot.mjs python3 packages/agent/agent-contract/verification/models/run.py [case ...]
    node scripts/with-test-slot.mjs python3 packages/agent/agent-contract/verification/models/run.py traces

A case is the name of a configuration file without `.cfg`. Without a case every check case runs.
`traces` runs the trace configurations and writes finishing-traces.json next to this file.
See README.md for the judgment rules and ../formal-runs.md for the recorded runs.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
MODEL = ROOT / 'Finishing.tla'

# Each check case: the configuration and what TLC must report. None is a positive control; a
# string names the property whose violation the negative control must hit.
CHECKS = {
    'valid': None,
    'valid-cancel': None,
    'valid-coordinated': None,
    'live': None,
    'live-cancel': None,
    'bad-skip-pending': 'NoEndWithPending',
    'bad-unknown-as-pending': 'UnknownNotBlockedOrEnded',
    'bad-ignore-cancel': 'CancelFirst',
    'bad-stale-intent': 'NoEndOutsideSettling',
    'bad-stale-judgment': 'NoStaleJudgment',
    'bad-rh-moves-pointer': 'PointerByJa',
    'bad-release-before-custody': 'OneCustodian',
    'bad-recheck-before-recognize': 'ReplayOriginal',
    'bad-new-run-blocks-cancel': 'CancelSettles',
    # Not a control: the reading of the memory Journals, which never replace a cancelled
    # candidate. The run records whether that reading keeps CancelSettles (see README.md).
    'probe-keep-cancelled': 'CancelSettles',
}
# The liveness property is the only PROPERTY of its configurations; TLC's temporal report does not
# name it, so the negative control is read through that configuration.
TEMPORAL = {'CancelSettles'}

# The trace configurations: (name, configuration, mode, seed). A simulation run walks at random
# until the goal invariant of its configuration is violated; a model-checking run gives the
# shortest behavior that violates the property of a negative control.
TRACES = [
    ('ordinary-1', 'trace-ordinary', 'simulate', 11),
    ('ordinary-2', 'trace-ordinary', 'simulate', 12),
    ('ordinary-3', 'trace-ordinary', 'simulate', 13),
    ('complete-1', 'trace-complete', 'simulate', 31),
    ('complete-2', 'trace-complete', 'simulate', 32),
    ('cancelled-1', 'trace-cancelled', 'simulate', 21),
    ('cancelled-2', 'trace-cancelled', 'simulate', 22),
    ('cancelled-3', 'trace-cancelled', 'simulate', 23),
]
VIOLATING = [
    ('skip-pending', 'trace-bad-skip-pending', 'NoEndWithPending'),
    ('unknown-as-pending', 'trace-bad-unknown-as-pending', 'UnknownNotBlockedOrEnded'),
    ('recheck-before-recognize', 'trace-bad-recheck-before-recognize', 'ReplayOriginal'),
]

if not os.environ.get('OMNE_TEST_SLOT_HELD'):
    sys.exit('Run through the repository scripts/with-test-slot.mjs; see README.md')
jar = Path(os.environ.get('TLA2TOOLS_JAR', str(Path.home() / '.local/share/omne-tools/tlaplus/tla2tools-1.7.4.jar')))
java = os.environ.get('JAVA_BIN', 'java')
budget = int(os.environ.get('FORMAL_BUDGET_SECONDS', '1200'))
workers = os.environ.get('FORMAL_WORKERS', '4')
heap = os.environ.get('FORMAL_HEAP', '-Xmx4096m')
repo = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=ROOT, text=True).strip())
output = Path(os.environ.get('FORMAL_OUTPUT_DIR', str(repo / 'tmp/formal/agent-contract-finishing/runs'))).resolve()
run_dir = output / dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
run_dir.mkdir(parents=True)
for source in [MODEL, Path(__file__).resolve(), *ROOT.glob('*.cfg')]:
    shutil.copy2(source, run_dir / source.name)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
env = {**os.environ, 'LC_ALL': 'C', 'TERM': 'dumb', 'NO_COLOR': '1'}
metadata = {
    'java': java,
    'javaVersion': subprocess.run([java, '-version'], capture_output=True, text=True, env=env).stderr,
    'jar': str(jar), 'jarSha256': sha(jar), 'modelSha256': sha(MODEL),
    'sourceHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'slot': os.environ['OMNE_TEST_SLOT_HELD'], 'heap': heap, 'workers': workers,
    'perCaseBudgetSeconds': budget, 'requested': sys.argv[1:], 'results': [],
}


def tlc(case, extra, folder_name=None, worker_count=None):
    """Runs TLC on one configuration and answers the exit code, the log and the time."""
    folder = run_dir / (folder_name or case)
    folder.mkdir(exist_ok=True)
    cmd = [java, heap, '-XX:+UseParallelGC', '-cp', str(jar), 'tlc2.TLC', '-workers', worker_count or workers,
           '-fp', '0', '-metadir', str(folder / 'states'), *extra,
           '-config', str(run_dir / f'{case}.cfg'), str(run_dir / MODEL.name)]
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    tick = time.monotonic()
    timed_out = False
    with (folder / 'tlc.log').open('w') as log:
        try:
            completed = subprocess.run(cmd, cwd=run_dir, stdout=log, stderr=subprocess.STDOUT,
                                       timeout=budget, env=env)
            code = completed.returncode
        except subprocess.TimeoutExpired:
            timed_out = True
            code = None
    text = (folder / 'tlc.log').read_text()
    shutil.rmtree(folder / 'states', ignore_errors=True)
    return {'command': cmd, 'startedAt': started, 'endedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'seconds': round(time.monotonic() - tick, 3), 'exitCode': code, 'timedOut': timed_out,
            'log': str(folder / 'tlc.log')}, text


def violated(text):
    found = re.findall(r'(?:Invariant|Action property) (\w+) is violated', text)
    if 'Temporal properties were violated' in text:
        found.append('temporal')
    return found


def check(case):
    wanted = CHECKS[case]
    result, text = tlc(case, [])
    found = violated(text)
    if wanted is None:
        passed = (not result['timedOut'] and result['exitCode'] == 0 and
                  'Model checking completed. No error has been found.' in text)
    elif wanted in TEMPORAL:
        passed = (not result['timedOut'] and result['exitCode'] != 0 and found == ['temporal'] and
                  'The following behavior constitutes a counter-example' in text)
    else:
        passed = (not result['timedOut'] and result['exitCode'] != 0 and found == [wanted] and
                  'The behavior up to this point is' in text)
    result.update({'case': case, 'configSha256': sha(ROOT / f'{case}.cfg'), 'expected': wanted,
                   'violated': found, 'passed': passed,
                   'tlcVersion': next((l for l in text.splitlines() if l.startswith('TLC2')), None),
                   'stateStatistics': re.findall(r'^.*states generated.*$', text, re.M),
                   'depth': re.findall(r'^The depth.*$', text, re.M)})
    return result


# ---------------------------------------------------------------------------------------------
# Trace export: the states of a TLC behavior, projected on the replay step.

STATE = re.compile(r'^State (\d+): <(.*)>$')


def states(text):
    """The variable assignments of each state of the first behavior TLC printed."""
    result, current, key = [], None, None
    for line in text.splitlines():
        head = STATE.match(line)
        if head:
            current = {}
            result.append(current)
            key = None
            continue
        if current is None:
            continue
        if line.startswith('/\\ '):
            name, _, value = line[3:].partition(' = ')
            key = name.strip()
            current[key] = value.strip()
        elif line.strip() == '' or line.startswith('The number of states') or line.startswith('Error'):
            if result and current is not None and current:
                key = None
        elif key is not None:
            current[key] += ' ' + line.strip()
    return result


def text_of(value):
    match = re.fullmatch(r'"(.*)"', value)
    if not match:
        raise ValueError(f'not a string: {value}')
    return match.group(1)


def field(record, name):
    match = re.search(name + r' \|-> "([^"]*)"', record)
    if not match:
        raise ValueError(f'no field {name} in {record}')
    return match.group(1)


def steps_of(text):
    steps = []
    for state in states(text)[1:]:
        steps.append({
            'action': text_of(state['act']),
            'reply': text_of(state['reply']),
            'state': {
                'status': text_of(state['status']),
                'conclusion': field(state['cand'], 'concl'),
                'route': field(state['cand'], 'route'),
                'handoff': text_of(state['ptr']) != 'none',
            },
        })
    return steps


def traces():
    conforming, violating = [], []
    for name, case, mode, seed in TRACES:
        # One worker: with several workers neither a simulation nor the first counterexample
        # repeats from run to run.
        extra = ['-simulate', '-depth', '80', '-seed', str(seed)]
        result, text = tlc(case, extra, folder_name=name, worker_count='1')
        steps = steps_of(text) if 'The behavior up to this point is' in text else []
        result.update({'trace': name, 'case': case, 'seed': seed, 'steps': len(steps),
                       'violated': violated(text), 'passed': bool(steps)})
        metadata['results'].append(result)
        print(json.dumps({k: result[k] for k in ('trace', 'exitCode', 'violated', 'steps', 'passed')}), flush=True)
        if steps:
            conforming.append({'name': name, 'origin': f'{case}.cfg simulate seed {seed}', 'steps': steps})
    for name, case, prop in VIOLATING:
        result, text = tlc(case, [], folder_name=name, worker_count='1')
        found = violated(text)
        steps = steps_of(text) if found == [prop] else []
        result.update({'trace': name, 'case': case, 'expected': prop, 'violated': found,
                       'steps': len(steps), 'passed': bool(steps)})
        metadata['results'].append(result)
        print(json.dumps({k: result[k] for k in ('trace', 'exitCode', 'violated', 'steps', 'passed')}), flush=True)
        if steps:
            violating.append({'name': name, 'origin': f'{case}.cfg counterexample of {prop}', 'steps': steps})
    document = {'model': MODEL.name, 'modelSha256': sha(MODEL), 'conforming': conforming, 'violating': violating}
    (ROOT / 'finishing-traces.json').write_text(json.dumps(document, indent=2) + '\n', newline='\n')
    shutil.copy2(ROOT / 'finishing-traces.json', run_dir / 'finishing-traces.json')
    embed(document)


# The replay driver embeds the same traces, one line per step, after this marker.
DRIVER = ROOT.parent.parent / 'src' / 'testing-journal-replay.ts'
MARKER = '// ---8<--- generated traces'


def step_text(step):
    state = step['state']
    return ' '.join([step['action'], step['reply'], state['status'], state['conclusion'], state['route'],
                     'handoff' if state['handoff'] else '-'])


def constant(name, traces):
    lines = [f'export const {name}: readonly JournalReplayTrace[] = [']
    for trace in traces:
        lines.append(f"  trace('{trace['name']}', '{trace['origin']}', [")
        lines += [f"    '{step_text(step)}'," for step in trace['steps']]
        lines.append('  ]),')
    lines.append(']')
    return '\n'.join(lines)


def embed(document):
    head = DRIVER.read_text(encoding='utf-8').split(MARKER)[0]
    generated = '\n'.join([
        MARKER,
        '// Written by verification/models/run.py traces from finishing-traces.json. A step reads',
        "// 'action reply status conclusion route handoff', with '-' when no H is current.",
        constant('agentJournalReplayTraces', document['conforming']),
        '',
        constant('agentJournalViolatingTraces', document['violating']),
        '',
    ])
    DRIVER.write_text(head + generated, encoding='utf-8', newline='\n')


cases = sys.argv[1:] or list(CHECKS)
if cases == ['traces']:
    traces()
else:
    if any(case not in CHECKS for case in cases):
        sys.exit('Unknown configuration')
    for case in cases:
        result = check(case)
        metadata['results'].append(result)
        (run_dir / 'results.json').write_text(json.dumps(metadata, indent=2) + '\n')
        print(json.dumps({k: result[k] for k in ('case', 'exitCode', 'expected', 'violated', 'seconds', 'passed')}), flush=True)
        if not result['passed'] and result['timedOut']:
            print('Stopped after a run that did not finish; the remaining cases were not executed.', flush=True)
            break
(run_dir / 'results.json').write_text(json.dumps(metadata, indent=2) + '\n')
print('Evidence: ' + str(run_dir), flush=True)
sys.exit(0 if all(item['passed'] for item in metadata['results']) else 1)
