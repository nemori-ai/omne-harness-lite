#!/usr/bin/env python3
"""Run TLC on ConnectionTable.tla serially, judge every case and keep the evidence.

Usage, from the repository root, through the test slot:

    node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py [case ...]

A case is the name of a configuration file without `.cfg`. Without a case every case runs. The
exit code is 0 when every case that ran was judged as expected (see README.md): a positive control
finishes without an error; a negative control, a known counterexample of 1160e92c8 and the probe
of the anti-theorem A1 each violate exactly the invariant named below. TLA2TOOLS_JAR names the
tla2tools jar, JAVA_BIN the java binary, FORMAL_OUTPUT_DIR the evidence directory (default
tmp/formal/mcp-connection-table/runs/), FORMAL_WORKERS the TLC workers (default 4).
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
MODEL = ROOT / 'ConnectionTable.tla'
REPOSITORY = ROOT.parents[4]

# None: a positive control. A name: the invariant the case must violate. TEMPORAL: the case must
# violate its only PROPERTY; TLC's temporal report does not name the property.
TEMPORAL = 'temporal'
CASES = {
    'valid-faults': None,
    'valid-rebuild': None,
    'valid-two-keys': None,
    'valid-throws': None,
    'live': None,
    'bad-no-absorb-close': 'P2_NoneHoldsNothing',
    'bad-forget-open': 'P2_ForgetHoldsNothing',
    'bad-no-shut': 'P4_NoConnectAfterShut',
    'cex-b1': 'P7_NoB1',
    'cex-n2': 'P7_NoN2',
    'cex-n3': 'P1_AtMostOnce',
    'cex-n3-shutdown': 'P3_EveryProcessAsked',
    'cex-p2': 'P8_NoTeardownStall',
    'cex-n1': 'P8_NoStoreStall',
    'probe-a1': 'P8_BoundedClose',
    'probe-live-hang': TEMPORAL,
}

COMPLETED = 'Model checking completed. No error has been found.'
TEMPORAL_VIOLATED = 'Temporal properties were violated.'
STATS = re.compile(r'(\d+) states generated, (\d+) distinct states found')
DEPTH = re.compile(r'The depth of the complete state graph search is (\d+)')
VIOLATED = re.compile(r'Invariant (\w+) is violated')
VERSION = re.compile(r'^TLC2 Version .*$', re.MULTILINE)
STATE = re.compile(r'\n(?=State \d+: )')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


# The labels TLC gives the external actions: one per explorer step (`External` is `Answer`).
EXTERNAL = {'EnsureCall', 'Release', 'CloseAll', 'Lose', 'Fire', 'External'}


def trace_of(output):
    """The external actions and synchronous throws of a counterexample, from the `ev` field."""
    steps = []
    last = None
    for block in STATE.split(output):
        head = re.match(r'State (\d+): <(\w+)', block)
        event = re.search(r'ev \|-> "([^"]*)"', block)
        if not (head and event):
            continue
        thrown = event.group(1).startswith('throw') and event.group(1) != last
        if head.group(2) in EXTERNAL or thrown:
            steps.append(f'state {head.group(1)} {head.group(2)}: {event.group(1)}')
        last = event.group(1)
    return steps


def judge(expected, code, output):
    violated = VIOLATED.findall(output)
    if expected is None:
        return code == 0 and COMPLETED in output and not violated
    if expected == TEMPORAL:
        return code != 0 and TEMPORAL_VIOLATED in output and not violated
    return code != 0 and violated == [expected]


def run(case, jar, java, workers, evidence):
    config = ROOT / f'{case}.cfg'
    model = sha256(MODEL)
    states = evidence / f'{case}.states'
    started = time.monotonic()
    completed = subprocess.run(
        [java, '-XX:+UseParallelGC', '-cp', jar, 'tlc2.TLC', '-workers', str(workers),
         '-config', str(config), '-metadir', str(states), str(MODEL)],
        capture_output=True, text=True, check=False)
    seconds = round(time.monotonic() - started, 1)
    shutil.rmtree(states, ignore_errors=True)
    output = completed.stdout + completed.stderr
    (evidence / f'{case}.out').write_text(output)
    stats = STATS.findall(output)
    depth = DEPTH.findall(output)
    expected = CASES[case]
    return {
        'case': case,
        'tlc': VERSION.findall(output)[:1],
        'model_sha256': model,
        'config_sha256': sha256(config),
        'expected': expected or 'no error',
        'exit': completed.returncode,
        'violated': VIOLATED.findall(output),
        'generated': int(stats[-1][0]) if stats else None,
        'distinct': int(stats[-1][1]) if stats else None,
        'depth': int(depth[-1]) if depth else None,
        'seconds': seconds,
        'passed': judge(expected, completed.returncode, output),
        'trace': trace_of(output) if expected else [],
    }


def main(argv):
    cases = argv or list(CASES)
    unknown = [case for case in cases if case not in CASES]
    if unknown:
        print(f'unknown cases: {", ".join(unknown)}', file=sys.stderr)
        return 2
    jar = os.environ.get('TLA2TOOLS_JAR', '/opt/tlaplus/tla2tools.jar')
    java = os.environ.get('JAVA_BIN', 'java')
    workers = int(os.environ.get('FORMAL_WORKERS', '4'))
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    base = Path(os.environ.get('FORMAL_OUTPUT_DIR', REPOSITORY / 'tmp/formal/mcp-connection-table/runs'))
    evidence = base / stamp
    evidence.mkdir(parents=True, exist_ok=True)
    results = []
    for case in cases:
        result = run(case, jar, java, workers, evidence)
        results.append(result)
        verdict = 'as expected' if result['passed'] else 'NOT AS EXPECTED'
        temporal = ' (temporal)' if TEMPORAL_VIOLATED in (evidence / f'{case}.out').read_text() else ''
        print(f"{case}: {verdict}; violated {result['violated'] or 'no invariant'}{temporal}; "
              f"{result['distinct']} distinct states, depth {result['depth']}, {result['seconds']} s")
    summary = {
        'jar_sha256': sha256(Path(jar)),
        'workers': workers,
        'results': results,
    }
    (evidence / 'summary.json').write_text(json.dumps(summary, indent=1) + '\n')
    print(f'evidence: {evidence}')
    return 0 if all(result['passed'] for result in results) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
