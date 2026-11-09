#!/usr/bin/env python3
"""Runs every RetentionScope configuration with the pinned TLC and judges each result.

The two positive configurations must exit 0 with a completed search. A negative control
on an invariant must exit 12 with exactly the named invariant violated; the negative control
on the progress property must exit 13 with a temporal violation, and its configuration must
name exactly that property. Logs, state directories and a summary with the model/config
digests go to --out, never into this directory.
"""
import argparse, hashlib, json, os, pathlib, re, subprocess, time
ROOT = pathlib.Path(__file__).resolve().parent
MODULE = 'RetentionScope'
JAR_SHA256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
# (configuration suffix, expected outcome): None = completes clean,
# ('invariant', name) = exit 12 with exactly that invariant,
# ('property', name) = exit 13 with a temporal violation of the one listed property.
CASES = [
    ('positive', None),
    ('progress', None),
    ('delete-marker-on-release', ('invariant', 'NeverReopen')),
    ('drop-only-on-acquisition-close', ('property', 'EventuallyReleased')),
    ('acquisition-write-without-scope-assert', ('invariant', 'ClosedAcquisitionNotAdopted')),
    ('forget-end-fact', ('invariant', 'StopAnswer')),
]
parser = argparse.ArgumentParser()
parser.add_argument('--case')
parser.add_argument('--jar', default=os.environ.get('TLA2TOOLS_JAR'))
parser.add_argument('--out', required=True)
parser.add_argument('--timeout', type=int, default=600, help='seconds per configuration')
args = parser.parse_args()
if not args.jar:
    parser.error('--jar or TLA2TOOLS_JAR is required')
JAR = pathlib.Path(args.jar).resolve()
if not JAR.is_file() or hashlib.sha256(JAR.read_bytes()).hexdigest() != JAR_SHA256:
    parser.error('expected the pinned TLC 1.7.4 jar')
if args.case and args.case not in {c for c, _ in CASES}:
    parser.error('unknown case')
OUT = pathlib.Path(args.out).resolve()
(OUT / 'logs').mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'NO_COLOR': '1', 'TERM': 'dumb', 'LC_ALL': 'C'}
COMPLETE = 'Model checking completed. No error has been found.'
results = []
for case, expected in CASES:
    if args.case and args.case != case:
        continue
    name = f'{MODULE}-{case}'
    config = (ROOT / f'{name}.cfg').read_text()
    cmd = ['java', '-Xmx1536m', '-XX:+UseParallelGC', '-cp', str(JAR), 'tlc2.TLC', '-workers', '1',
           '-cleanup', '-metadir', str(OUT / 'states' / name), '-config', f'{name}.cfg', f'{MODULE}.tla']
    started = time.monotonic()
    try:
        run = subprocess.run(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             timeout=args.timeout, env=env)
        output, code = run.stdout, run.returncode
    except subprocess.TimeoutExpired as error:
        output = error.stdout.decode() if isinstance(error.stdout, bytes) else (error.stdout or '')
        code = 124
    (OUT / 'logs' / f'{name}.log').write_text(output)
    violations = re.findall(r'Invariant (\w+) is violated', output)
    temporal = 'Temporal properties were violated.' in output
    properties = re.findall(r'^PROPERTY\s+(\w+)\s*$', config, re.M)
    complete = code == 0 and COMPLETE in output
    if expected is None:
        passed = complete
    elif expected[0] == 'invariant':
        passed = code == 12 and violations == [expected[1]]
    else:
        passed = code == 13 and temporal and not violations and properties == [expected[1]]
    stats = re.findall(r'([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue.', output)
    result = {'case': name, 'expected': expected, 'exitCode': code, 'passed': passed,
              'violations': violations, 'temporalViolation': temporal,
              'seconds': round(time.monotonic() - started, 3),
              'statesGenerated': stats[-1][0] if stats else None, 'distinctStates': stats[-1][1] if stats else None,
              'modelSha256': hashlib.sha256((ROOT / f'{MODULE}.tla').read_bytes()).hexdigest(),
              'configSha256': hashlib.sha256(config.encode()).hexdigest(), 'command': cmd}
    results.append(result)
    print(json.dumps(result), flush=True)
summary = {'jar': str(JAR), 'jarSha256': JAR_SHA256,
           'java': subprocess.run(['java', '-version'], capture_output=True, text=True).stderr,
           'cases': results, 'passed': all(r['passed'] for r in results)}
(OUT / ('summary-' + args.case + '.json' if args.case else 'summary.json')).write_text(json.dumps(summary, indent=2) + '\n')
raise SystemExit(0 if summary['passed'] else 1)
