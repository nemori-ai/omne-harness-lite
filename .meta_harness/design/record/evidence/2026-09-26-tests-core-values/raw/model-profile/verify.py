from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
evidence = root / 'tmp/w2-model-profile'
pkg = root / 'packages/core/model-profile'
consumer_modules = evidence / 'consumer/node_modules'
(consumer_modules / '@omne-harness-lite').mkdir(parents=True, exist_ok=True)
for name in ('model-profile', 'content-blocks', 'identity-values'):
    link = consumer_modules / '@omne-harness-lite' / name
    if not link.exists():
        link.symlink_to(root / 'packages/core' / name, target_is_directory=True)
types = consumer_modules / '@types'
if not types.exists():
    types.symlink_to(pkg / 'node_modules/@types', target_is_directory=True)

commands = [
    ('build', ['pnpm', '--filter', '@omne-harness-lite/model-profile', 'run', 'build']),
    ('typecheck', ['pnpm', '--filter', '@omne-harness-lite/model-profile', 'run', 'typecheck']),
    ('test', ['pnpm', '--filter', '@omne-harness-lite/model-profile', 'exec', 'vitest', 'run', '--reporter=verbose', '--reporter=json', '--outputFile=../../../tmp/w2-model-profile/vitest.json']),
    ('consumer-types', [str(pkg / 'node_modules/.bin/tsc'), '-p', str(evidence / 'consumer/tsconfig.json')]),
    ('consumer-runtime', ['node', str(evidence / 'consumer/consumer.mts')]),
    ('rules', ['node', '--experimental-strip-types', 'tools/ts-checks/src/cli.ts', 'packages/core/model-profile']),
    ('format', ['pnpm', 'format:check', '--', *[str(path.relative_to(root)) for path in sorted(pkg.rglob('*')) if path.is_file() and ('src' in path.parts or 'tests' in path.parts or path.name in ('package.json', 'tsconfig.build.json', 'tsconfig.test.json', 'vitest.config.ts')) and 'dist' not in path.parts and 'node_modules' not in path.parts]]),
]
results = []
for name, command in commands:
    result = subprocess.run(command, cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    log = evidence / f'{name}.log'
    log.write_text(result.stdout)
    results.append({'name': name, 'argv': command, 'cwd': str(root), 'exit_code': result.returncode, 'log': str(log.relative_to(root)), 'sha256': hashlib.sha256(log.read_bytes()).hexdigest()})
    print(name, result.returncode, flush=True)
    if result.returncode:
        print(result.stdout, flush=True)
        break

files = [path for path in pkg.rglob('*') if path.is_file() and 'node_modules' not in path.parts]
files += [root / 'package.json', root / 'pnpm-workspace.yaml', root / 'pnpm-lock.yaml', root / 'tsconfig.base.json']
files += [root / '.meta_harness/design/spec/data/model-profile/v1' / name for name in ('contract.md', 'model-profile.schema.json', 'examples.md')]
files += [root / '.meta_harness/design/realization/packages/core/model-profile' / name for name in ('README.md', 'design.md', 'verification.md', 'bindings.yaml')]
files += [root / '.meta_harness/design/registry' / name for name in ('catalog.json', 'frozen.json')]
report = {
    'worktree': str(root),
    'branch': subprocess.check_output(['git', 'branch', '--show-current'], cwd=root, text=True).strip(),
    'head_before_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'node': subprocess.check_output(['node', '--version'], cwd=root, text=True).strip(),
    'pnpm': subprocess.check_output(['pnpm', '--version'], cwd=root, text=True).strip(),
    'results': results,
    'files': {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(files)},
    'environment_smoke_note': 'make check ran from initial HEAD while model-profile files were subsequently created in this tree; its log is not immutable baseline or package acceptance evidence.',
}
(evidence / 'results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
raise SystemExit(0 if len(results) == len(commands) and all(result['exit_code'] == 0 for result in results) else 1)
