"""Check Alloy receipt semantics; process exit zero alone is not success evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

FORMAL = Path(__file__).resolve().parent
POSITIVE = {
    'lockedRootWitness': ('run', True),
    'mismatchWitness': ('run', True),
    'RootNeverBecomesMember': ('check', False),
    'VisibleRootIsProjected': ('check', False),
    'MissingRootContributesNoSetting': ('check', False),
    'SourceMismatchRejects': ('check', False),
    'RootOuterLockWins': ('check', False),
    'NoLockTakesInnermost': ('check', False),
}
MUTATIONS = {
    'root_enters_composition': (
        'accepted => composition else none',
        'accepted => composition + Root.rootCap else none',
        'RootNeverBecomesMember',
    ),
    'root_not_projected': (
        '=> RootInput.declarations else none',
        '=> none else none',
        'VisibleRootIsProjected',
    ),
    'missing_root_projects': (
        '(accepted and some effective[Root.rootCap]) => RootInput.declarations else none',
        'accepted => RootInput.declarations else none',
        'MissingRootContributesNoSetting',
    ),
    'source_guard_removed': (
        'pred accepted {\n  no effective[Root.rootCap]\n  or (RootInput.sourceAsset = effective[Root.rootCap]\n      and RootInput.sourceVersion = effective[Root.rootCap].(VersionSelection.selectedVersion))\n}',
        'pred accepted { some Root }',
        'SourceMismatchRejects',
    ),
    'root_lock_ignored': (
        'i in rootProjected => settingFrom[Root.rootCap, i] else none',
        'i in rootProjected => Session else none',
        'RootOuterLockWins',
    ),
    'inner_override_ignored': (
        'i in rootProjected => settingFrom[Root.rootCap, i] else none',
        'i in rootProjected => Factory else none',
        'NoLockTakesInnermost',
    ),
}


def execute(model, destination, command, expected):
    argv = ['alloy', 'exec', '-q', '-c', command, '-t', 'json', '-o', str(destination), str(model)]
    with destination.with_suffix('.log').open('w') as output:
        result = subprocess.run(argv, stdout=output, stderr=subprocess.STDOUT, check=False)
    if result.returncode:
        raise RuntimeError(f'Alloy process failed: {destination}')
    receipt = json.loads((destination / 'receipt.json').read_text())
    commands = receipt.get('commands', {})
    if set(commands) != set(expected):
        raise RuntimeError(f'Unexpected command set: {destination}')
    outcomes = {}
    for name, (kind, satisfiable) in expected.items():
        actual = commands[name]
        if actual.get('type') != kind or bool(actual.get('solution')) != satisfiable:
            raise RuntimeError(f'Unexpected result for {name}: {destination}')
        outcomes[name] = {'kind': kind, 'satisfiable': satisfiable}
    return {'argv': argv, 'returncode': result.returncode, 'commands': outcomes}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--validity', action='store_true')
    args = parser.parse_args()
    args.output.resolve().mkdir(parents=True, exist_ok=True)
    target = Path(tempfile.mkdtemp(prefix='run-', dir=args.output.resolve()))
    hashes = {name: hashlib.sha256((FORMAL / name).read_bytes()).hexdigest()
              for name in ['RootSettings.als', 'Evaluation.als', 'check-root-settings.py']}
    version = subprocess.run(['alloy', 'version'], capture_output=True, text=True, check=True).stdout.strip()
    summary = {'alloy_version': version, 'input_sha256': hashes, 'validity': args.validity, 'results': {}}
    if args.validity:
        for name, (old, new, assertion) in MUTATIONS.items():
            directory = target / name
            directory.mkdir()
            shutil.copyfile(FORMAL / 'Evaluation.als', directory / 'Evaluation.als')
            source = (FORMAL / 'RootSettings.als').read_text()
            if source.count(old) != 1:
                raise RuntimeError(f'Mutation site drift: {name}')
            mutant = directory / 'RootSettings.als'
            mutant.write_text(source.replace(old, new, 1))
            summary['results'][name] = execute(mutant, directory / 'out', assertion, {assertion: ('check', True)})
    else:
        summary['results']['positive'] = execute(FORMAL / 'RootSettings.als', target / 'out', '*', POSITIVE)
    (target / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': 'passed', 'alloy_version': version, 'validity': args.validity,
                      'cases': sum(len(v['commands']) for v in summary['results'].values()),
                      'summary': str(target / 'summary.json')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
