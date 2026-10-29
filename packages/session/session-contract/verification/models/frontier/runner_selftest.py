#!/usr/bin/env python3
"""Exercise wrapper failure paths with a subprocess fixture, never a model proof."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

BASE = Path(__file__).resolve().parent
SUCCESS = ('Model checking completed. No error has been found.\n'
           '10 states generated, 5 distinct states found, 0 states left on queue.\n'
           'The depth of the complete state graph search is 4.\n')
TRACE = ('Error: Invariant NoFalseRelease is violated.\n'
         'Error: The behavior up to this point is:\n'
         'State 1: <Initial predicate>\nx = 0\nState 2: <Publish>\nx = 1\n')


def main():
    if not __debug__:
        raise SystemExit('Selftest requires assertions')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    out = args.output_dir.resolve()
    if out == BASE or BASE in out.parents:
        parser.error('output must be outside model resources')
    out.mkdir(parents=True, exist_ok=False)
    fake = out / 'java-fixture.py'
    fake.write_text('#!' + sys.executable + '\n' + '''import os,sys,time
from pathlib import Path
if '-version' in sys.argv:
 print('wrapper selftest fixture, not Java or TLC')
 raise SystemExit(0)
assert all(k not in os.environ for k in ('JAVA_TOOL_OPTIONS','_JAVA_OPTIONS','JDK_JAVA_OPTIONS','CLASSPATH'))
assert [os.environ[k] for k in ('NO_COLOR','TERM','LC_ALL','LANG')]==['1','dumb','C','C']
mode=os.environ['FRONTIER_FIXTURE_MODE']
if mode in ('timeout','termination'):
 Path('child.pid').write_text(str(os.getpid()))
 time.sleep(30)
if mode=='crash':
 raise RuntimeError('fixture launch failure')
if mode=='unreachable' or mode=='success':
 print(''' + repr(SUCCESS) + ''')
 raise SystemExit(0)
trace=''' + repr(TRACE) + '''
if mode=='wrong-target':trace=trace.replace('NoFalseRelease','WrongInvariant')
if mode=='missing-trace':trace=trace.splitlines()[0]
if mode=='empty-states':trace=trace.split('State 1:')[0]+chr(10).join(['State 1:','State 2:',''])
if mode=='truncated-state':trace=trace.replace('x = 1','x = [field |-> 1')
print(trace)
raise SystemExit(12)
''')
    fake.chmod(0o700)
    env = dict(os.environ, JAVA_BIN=str(fake), JAVA_TOOL_OPTIONS='hostile-option',
               _JAVA_OPTIONS='hostile-option', JDK_JAVA_OPTIONS='hostile-option',
               CLASSPATH='hostile-path', TERM='xterm-color', LC_ALL='C', NO_COLOR='0')
    rows = []
    def call(name, mode, case, expected, extra_env=None, output=None, root=BASE):
        target = output or (out / name)
        argv = [sys.executable, '-B', str(root / 'run.py'), '--model', 'frontier',
                '--cases', case, '--timeout', '1', '--output-dir', str(target)]
        begin = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = subprocess.run(argv, env=dict(env, FRONTIER_FIXTURE_MODE=mode, **(extra_env or {})),
                                capture_output=True, text=True, timeout=20)
        (out / (name + '.stdout')).write_text(result.stdout)
        (out / (name + '.stderr')).write_text(result.stderr)
        passed = (result.returncode == 0) == expected
        rows.append(dict(name=name, argv=argv, cwd=str(Path.cwd()), start=begin, end=datetime.datetime.now(datetime.timezone.utc).isoformat(), exit=result.returncode, expected_success=expected, passed=passed))
        assert passed, name
        return target
    good = call('success-and-environment', 'success', 'positive-small', True)
    before = hashlib.sha256((good / 'results.json').read_bytes()).hexdigest()
    call('refuse-overwrite', 'success', 'positive-small', False, output=good)
    assert hashlib.sha256((good / 'results.json').read_bytes()).hexdigest() == before
    call('named-negative', 'trace', 'negative-no-prefix', True)
    call('wrong-target', 'wrong-target', 'negative-no-prefix', False)
    call('missing-trace', 'missing-trace', 'negative-no-prefix', False)
    call('empty-states', 'empty-states', 'negative-no-prefix', False)
    call('truncated-state', 'truncated-state', 'negative-no-prefix', False)
    call('unreachable-witness', 'unreachable', 'witness-shrink', False)
    call('child-crash', 'crash', 'positive-small', False)
    timeout = call('timeout', 'timeout', 'positive-small', False)
    pid = int((timeout / 'positive-small/child.pid').read_text())
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        pass
    else:
        raise AssertionError('timed-out child is still alive')
    call('missing-tool', 'success', 'positive-small', False, {'TLA2TOOLS_JAR': ''})
    badjar = out / 'wrong.jar'
    badjar.write_text('not the pinned JAR')
    call('wrong-tool-hash', 'success', 'positive-small', False, {'TLA2TOOLS_JAR': str(badjar)})
    call('source-output-rejected', 'success', 'positive-small', False, output=BASE / 'forbidden-evidence')
    assert not (BASE / 'forbidden-evidence').exists()
    terminated = out / 'terminated'
    command = [sys.executable, '-B', str(BASE / 'run.py'), '--model', 'frontier',
               '--cases', 'positive-small', '--timeout', '60', '--output-dir', str(terminated)]
    begin = datetime.datetime.now(datetime.timezone.utc).isoformat()
    process = subprocess.Popen(command, env=dict(env, FRONTIER_FIXTURE_MODE='termination'),
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    deadline = time.monotonic() + 10
    pidfile = terminated / 'positive-small/child.pid'
    while not pidfile.exists() and time.monotonic() < deadline:
        time.sleep(0.02)
    assert pidfile.exists(), 'fixture child did not start'
    process.terminate()
    stdout, stderr = process.communicate(timeout=15)
    (out / 'termination.stdout').write_text(stdout)
    (out / 'termination.stderr').write_text(stderr)
    assert process.returncode != 0
    try:
        os.kill(int(pidfile.read_text()), 0)
    except ProcessLookupError:
        pass
    else:
        raise AssertionError('terminated wrapper left its child alive')
    rows.append(dict(name='wrapper-termination-cleans-child', argv=command, cwd=str(Path.cwd()), start=begin, end=datetime.datetime.now(datetime.timezone.utc).isoformat(), exit=process.returncode, passed=True))
    changed = out / 'changed-resource'
    shutil.copytree(BASE, changed)
    call('relocated-resource', 'success', 'positive-small', True, root=changed)
    (changed / 'frontier/cfg/positive-small.cfg').write_text('SPECIFICATION Wrong\n')
    call('changed-input-rejected', 'success', 'positive-small', False, root=changed)
    report = dict(evidence_kind='subprocess fixture only', checks=rows,
                  timed_out_child_stopped=True, source_overwrite_refused=True,
                  all_pass=all(r['passed'] for r in rows))
    (out / 'selftest.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(dict(checks=len(rows), all_pass=report['all_pass'])))


if __name__ == '__main__':
    main()
