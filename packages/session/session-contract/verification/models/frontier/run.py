#!/usr/bin/env python3
"""Run pinned finite models into a new, explicit evidence directory."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
EXPECTED_JAR = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
MODELS = ('frontier', 'pm02', 'gap-isolation', 'frozen-active')
namespace = {'__name__': 'classifier_library'}
exec(compile((BASE / 'classify.py').read_text(), 'classify.py', 'exec'), namespace)
classify = namespace['classify']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def clean_environment():
    env = dict(os.environ, NO_COLOR='1', TERM='dumb', LC_ALL='C', LANG='C')
    for key in ('JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'CLASSPATH'):
        env.pop(key, None)
    return env


def verify_inputs():
    expected = json.loads((BASE / 'integrity.json').read_text())
    for relative, wanted in expected.items():
        path = BASE / relative
        if not path.is_file() or digest(path) != wanted:
            raise ValueError('Adopted input differs: ' + relative)
    return expected


def stop(proc):
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()


def execute(argv, cwd, env, timeout):
    begin = time.monotonic()
    with (cwd / 'tlc.log').open('x') as out:
        proc = subprocess.Popen(argv, cwd=cwd, env=env, stdout=out,
                                stderr=subprocess.STDOUT, start_new_session=True)
        try:
            proc.wait(timeout=timeout)
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
            stop(proc)
        except BaseException:
            stop(proc)
            raise
    return proc.returncode, timed_out, round(time.monotonic() - begin, 3)


def run_case(case, model, run, java, jar, args, env):
    case_dir = run / case['name']
    case_dir.mkdir()
    source = BASE / model / (case['module'] + '.tla')
    cfg = BASE / model / 'cfg' / (case['name'] + '.cfg')
    shutil.copyfile(source, case_dir / source.name)
    shutil.copyfile(cfg, case_dir / 'run.cfg')
    (case_dir / 'java-tmp').mkdir()
    argv = [java, '-Djava.io.tmpdir=' + str(case_dir / 'java-tmp'),
            '-XX:+UseParallelGC', '-Xmx' + args.heap, '-cp', str(jar), 'tlc2.TLC',
            '-workers', '1', '-checkpoint', '0', '-seed', '1', '-fp', '0',
            '-metadir', str(case_dir / 'states'), '-config', 'run.cfg', case['module']]
    result = dict(case, argv=argv, cwd=str(case_dir), start=now(),
                  config_sha256=digest(cfg), source_sha256=digest(source),
                  timeout_seconds=args.timeout, heap_limit=args.heap,
                  met_expectation=False)
    save(case_dir / 'result.json', result)
    try:
        code, timed_out, elapsed = execute(argv, case_dir, env, args.timeout)
        log = (case_dir / 'tlc.log').read_text()
        stats = re.findall(r'([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue', log)
        depth = re.findall(r'The depth of the complete state graph search is ([\d,]+)', log)
        result.update(exit=code, timed_out=timed_out, elapsed_seconds=elapsed,
                      violations=re.findall(r'Invariant (\w+) is violated\.', log),
                      stats=stats[-1] if stats else None, depth=depth[-1] if depth else None,
                      log_sha256=digest(case_dir / 'tlc.log'),
                      met_expectation=classify(code, timed_out, log, case['expected_invariant']))
    except (Exception, KeyboardInterrupt) as error:
        result.update(error=type(error).__name__ + ': ' + str(error), exit=None)
        raise
    finally:
        result['end'] = now()
        save(case_dir / 'result.json', result)
    return result


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', choices=MODELS, required=True)
    parser.add_argument('--cases', nargs='+')
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--timeout', type=int, default=300)
    parser.add_argument('--heap', default='1536m')
    parser.add_argument('--java-bin', default=os.environ.get('JAVA_BIN', 'java'))
    args = parser.parse_args()
    if args.timeout < 1 or not re.fullmatch(r'[1-9][0-9]*[mMgG]', args.heap):
        parser.error('timeout must be positive; heap must be a positive integer with m or g')
    if not args.list and args.output_dir is None:
        parser.error('--output-dir is required for execution')
    return args


def main():
    args = arguments()
    all_cases = json.loads((BASE / args.model / 'cases.json').read_text())
    if args.list:
        print(json.dumps(all_cases, indent=2))
        return 0
    chosen = [case for case in all_cases if args.cases is None or case['name'] in args.cases]
    if not chosen or (args.cases is not None and (len(chosen) != len(args.cases))):
        raise SystemExit('unknown, repeated, or empty case selection')
    run = args.output_dir.resolve()
    if run == BASE or BASE in run.parents:
        raise SystemExit('output must be outside the model resource directory')
    # Exclusive creation is also the evidence overwrite guard.
    run.mkdir(parents=True, exist_ok=False)
    manifest = dict(start=now(), model=args.model, resource_root=str(BASE),
                    runner_sha256=digest(Path(__file__)),
                    classifier_sha256=digest(BASE / 'classify.py'),
                    cases_sha256=digest(BASE / args.model / 'cases.json'),
                    selected_cases=[case['name'] for case in chosen],
                    cases=[], all_met_expectation=False, status='running')
    save(run / 'results.json', manifest)
    code = 2
    try:
        manifest['adopted_inputs'] = verify_inputs()
        jar_value = os.environ.get('TLA2TOOLS_JAR')
        if not jar_value:
            raise ValueError('TLA2TOOLS_JAR is required; no model was run')
        jar = Path(jar_value).resolve(strict=True)
        if digest(jar) != EXPECTED_JAR:
            raise ValueError('TLA2TOOLS_JAR hash differs from the adopted 1.7.4 tool')
        java = shutil.which(args.java_bin)
        if java is None:
            raise ValueError('Java executable is unavailable: ' + args.java_bin)
        java = str(Path(java).resolve())
        env = clean_environment()
        manifest.update(jar=str(jar), jar_sha256=digest(jar), java=java,
                        java_executable_sha256=digest(Path(java)), python=sys.version,
                        environment={k: env[k] for k in ('NO_COLOR', 'TERM', 'LC_ALL', 'LANG')})
        version = subprocess.run([java, '-version'], capture_output=True, text=True, env=env, timeout=15)
        (run / 'java-version.log').write_text(version.stdout + version.stderr)
        manifest['java_version_exit'] = version.returncode
        if version.returncode:
            raise ValueError('java -version did not complete successfully')
        shutil.copyfile(Path(__file__), run / 'run.py')
        shutil.copyfile(BASE / 'classify.py', run / 'classify.py')
        shutil.copyfile(BASE / args.model / 'cases.json', run / 'cases.json')
        save(run / 'results.json', manifest)
        for case in chosen:
            result = run_case(case, args.model, run, java, jar, args, env)
            manifest['cases'].append(result)
            save(run / 'results.json', manifest)
            print(case['name'], 'PASS' if result['met_expectation'] else 'INCOMPLETE_OR_FAIL', flush=True)
        manifest['all_met_expectation'] = all(c['met_expectation'] for c in manifest['cases'])
        manifest['status'] = 'complete' if manifest['all_met_expectation'] else 'incomplete-or-fail'
        code = 0 if manifest['all_met_expectation'] else 1
    except (Exception, KeyboardInterrupt) as error:
        manifest.update(status='unavailable-or-error', error=type(error).__name__ + ': ' + str(error))
        print(manifest['error'], file=sys.stderr)
    finally:
        manifest['end'] = now()
        manifest['exit'] = code
        save(run / 'results.json', manifest)
        print('RUN', run, flush=True)
    return code


def interrupted(signum, frame):
    raise KeyboardInterrupt('received signal ' + str(signum))


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    sys.exit(main())
