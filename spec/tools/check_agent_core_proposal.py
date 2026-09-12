"""Document/reference and structural checks; NOT behavior verification."""
import json
import re
from pathlib import Path

SPEC = Path(__file__).resolve().parents[1]
DOMAIN = SPEC / 'domain'
PROPOSAL = SPEC / 'proposals/agent-core/v1'
models = json.loads((DOMAIN / 'registry.json').read_text())['models']
keys = [(m['id'], m['version']) for m in models]
assert len(keys) == len(set(keys)), 'duplicate registered identity/version'
for m in models:
    assert (DOMAIN / m['path']).is_file(), m['path']
    if 'schema' in m:
        assert (DOMAIN / m['schema']).is_file(), m['schema']
for root in [DOMAIN, PROPOSAL]:
    for path in root.rglob('*.md'):
        for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
            if '://' in target or target.startswith('#'):
                continue
            assert (path.parent / target.split('#')[0]).exists(), (path, target)

print(f"PASS: {len(models)} registered model versions and local document links.")
print("Schema/behavior validation is not performed; unapproved model definitions were withdrawn.")
