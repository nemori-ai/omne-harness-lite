"""Replay the bounded verification; JAVA and TLA_JAR select the toolchain."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
FORMAL = ROOT / '.meta_harness/design/spec/capabilities/external-hooks/v1/formal'
JAVA = Path(os.environ['JAVA']).resolve()
JAR = Path(os.environ['TLA_JAR']).resolve()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


sources = [FORMAL / 'JointHooksRunControl.tla', Path(__file__).resolve()]
design = ROOT / '.meta_harness/design'
sources += [design / f'decisions/{name}/decision.md' for name in (
    'e-message-stream-hooks', 'e-message-recovery-protocol')]
sources += [design / f'spec/capabilities/{name}/v1/contract.md' for name in (
    'external-hooks', 'run', 'run-driver', 'action-authorization',
    'human-decisions', 'session', 'tools')]
sources += [design / 'spec/compositions/core-work-coordination/v1/contract.md']
results = []
for cfg in sorted(FORMAL.glob('JointHooksRunControl.*.cfg')):
    with tempfile.TemporaryDirectory(prefix='j-hooks-tlc-') as state:
        cmd = [str(JAVA), '-XX:+UseParallelGC', '-Xmx512m', '-cp', str(JAR),
               'tlc2.TLC', '-workers', '1', '-seed', '1', '-fp', '0',
               '-noGenerateSpecTE', '-metadir', state, '-config', cfg.name,
               'JointHooksRunControl.tla']
        p = subprocess.run(cmd, cwd=FORMAL, text=True, capture_output=True)
    log = HERE / (cfg.stem + '.log')
    log.write_text(p.stdout + p.stderr)
    normal = cfg.stem.endswith('-none')
    expected = (p.returncode == 0 and 'No error has been found' in p.stdout
                if normal else p.returncode == 12 and
                'Invariant Safety is violated' in p.stdout)
    results.append(dict(config=str(cfg.relative_to(ROOT)),
                        config_sha256=sha(cfg), command=cmd,
                        cwd=str(FORMAL.relative_to(ROOT)), exit_code=p.returncode,
                        expected_result=expected, log=log.name, log_sha256=sha(log)))
    print(cfg.stem, p.returncode, expected)
manifest = dict(baseline_commit='d6669f28072e759f40a64386836b333f06d71d4c',
                java=str(JAVA), java_sha256=sha(JAVA), jar=str(JAR),
                jar_sha256=sha(JAR), inputs={str(p.relative_to(ROOT)): sha(p)
                                           for p in sources}, results=results)
(HERE / 'results.json').write_text(json.dumps(manifest, indent=2) + '\n')
raise SystemExit(0 if all(r['expected_result'] for r in results) else 1)
