#!/usr/bin/env python3
"""Run TLC on TransportSession.tla serially, judge every case and keep the evidence.

Usage, from the repository root, through the test slot:

    node scripts/with-test-slot.mjs python3 \
        packages/mcp/mcp-host-local/verification/models/run.py [case ...]

A case is the name of a configuration file without `.cfg`. Without a case every case runs. The
exit code is 0 when every case that ran was judged as expected (see README.md): a positive control
(valid-*) finishes without an error; a negative control (bad-*) violates exactly the invariant
named below and no other. TLA2TOOLS_JAR names the tla2tools jar, JAVA_BIN the java binary,
FORMAL_OUTPUT_DIR the evidence directory (default tmp/closures/w3-mcp-host-formal/formal/), and
FORMAL_WORKERS the TLC workers (default 4).
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
MODEL = ROOT / 'TransportSession.tla'
REPOSITORY = ROOT.parents[4]

# None: a positive control. A name: the invariant the case must violate, and only that one.
CASES = {
    'valid-close': None,
    'valid-signal': None,
    'valid-no-handle': None,
    'bad-resettle': 'V1_SettleOnce',
    'bad-cred-after-close': 'V2_NoCredentialAfterClose',
    'bad-report-twice': 'V3_RejectAtMostOnce',
    'bad-signal-dead': 'V4_SignalBounded',
    'bad-close-after-line': 'V4_CloseBounded',
    'bad-resend': 'V5_NoResendForCaller',
    'bad-close-not-sent': 'V6_CloseThreePhases',
}

COMPLETED = 'Model checking completed. No error has been found.'
STATS = re.compile(r'(\d+) states generated, (\d+) distinct states found')
DEPTH = re.compile(r'The depth of the complete state graph search is (\d+)')
VIOLATED = re.compile(r'Invariant (\w+) is violated')
VERSION = re.compile(r'^TLC2 Version .*$', re.MULTILINE)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def judge(expected, code, output):
    violated = VIOLATED.findall(output)
    if expected is None:
        return code == 0 and COMPLETED in output and not violated
    return code != 0 and violated == [expected]


def run(case, jar, java, workers, evidence):
    config = ROOT / f'{case}.cfg'
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
        'model_sha256': sha256(MODEL),
        'config_sha256': sha256(config),
        'expected': expected or 'no error',
        'exit': completed.returncode,
        'violated': VIOLATED.findall(output),
        'generated': int(stats[-1][0]) if stats else None,
        'distinct': int(stats[-1][1]) if stats else None,
        'depth': int(depth[-1]) if depth else None,
        'seconds': seconds,
        'passed': judge(expected, completed.returncode, output),
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
    base = Path(os.environ.get(
        'FORMAL_OUTPUT_DIR', REPOSITORY / 'tmp/closures/w3-mcp-host-formal/formal'))
    evidence = base / stamp
    evidence.mkdir(parents=True, exist_ok=True)
    results = []
    for case in cases:
        result = run(case, jar, java, workers, evidence)
        results.append(result)
        verdict = 'as expected' if result['passed'] else 'NOT AS EXPECTED'
        print(f"{case}: {verdict}; violated {result['violated'] or 'no invariant'}; "
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
