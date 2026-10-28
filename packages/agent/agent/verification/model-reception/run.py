#!/usr/bin/env python3
"""Run TLC serially. The outer invocation must hold the repository test slot."""
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
if not os.environ.get('OMNE_TEST_SLOT_HELD'):
    sys.exit('Run through the repository scripts/with-test-slot.mjs; see README.md')
jar = Path(os.environ.get('TLA2TOOLS_JAR', str(Path.home() / '.local/share/omne-tools/tlaplus/tla2tools-1.7.4.jar')))
java = os.environ.get('JAVA_BIN', 'java')
budget = int(os.environ.get('FORMAL_BUDGET_SECONDS', '180'))
expected = {'valid': None, 'capacity-one': None, 'bad-split': 'AtomicVisibility',
            'bad-precommit': 'NoPrecommitOutlet', 'bad-rebuild': 'BlockedSurvivesRebuild'}
cases = sys.argv[1:] or list(expected)
if any(case not in expected for case in cases):
    sys.exit('Unknown configuration')
repo = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=ROOT, text=True).strip())
default_output = ROOT / 'runs' if ROOT.relative_to(repo).parts[0] == 'tmp' else repo / 'tmp/formal/model-reception/runs'
output = Path(os.environ.get('FORMAL_OUTPUT_DIR', str(default_output))).resolve()
run_dir = output / dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
run_dir.mkdir(parents=True)
for source in [ROOT / 'Reception.tla', ROOT / 'run.py', *ROOT.glob('*.cfg')]:
    shutil.copy2(source, run_dir / source.name)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
env = {**os.environ, 'LC_ALL': 'C', 'TERM': 'dumb', 'NO_COLOR': '1'}
metadata = {'java': java, 'javaVersion': subprocess.run([java, '-version'], capture_output=True, text=True, env=env).stderr,
            'jar': str(jar), 'jarSha256': sha(jar), 'modelSha256': sha(ROOT / 'Reception.tla'),
            'sourceHead': subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip(),
            'slot': os.environ['OMNE_TEST_SLOT_HELD'], 'heapMiB': 1024, 'workers': 2,
            'perCaseBudgetSeconds': budget, 'requestedCases': cases, 'results': []}
for case in cases:
    folder = run_dir / case
    folder.mkdir()
    cmd = [java, '-Xmx1024m', '-XX:+UseParallelGC', '-cp', str(jar), 'tlc2.TLC', '-workers', '2', '-seed', '787', '-fp', '0',
           '-metadir', str(folder / 'states'), '-config', str(run_dir / f'{case}.cfg'), str(run_dir / 'Reception.tla')]
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
    output = (folder / 'tlc.log').read_text()
    wanted = expected[case]
    found = re.findall(r'Invariant (\w+) is violated', output)
    ok = (not timed_out and ((wanted is None and code == 0 and
           'Model checking completed. No error has been found.' in output) or
           (wanted is not None and code != 0 and wanted in found and
            'The behavior up to this point is:' in output)))
    result = {'case': case, 'configSha256': sha(ROOT / f'{case}.cfg'), 'command': cmd,
              'startedAt': started, 'endedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
              'seconds': round(time.monotonic()-tick, 3), 'exitCode': code, 'timedOut': timed_out,
              'expectedInvariant': wanted, 'violatedInvariants': found, 'passed': ok,
              'tlcVersion': next((line for line in output.splitlines() if line.startswith('TLC2')), None),
              'stateStatistics': re.findall(r'^.*states generated.*$', output, re.M),
              'depth': re.findall(r'^The depth.*$', output, re.M), 'log': str(folder / 'tlc.log')}
    metadata['results'].append(result)
    (run_dir / 'results.json').write_text(json.dumps(metadata, indent=2)+'\n')
    print(json.dumps(result), flush=True)
    if not ok and not found:
        print('Stopped after incomplete or invalid TLC run; remaining requested cases were not executed.', flush=True)
        break
print('Evidence: '+str(run_dir), flush=True)
sys.exit(0 if all(item['passed'] for item in metadata['results']) else 1)
