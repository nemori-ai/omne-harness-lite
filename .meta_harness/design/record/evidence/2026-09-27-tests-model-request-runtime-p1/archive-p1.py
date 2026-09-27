from pathlib import Path
import hashlib, json, os, re, shutil, stat, subprocess, tarfile

root = Path.cwd()
task = root / 'tmp/model-request-runtime'
run = root / '.meta_harness/design/record/evidence/2026-09-27-tests-model-request-runtime-p1'
assert not run.exists(), 'Evidence run already exists; do not overwrite'
stage = task / 'p1-evidence-inputs'
assert not stage.exists(), 'Snapshot already exists; do not overwrite'
stage.mkdir(mode=0o700)

# Read the explicitly authorized credential only to reject accidental disclosure.
# No credential, credential hash, or matching fragment is recorded.
credential_source = Path('/data/qiwei/repos/omne-harness-lite/.env').read_text()
matches = re.findall(r'^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*?)\s*$', credential_source, re.M)
assert len(matches) == 1
credential = matches[0].strip().strip('"\'').encode()
sentinels = [credential] + [credential[i:i+8] for i in range(len(credential)-7)]
assert credential

def scan(path):
    content = path.read_bytes()
    assert not any(value in content for value in sentinels), f'Secret sentinel: {path.relative_to(root) if path.is_relative_to(root) else path.name}'

def copy_file(source, target):
    scan(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    target.chmod(0o600)

def copy_tree(source, target, ignored=()):
    for base, dirs, files in os.walk(source):
        dirs[:] = sorted(d for d in dirs if d not in ignored and not Path(base, d).is_symlink())
        for name in sorted(files):
            path = Path(base, name)
            if path.is_symlink() or name.endswith('.tsbuildinfo'):
                continue
            copy_file(path, target / path.relative_to(source))

plan = json.loads((task / 'PLAN-INPUTS.json').read_text())
observations = []
frozen = json.loads((root / '.meta_harness/design/registry/frozen.json').read_text())['files']
for row in plan['files']:
    source = root / row['path']
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    key = row['path'].removeprefix('.meta_harness/design/')
    if key in frozen:
        assert digest == frozen[key], f'Frozen input changed: {key}'
    observations.append({**row, 'observedSha256': digest, 'matchesPlanObservation': digest == row['sha256'], 'frozen': key in frozen})
    copy_file(source, stage / 'current-inputs' / row['path'])

inventory = json.loads((task / 'readme-consumer/inventory.json').read_text())
packages = {str(Path(row['source']).parent) for row in inventory}
for artifact_file in ['p1-artifact-r1-location.json', 'p1-artifact-location.json']:
    artifact = Path(json.loads((task / artifact_file).read_text())['directory'])
    for path in artifact.rglob('*'):
        if path.is_symlink():
            assert path.resolve().is_relative_to(artifact), 'Artifact dependency escapes root'
        elif path.is_file():
            scan(path)
    for manifest in (artifact / 'node_modules/@omne-harness-lite').glob('*/package.json'):
        name = json.loads(manifest.read_text())['name']
        local = list((root / 'packages').glob('*/*/package.json'))
        matches = [p.parent for p in local if json.loads(p.read_text())['name'] == name]
        assert len(matches) == 1, name
        packages.add(str(matches[0].relative_to(root)))

for package in sorted(packages):
    copy_tree(root / package, stage / 'source' / package, ('node_modules', 'dist', '.git'))
for tool in ['tools/model-probe', 'tools/ts-checks']:
    copy_tree(root / tool, stage / 'source' / tool, ('node_modules', 'dist', '__pycache__'))
for name in ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json']:
    copy_file(root / name, stage / 'source' / name)
copy_tree(root / 'scripts', stage / 'source/scripts', ('__pycache__',))
# Packages load contract Schemas and tests consume normative examples by relative path.
copy_tree(root / '.meta_harness/design/spec', stage / 'source/.meta_harness/design/spec', ('__pycache__',))
copy_tree(task / 'readme-consumer', stage / 'readme-consumer', ('node_modules',))
for source in sorted(task.glob('p1-*.txt')):
    copy_file(source, stage / 'logs' / source.name)
for source in sorted(task.glob('p1-*.json')):
    copy_file(source, stage / 'observations' / source.name)
for name in ['p1-paid-public.mjs', 'PLAN-INPUTS.json', 'README-DELIVERY-ADDENDUM.md']:
    copy_file(task / name, stage / 'construction' / name)

privacy = []
for pointer in ['p1-public-latest.json', 'p1-public-final.json']:
    directory = Path(json.loads((task / pointer).read_text())['output'])
    assert stat.S_IMODE(directory.stat().st_mode) == 0o700
    for path in directory.iterdir():
        assert path.is_file() and not path.is_symlink()
        assert stat.S_IMODE(path.stat().st_mode) == 0o600
        denied = subprocess.run(['sudo', '-n', '-u', 'nobody', 'cat', str(path)], capture_output=True)
        assert denied.returncode != 0 and not denied.stdout
    privacy.append({'runId': directory.name, 'directoryMode': '0700', 'fileMode': '0600', 'uid': directory.stat().st_uid, 'nobodyReadDenied': True, 'files': len(list(directory.iterdir()))})
    copy_tree(directory, stage / 'paid' / directory.name)
copy_file(task / 'ledger.json', stage / 'observations/ledger-final.json')

environment = {'branch': subprocess.check_output(['git','branch','--show-current'], text=True).strip(), 'head': subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip(), 'platform': os.uname().sysname, 'uid': os.getuid(), 'node': subprocess.check_output(['node','--version'], text=True).strip(), 'pnpm': subprocess.check_output(['pnpm','--version'], text=True).strip(), 'python': subprocess.check_output(['.venv/bin/python','--version'], text=True).strip(), 'sourcePackages': sorted(packages), 'paidImplementationRevisions': [1,2], 'intermediateFailedSourceSnapshotsComplete': False, 'currentSourceAndPaidArtifactsComplete': True}
(stage / 'environment.json').write_text(json.dumps(environment, indent=2)+'\n')
(stage / 'input-observations.json').write_text(json.dumps(observations, indent=2)+'\n')
(stage / 'privacy.json').write_text(json.dumps(privacy, indent=2)+'\n')

run.mkdir(mode=0o700)
def archive(source, name):
    destination = run / name
    with tarfile.open(destination, 'x:gz', dereference=False) as tar:
        tar.add(source, arcname='input' if source == stage else 'artifact')
    destination.chmod(0o600)

archive(stage, 'source-config-and-runs.tar.gz')
archive(Path(json.loads((task / 'p1-artifact-r1-location.json').read_text())['directory']), 'public-artifact-r1.tar.gz')
archive(Path(json.loads((task / 'p1-artifact-location.json').read_text())['directory']), 'public-artifact-r2.tar.gz')
for name in ['environment.json','input-observations.json','privacy.json']:
    copy_file(stage / name, run / name)
copy_file(task / 'p1-readme-completion.json', run / 'readme-completion.json')
hashes = []
for source in sorted(stage.rglob('*')):
    if source.is_file():
        hashes.append({'path': str(source.relative_to(stage)), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
archives = [{'path': name, 'sha256': hashlib.sha256((run/name).read_bytes()).hexdigest(), 'bytes': (run/name).stat().st_size} for name in ['source-config-and-runs.tar.gz','public-artifact-r1.tar.gz','public-artifact-r2.tar.gz']]
(run/'input-and-output-hashes.json').write_text(json.dumps({'files':hashes,'archives':archives},indent=2)+'\n')
(run/'secret-scan.json').write_text(json.dumps({'fullCredentialAndAllEightCharacterWindowsChecked':True,'hits':0,'credentialAndHashesRecorded':False,'artifactSymlinksStayInsideRoot':True,'files':len(hashes)},indent=2)+'\n')
for path in run.iterdir():
    if path.is_file(): path.chmod(0o600)
print(json.dumps({'run':str(run.relative_to(root)), 'snapshotFiles':len(hashes),'packages':len(packages),'privacy':privacy,'planObservationChanges':[row['path'] for row in observations if not row['matchesPlanObservation']], 'archives':archives}))
