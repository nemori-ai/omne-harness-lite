#!/usr/bin/env python3
"""Run TLC on TransportSession.tla serially, judge every case and keep the evidence.

Usage, from the repository root, through the test slot:

    node scripts/with-test-slot.mjs python3 \
        packages/mcp/mcp-host-local/verification/models/run.py [case ...]
    node scripts/with-test-slot.mjs python3 \
        packages/mcp/mcp-host-local/verification/models/run.py --mutations [mutation ...]

A case is the name of a configuration file without `.cfg`. Without a case every case runs. The
exit code is 0 when every case that ran was judged as expected (see README.md): a positive control
(valid-*) finishes without an error; a negative control (bad-*) violates exactly the invariant
named in CASES and no other.

`--mutations` runs the valid-action mutations of MUTATIONS: each edits one valid action in a copy
of the module (the text `old` must occur exactly once and is replaced by `new`), checks only the
invariant it targets under the constants of its base configuration, and must violate that
invariant. The module in this directory is never changed.

TLA2TOOLS_JAR names the tla2tools jar, JAVA_BIN the java binary, FORMAL_OUTPUT_DIR the evidence
directory (default tmp/formal/mcp-host-local/runs/), and FORMAL_WORKERS the TLC workers (default 4).
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
    'bad-close-settles-after-line': 'V4_CloseBounded',
    'bad-caller-waits-workflow-close': 'V4_CloseBounded',
    'bad-caller-waits-workflow-signal': 'V4_SignalBounded',
    'bad-resend': 'V5_NoResendForCaller',
    'bad-close-not-sent': 'V6_ByPhase',
    'bad-ended-sends-authorizing': 'V2_NoWireAfterDead',
}

# Valid-action mutations: name -> (base case, invariant that must go red, old text, new text).
# `old` is a verbatim fragment of a valid action of the module; `new` is the defect.
MUTATIONS = {
    'V1-close-resettles-done': (
        'valid-close', 'V1_SettleOnce',
        'LET InFlight == {r \\in Reqs : st[r] \\in InFlightPhases}',
        'LET InFlight == {r \\in Reqs : st[r] \\in InFlightPhases \\cup {"done"}}'),
    'V1-late-answer-resettles': (
        'valid-close', 'V1_SettleOnce',
        'IF st[r] = "sent" \\/ "resettle" \\in Bugs',
        'IF TRUE'),
    'V2-begin-ignores-closed': (
        'valid-close', 'V2_NoCredentialAfterClose',
        'IF closed \\/ r \\in signalled',
        'IF r \\in signalled'),
    'V2-late-refusal-reports': (
        'valid-close', 'V2_NoCredentialAfterClose',
        '/\\ UNCHANGED <<st, refusals, cred>>',
        '/\\ cred\' = [cred EXCEPT !.report = @ + 1]\n            /\\ UNCHANGED <<st, refusals>>'),
    'V3-discovery-reports-again': (
        'valid-close', 'V3_RejectAtMostOnce',
        'THEN Settle(r, "authReq")\n       ELSE NoSettle\n  /\\ UNCHANGED <<sends, cutAt, signalled, refusals, cred,',
        'THEN Settle(r, "authReq")\n       ELSE NoSettle\n  /\\ cred\' = [cred EXCEPT !.report = @ + 1]\n'
        '  /\\ UNCHANGED <<sends, cutAt, signalled, refusals,'),
    'V3-report-without-handle': (
        'valid-no-handle', 'V3_RejectAtMostOnce',
        '/\\ cred\' = IF HasHandle\n                         THEN [cred EXCEPT !.report = @ + (IF "report-twice" \\in Bugs THEN 2 ELSE 1)]\n'
        '                         ELSE cred',
        '/\\ cred\' = [cred EXCEPT !.report = @ + (IF "report-twice" \\in Bugs THEN 2 ELSE 1)]'),
    'V4-close-keeps-caller': (
        'valid-close', 'V4_CloseBounded',
        '/\\ cw\' = IF CallerFollows THEN cw\n           ELSE [r \\in Reqs |-> IF r \\in InFlight THEN "answered" ELSE cw[r]]',
        '/\\ cw\' = cw'),
    'V4-close-waits-discovery': (
        'valid-close', 'V4_CloseBounded',
        'LET InFlight == {r \\in Reqs : st[r] \\in InFlightPhases}',
        'LET InFlight == {r \\in Reqs : st[r] \\in {"auth", "sent"}}'),
    'V4-signal-leaves-discovery': (
        'valid-close', 'V4_SignalBounded',
        'IF st[r] \\in InFlightPhases /\\ "signal-dead" \\notin Bugs',
        'IF st[r] \\in {"auth", "sent"} /\\ "signal-dead" \\notin Bugs'),
    'V5-write-resends': (
        'valid-close', 'V5_NoResendForCaller',
        'CanResend(r) == (r \\notin Writes \\/ "resend-any" \\in Bugs) /\\ sends[r] < MaxSends',
        'CanResend(r) == sends[r] < MaxSends'),
    'V5-read-resends-twice': (
        'valid-signal', 'V5_NoResendForCaller',
        'CanResend(r) == (r \\notin Writes \\/ "resend-any" \\in Bugs) /\\ sends[r] < MaxSends',
        'CanResend(r) == (r \\notin Writes \\/ "resend-any" \\in Bugs) /\\ sends[r] =< MaxSends'),
    'V6-close-auth-abandoned': (
        'valid-close', 'V6_ByPhase',
        'CASE st[r] = "auth" -> "notSent"\n                     [] st[r] = "sent" -> (IF "close-not-sent"',
        'CASE st[r] = "auth" -> "abandoned"\n                     [] st[r] = "sent" -> (IF "close-not-sent"'),
    'V6-close-disc-not-sent': (
        'valid-close', 'V6_ByPhase',
        '[] st[r] = "disc" -> "authReq"\n                     [] OTHER -> out[r]]',
        '[] st[r] = "disc" -> "notSent"\n                     [] OTHER -> out[r]]'),
    'V6-signal-sent-not-sent': (
        'valid-close', 'V6_ByPhase',
        '[] st[r] = "sent" -> "abandoned"\n                           [] st[r] = "disc" -> "authReq")',
        '[] st[r] = "sent" -> "notSent"\n                           [] st[r] = "disc" -> "authReq")'),
    'V2-begin-ignores-dead': (
        'valid-close', 'V2_NoWireAfterDead',
        'r \\in signalled \\/ Dead',
        'r \\in signalled'),
    'V2-dead-read-resends': (
        'valid-close', 'V2_NoWireAfterDead',
        'THEN IF CanResend(r) /\\ Dead',
        'THEN IF FALSE'),
    'V4-ended-leaves-authorizing': (
        'valid-close', 'V4_DeadBounded',
        'THEN {"sent", "disc"} ELSE InFlightPhases',
        'THEN {"sent", "disc"} ELSE {"sent", "disc"}'),
    'V4-dead-keeps-caller': (
        'valid-close', 'V4_DeadBounded',
        'IF r \\in own \\/ (r \\in stops /\\ ~CallerFollows)',
        'IF r \\in own'),
    'V6-dead-settles-discovery': (
        'valid-close', 'V6_ByPhase',
        'ELSE IF st[r] = "disc" THEN "none"',
        'ELSE IF st[r] = "disc" THEN "authReq"'),
    'V6-gone-auth-broken': (
        'valid-close', 'V6_ByPhase',
        'ELSE IF st[r] = "auth" THEN "notSent"',
        'ELSE IF st[r] = "auth" THEN sentAnswer'),
    'V6-gone-sent-abandoned': (
        'valid-close', 'V6_ByPhase',
        '"gone", "broken")',
        '"gone", "abandoned")'),
    'V6-ended-abandons-sent': (
        'valid-close', 'V6_ByPhase',
        '"ended", "none")',
        '"ended", "abandoned")'),
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


def tlc(name, module, config, expected, jar, java, workers, evidence):
    """Run TLC once on `module` with `config`; keep the output as `<name>.out` in `evidence`."""
    states = evidence / f'{name}.states'
    started = time.monotonic()
    completed = subprocess.run(
        [java, '-XX:+UseParallelGC', '-cp', jar, 'tlc2.TLC', '-workers', str(workers),
         '-config', str(config), '-metadir', str(states), str(module)],
        capture_output=True, text=True, check=False)
    seconds = round(time.monotonic() - started, 1)
    shutil.rmtree(states, ignore_errors=True)
    output = completed.stdout + completed.stderr
    (evidence / f'{name}.out').write_text(output)
    stats = STATS.findall(output)
    depth = DEPTH.findall(output)
    return {
        'tlc': VERSION.findall(output)[:1],
        'model_sha256': sha256(module),
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


def run_case(case, jar, java, workers, evidence):
    result = tlc(case, MODEL, ROOT / f'{case}.cfg', CASES[case], jar, java, workers, evidence)
    return {'case': case, **result}


def mutant_config(base, invariant):
    """The constants of the base case, checking only `invariant`."""
    lines = (ROOT / f'{base}.cfg').read_text().splitlines()
    head = lines[:lines.index('INVARIANTS')]
    return '\n'.join(head + ['INVARIANTS', f'  {invariant}']) + '\n'


def run_mutation(name, jar, java, workers, evidence):
    base, invariant, old, new = MUTATIONS[name]
    source = MODEL.read_text()
    occurrences = source.count(old)
    if occurrences != 1:
        return {'mutation': name, 'base': base, 'invariant': invariant, 'passed': False,
                'error': f'the fragment to mutate occurs {occurrences} times, not once'}
    workdir = evidence / f'mutant-{name}'
    workdir.mkdir(parents=True, exist_ok=True)
    module = workdir / MODEL.name
    module.write_text(source.replace(old, new))
    config = workdir / f'{base}.cfg'
    config.write_text(mutant_config(base, invariant))
    result = tlc(f'mutant-{name}', module, config, invariant, jar, java, workers, evidence)
    return {'mutation': name, 'base': base, 'invariant': invariant, 'old': old, 'new': new,
            **result}


def report(kind, name, result):
    verdict = 'as expected' if result['passed'] else 'NOT AS EXPECTED'
    if 'error' in result:
        print(f'{name}: {verdict}; {result["error"]}')
        return
    print(f"{name}: {verdict}; violated {result['violated'] or 'no invariant'}; "
          f"{result['distinct']} distinct states, depth {result['depth']}, {result['seconds']} s")


def main(argv):
    mutations = bool(argv) and argv[0] == '--mutations'
    names = argv[1:] if mutations else argv
    table = MUTATIONS if mutations else CASES
    names = names or list(table)
    unknown = [name for name in names if name not in table]
    if unknown:
        kind = 'mutations' if mutations else 'cases'
        print(f'unknown {kind}: {", ".join(unknown)}', file=sys.stderr)
        return 2
    jar = os.environ.get('TLA2TOOLS_JAR', '/opt/tlaplus/tla2tools.jar')
    java = os.environ.get('JAVA_BIN', 'java')
    workers = int(os.environ.get('FORMAL_WORKERS', '4'))
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    base = Path(os.environ.get('FORMAL_OUTPUT_DIR', REPOSITORY / 'tmp/formal/mcp-host-local/runs'))
    evidence = base / (f'{stamp}-mutations' if mutations else stamp)
    evidence.mkdir(parents=True, exist_ok=True)
    results = []
    for name in names:
        result = (run_mutation if mutations else run_case)(name, jar, java, workers, evidence)
        results.append(result)
        report('mutation' if mutations else 'case', name, result)
    summary = {
        'jar_sha256': sha256(Path(jar)),
        'model_sha256': sha256(MODEL),
        'workers': workers,
        'results': results,
    }
    (evidence / ('mutations.json' if mutations else 'summary.json')).write_text(
        json.dumps(summary, indent=1) + '\n')
    print(f'evidence: {evidence}')
    return 0 if all(result['passed'] for result in results) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
