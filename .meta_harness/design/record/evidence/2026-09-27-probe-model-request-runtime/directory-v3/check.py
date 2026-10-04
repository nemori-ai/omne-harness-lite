"""Read-only structural checks for the directory v3 candidate; not behavior tests."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DESIGN = ROOT / '.meta_harness/design'
TOPIC = DESIGN / 'spec/capabilities/model-profile-directory'
OUTPUT = Path(__file__).resolve().parent
BASELINE = 'd4eaf7673bc161bf22f6682385151e080d3323ae'
checks = 0


def check(condition: bool, description: str) -> None:
    global checks
    if not condition:
        raise AssertionError(description)
    checks += 1
    print(f'PASS {description}')


body = (TOPIC / 'v3/contract.md').read_text()
matches = list(re.finditer(r'^### S-(\d+) ([^\n]+)$', body, re.M))
clauses = {int(m.group(1)): body[m.end():matches[i + 1].start() if i + 1 < len(matches) else len(body)] for i, m in enumerate(matches)}
# Scenario clauses S-25..S-30 are level-four headings.
all_numbers = re.findall(r'^#{3,4} S-(\d+) ', body, re.M)
check(sorted(map(int, all_numbers)) == list(range(1, 36)), '35 unique clauses S-1..S-35')
operations = {14:'registerProfile',15:'withdrawProfile',16:'readProfile',17:'listProfiles',18:'loadManifest',19:'bindCredential',20:'resolveCredential',31:'updateProfile',32:'unbindCredential',33:'relistProfile'}
for number, name in operations.items():
    check(f'### S-{number} {name}\n' in body, f'operation retained: {name}')
    rows = re.findall(r'^\| ([①②③④⑤⑥⑦⑧⑨]) \|', clauses[number], re.M)
    check(rows == list('①②③④⑤⑥⑦⑧⑨'), f'nine operation obligations: {name}')

metadata = json.loads((OUTPUT / 'registry-candidate.json').read_text())
entry = metadata['catalog_entry']
check(entry['status'] == 'candidate' and entry['acceptance'] is None, 'metadata has candidate status only')
for resource in entry['resources']:
    check((DESIGN / resource).is_file(), f'resource exists: {resource}')
for dependency in entry['dependencies']:
    coordinate = dependency['coordinate']
    family, topic = coordinate['contract_id'].split('.', 1)
    family = {'data':'data','capability':'capabilities','composition':'compositions'}[family]
    path = DESIGN / 'spec' / family / topic / f"v{coordinate['version']}" / 'contract.md'
    text = path.read_text()
    for clause in dependency['clauses']:
        check(bool(re.search(r'^#{1,6}\s+' + re.escape(clause) + r'(?:\s|$)', text, re.M)), f'dependency clause exists: {coordinate["contract_id"]}/v{coordinate["version"]}#{clause}')
for cover in metadata['covers_to_add']:
    check(cover['reviewed'] is False and cover['target']['version'] == 3, 'inherited cover does not claim review')
check(not metadata['formal_tasks_to_add'] and not metadata['id_namespaces_to_add'] and not metadata['frozen_to_add'], 'no invented formal, namespace or freeze registration')
check(not re.search(r'\b(?:inject|effect|isolate|thisArg)\b', body), 'contract has no provider mechanism API terms')

for name in ['contract.md','examples.md']:
    relative = f'.meta_harness/design/spec/capabilities/model-profile-directory/v2/{name}'
    old = subprocess.run(['git','show',f'{BASELINE}:{relative}'], cwd=ROOT, check=True, capture_output=True).stdout
    check((ROOT / relative).read_bytes() == old, f'frozen v2 unchanged: {name}')

hash_paths = [TOPIC/'v3/contract.md', TOPIC/'v3/examples.md', TOPIC/'README.md', TOPIC/'verification.md', OUTPUT/'registry-candidate.json', OUTPUT/'check.py', DESIGN/'spec/data/model-profile/v3/contract.md', DESIGN/'spec/data/model-profile/v3/model-profile.schema.json', DESIGN/'record/proposals/model-request-adaptation/design.md']
hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in hash_paths}
(OUTPUT/'input-hashes.json').write_text(json.dumps({'baseline':BASELINE,'sha256':hashes},ensure_ascii=False,indent=2)+'\n')
print(f'PASS: {checks} structural checks. No runtime, storage, authorization, or formal behavior execution.')
