#!/usr/bin/env python3
"""Runs every BindingOrder configuration with the pinned TLC and judges each result.

A configuration with no expected property must exit 0 with a completed search. A negative
control checks exactly one property, and TLC must report exactly that property violated:
an invariant or an action property by name, a temporal property by a lasso. The positive
control must check every property of the model. The model ends in states where no step is
enabled, so TLC runs with -deadlock; EventuallyDone judges those states. Logs,
state directories and a summary with the model and config digests go to --out, never into
this directory.
"""
import argparse, hashlib, json, os, pathlib, re, subprocess, time
ROOT = pathlib.Path(__file__).resolve().parent
MODULE = 'BindingOrder'
JAR_SHA256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
PROPERTIES = ['NoOvertaking', 'EventuallyDone']
TEMPORAL = {'EventuallyDone'}
CASES = [('order', None),
         ('bad-named-late', 'EventuallyDone'),
         ('bad-awaits-later', 'EventuallyDone'),
         ('bad-no-delivery-wait', 'NoOvertaking')]
parser = argparse.ArgumentParser()
parser.add_argument('--case')
parser.add_argument('--jar', default=os.environ.get('TLA2TOOLS_JAR'))
parser.add_argument('--out', required=True)
parser.add_argument('--workers', type=int, default=8)
parser.add_argument('--timeout', type=int, default=900, help='seconds per configuration')
args = parser.parse_args()
if not args.jar:
    parser.error('--jar or TLA2TOOLS_JAR is required')
JAR = pathlib.Path(args.jar).resolve()
if not JAR.is_file() or hashlib.sha256(JAR.read_bytes()).hexdigest() != JAR_SHA256:
    parser.error('expected the pinned TLC 1.7.4 jar')
if args.case and args.case not in {c for c, _ in CASES}:
    parser.error('unknown case')
if sorted(p.stem for p in ROOT.glob('*.cfg')) != sorted(c for c, _ in CASES):
    parser.error('the case table and the configurations in this directory differ')


def checked(config):
    """The properties a configuration checks: the names after INVARIANTS and PROPERTIES."""
    names, section = [], None
    for line in config.read_text().splitlines():
        words = line.split()
        if not words:
            continue
        if words[0] in ('INVARIANTS', 'PROPERTIES'):
            section, words = words[0], words[1:]
        elif words[0].isupper():
            section = None
        if section:
            names += words
    return names


def judged(code, output, expected, names):
    if expected is None:
        return code == 0 and 'Model checking completed. No error has been found.' in output
    if names != [expected]:
        return False
    if expected in TEMPORAL:
        return (code == 13 and 'Temporal properties were violated' in output
                and ('Back to state' in output or 'Stuttering' in output))
    found = re.findall(r'(?:Invariant|Action property) (\w+) is violated', output)
    return code in (12, 13) and found == [expected]


OUT = pathlib.Path(args.out).resolve()
(OUT / 'logs').mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'NO_COLOR': '1', 'TERM': 'dumb', 'LC_ALL': 'C'}
results = []
for case, expected in CASES:
    if args.case and args.case != case:
        continue
    config = ROOT / f'{case}.cfg'
    names = checked(config)
    cmd = ['java', '-Xmx4g', '-XX:+UseParallelGC', '-cp', str(JAR), 'tlc2.TLC',
           '-workers', str(args.workers), '-deadlock', '-cleanup',
           '-metadir', str(OUT / 'states' / case), '-config', config.name, f'{MODULE}.tla']
    started = time.monotonic()
    try:
        run = subprocess.run(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             timeout=args.timeout, env=env)
        output, code = run.stdout, run.returncode
    except subprocess.TimeoutExpired as error:
        output = error.stdout.decode() if isinstance(error.stdout, bytes) else (error.stdout or '')
        code = 124
    (OUT / 'logs' / f'{case}.log').write_text(output)
    passed = judged(code, output, expected, names)
    if case == 'order':
        passed = passed and sorted(names) == sorted(PROPERTIES)
    stats = re.findall(r'([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue.', output)
    result = {'case': case, 'expectedProperty': expected, 'checked': names, 'exitCode': code,
              'passed': passed, 'seconds': round(time.monotonic() - started, 3),
              'statesGenerated': stats[-1][0] if stats else None, 'distinctStates': stats[-1][1] if stats else None,
              'modelSha256': hashlib.sha256((ROOT / f'{MODULE}.tla').read_bytes()).hexdigest(),
              'configSha256': hashlib.sha256(config.read_bytes()).hexdigest(), 'command': cmd}
    results.append(result)
    print(json.dumps(result), flush=True)
summary = {'jar': str(JAR), 'jarSha256': JAR_SHA256,
           'java': subprocess.run(['java', '-version'], capture_output=True, text=True).stderr,
           'cases': results, 'passed': all(r['passed'] for r in results)}
(OUT / ('summary-' + args.case + '.json' if args.case else 'summary.json')).write_text(json.dumps(summary, indent=2) + '\n')
raise SystemExit(0 if summary['passed'] else 1)
