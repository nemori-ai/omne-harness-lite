#!/usr/bin/env python3
"""Runs every BodyLifecycle configuration with the pinned TLC and judges each result.

Positive configurations must exit 0 with a completed search; negative controls must
exit 12 with exactly the named invariant violated; the progress configuration checks
the liveness property under LiveSpec. Logs, state directories and a summary with the
model/config digests go to --out, never into this directory.
"""
import argparse, hashlib, json, os, pathlib, re, subprocess, time
ROOT = pathlib.Path(__file__).resolve().parent
MODULE = 'BodyLifecycle'
JAR_SHA256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
# (case, expected violated invariant or None, kind)
CASES = [('positive', None, 'safety'),
         ('progress', None, 'liveness'),
         ('sweep-before-due', 'NoEarlyDelete', 'negative'),
         ('link-unsealed', 'PublishedDurable', 'negative'),
         ('seal-after-settle', 'NoWriteAfterSettle', 'negative'),
         ('store-ignores-deadline', 'ReclaimedLeavesNoBytes', 'negative'),
         ('grace-too-small', 'QuiescentStoreEmpty', 'negative'),
         ('recheck-only-reclaimed', 'NoFalseIntegrity', 'negative'),
         ('permit-on-unknown', 'IntentBeforeBytes', 'negative'),
         ('ttl-too-small', 'ReclaimedLeavesNoBytes', 'negative')]
parser = argparse.ArgumentParser()
parser.add_argument('--case')
parser.add_argument('--jar', default=os.environ.get('TLA2TOOLS_JAR'))
parser.add_argument('--out', required=True)
parser.add_argument('--workers', default='4')
parser.add_argument('--timeout', type=int, default=900, help='seconds per configuration')
args = parser.parse_args()
if not args.jar:
    parser.error('--jar or TLA2TOOLS_JAR is required')
JAR = pathlib.Path(args.jar).resolve()
if not JAR.is_file() or hashlib.sha256(JAR.read_bytes()).hexdigest() != JAR_SHA256:
    parser.error('expected the pinned TLC 1.7.4 jar')
if args.case and args.case not in {c for c, _, _ in CASES}:
    parser.error('unknown case')
OUT = pathlib.Path(args.out).resolve()
(OUT / 'logs').mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'NO_COLOR': '1', 'TERM': 'dumb', 'LC_ALL': 'C'}
results = []
for case, expected, kind in CASES:
    if args.case and args.case != case:
        continue
    name = f'{MODULE}-{case}'
    cmd = ['java', '-Xmx2g', '-XX:+UseParallelGC', '-cp', str(JAR), 'tlc2.TLC', '-workers', args.workers,
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
    complete = code == 0 and 'Model checking completed. No error has been found.' in output
    passed = complete if expected is None else (code == 12 and violations == [expected])
    stats = re.findall(r'([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue.', output)
    result = {'case': name, 'kind': kind, 'expectedInvariant': expected, 'exitCode': code, 'passed': passed,
              'violations': violations, 'seconds': round(time.monotonic() - started, 3),
              'statesGenerated': stats[-1][0] if stats else None, 'distinctStates': stats[-1][1] if stats else None,
              'modelSha256': hashlib.sha256((ROOT / f'{MODULE}.tla').read_bytes()).hexdigest(),
              'configSha256': hashlib.sha256((ROOT / f'{name}.cfg').read_bytes()).hexdigest(), 'command': cmd}
    results.append(result)
    print(json.dumps(result), flush=True)
summary = {'jar': str(JAR), 'jarSha256': JAR_SHA256,
           'java': subprocess.run(['java', '-version'], capture_output=True, text=True).stderr,
           'cases': results, 'passed': all(r['passed'] for r in results)}
(OUT / ('summary-' + args.case + '.json' if args.case else 'summary.json')).write_text(json.dumps(summary, indent=2) + '\n')
raise SystemExit(0 if summary['passed'] else 1)
