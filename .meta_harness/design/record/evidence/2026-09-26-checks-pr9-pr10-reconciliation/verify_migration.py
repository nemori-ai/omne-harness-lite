"""Recheck this reconciliation against its fixed inputs; uses Python stdlib only."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import tarfile
from urllib.parse import urldefrag, urljoin, unquote

HERE = Path(__file__).resolve().parent
DESIGN = HERE.parents[2]
REPO = DESIGN.parents[1]

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def read(name):
    return json.loads((DESIGN / name).read_text())

def coordinate(value):
    return tuple(value[k] for k in ('baseline_id', 'contract_id', 'version'))

def archive(path):
    with tarfile.open(path, 'r:gz') as stream:
        return {item.name.removeprefix('.meta_harness/design/'): stream.extractfile(item).read()
                for item in stream.getmembers() if item.isfile()}

def strip_comments(text, extension):
    if extension == '.als':
        return re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', text, flags=re.S))
    return re.sub(r'\\\*[^\n]*', '', re.sub(r'\(\*.*?\*\)', '', text, flags=re.S))

def main():
    inputs = json.loads((HERE / 'inputs.json').read_text())
    for name, digest in inputs['snapshots'].items():
        assert sha((HERE / name).read_bytes()) == digest, name
    omitted = json.loads((HERE / inputs['draft_snapshot_scope']['omitted_manifest']).read_text())
    assert omitted['source_commit'] == inputs['draft']
    for item in omitted['files']:
        raw = subprocess.check_output(['git', 'show', inputs['draft'] + ':' + item['path']], cwd=REPO)
        assert sha(raw) == item['sha256'] and len(raw) == item['bytes'], item['path']
    old = archive(HERE / 'main-design-input.tar.gz')
    draft = archive(HERE / 'draft-design-input.tar.gz')
    migration = read('registry/version-migrations.json')
    assert migration['source_commit'] == inputs['main']
    assert migration['protected_draft_commit'] == inputs['draft']
    current = read('registry/catalog.json')['contracts']
    frozen = read('registry/frozen.json')['files']
    by_coordinate = {coordinate(row['coordinate']): row for row in current}
    assert len(by_coordinate) == len(current) == 55
    for name, digest in frozen.items():
        assert sha((DESIGN / name).read_bytes()) == digest, name
    archived_counts = {}
    for label, tree in [('main', old), ('draft', draft)]:
        files = json.loads(tree['registry/frozen.json'])['files']
        for name, digest in files.items():
            assert sha(tree[name]) == digest, (label, name)
            if label == 'draft':
                assert frozen[name] == digest and (DESIGN / name).read_bytes() == tree[name], name
        archived_counts[label] = len(files)
    draft_catalog = json.loads(draft['registry/catalog.json'])['contracts']
    for row in draft_catalog:
        assert by_coordinate[coordinate(row['coordinate'])] == row, row['coordinate']
    mappings = {coordinate(row['source']): row['target'] for row in migration['contracts']}
    paths = {row['source_path']: row['target_path'] for row in migration['resources']}
    assert len(mappings) == 34 and len(paths) == 146
    shared = {name: digest for name, digest in json.loads(old['registry/frozen.json'])['files'].items()
              if name not in paths}
    assert len(shared) == 36
    for name, digest in shared.items():
        assert frozen[name] == digest and (DESIGN / name).read_bytes() == old[name], name
    def shifted(value):
        if isinstance(value, dict):
            if all(k in value for k in ('baseline_id', 'contract_id', 'version')):
                return mappings.get(coordinate(value), value)
            return {k: shifted(v) for k, v in value.items()}
        if isinstance(value, list):
            return [shifted(v) for v in value]
        return value
    old_catalog = json.loads(old['registry/catalog.json'])['contracts']
    for row in old_catalog:
        if coordinate(row['coordinate']) not in mappings:
            continue
        target = by_coordinate[coordinate(mappings[coordinate(row['coordinate'])])]
        assert target['dependencies'] == shifted(row['dependencies']), row['coordinate']
        assert set(target['resources']) == {paths[x] for x in row['resources']}
    formal_count = schema_count = 0
    for row in migration['resources']:
        source, target = old[row['source_path']], (DESIGN / row['target_path']).read_bytes()
        assert sha(source) == row['source_sha256'], row['source_path']
        assert sha(target) == row['target_sha256'] == frozen[row['target_path']], row['target_path']
        extension = Path(row['target_path']).suffix
        if extension in ('.tla', '.als', '.cfg'):
            assert strip_comments(source.decode(), extension) == strip_comments(target.decode(), extension), row['target_path']
            formal_count += 1
        if row['target_path'].endswith('.schema.json'):
            expected = source.decode()
            for c in old_catalog:
                replacement = mappings.get(coordinate(c['coordinate']))
                if replacement:
                    pattern = '/' + c['topic'] + '/v' + str(c['coordinate']['version'])
                    expected = re.sub(re.escape(pattern) + r'(?=/|#|$)',
                                      '/' + c['topic'] + '/v' + str(replacement['version']), expected)
            def validation_shape(value, namespace=False):
                if isinstance(value, dict):
                    annotations = {'title', 'description', '$comment', 'examples', 'default'}
                    namespaces = {'properties', '$defs', 'patternProperties', 'dependentSchemas'}
                    return {k: validation_shape(v, not namespace and k in namespaces)
                            for k, v in value.items() if namespace or k not in annotations}
                if isinstance(value, list):
                    return [validation_shape(v) for v in value]
                return value
            assert validation_shape(json.loads(expected)) == validation_shape(json.loads(target)), row['target_path']
            schema_count += 1
        if row['target_path'].endswith('contract.md'):
            clauses = lambda text: re.findall(r'^#{2,6}\s+(S-\d+)\b', text, flags=re.M)
            assert clauses(source.decode()) == clauses(target.decode()), row['target_path']
    schemas = {}
    for row in current:
        for name in row['resources']:
            if name.endswith('.schema.json'):
                value = read(name)
                schemas[value['$id']] = value
    refs_count = 0
    def check_refs(value, base):
        nonlocal refs_count
        if isinstance(value, dict):
            base = value.get('$id', base)
            if '$ref' in value:
                uri, fragment = urldefrag(urljoin(base, value['$ref']))
                assert uri in schemas, (base, value['$ref'])
                target = schemas[uri]
                if fragment:
                    assert fragment.startswith('/'), fragment
                    for part in unquote(fragment)[1:].split('/'):
                        part = part.replace('~1', '/').replace('~0', '~')
                        target = target[int(part)] if isinstance(target, list) else target[part]
                refs_count += 1
            for item in value.values():
                check_refs(item, base)
        elif isinstance(value, list):
            for item in value:
                check_refs(item, base)
    for uri, value in schemas.items():
        check_refs(value, uri)
    projections = {}
    for topic in ('PF-002-assets-settings-and-permissions', 'PF-003-asset-transfer-and-sharing',
                  'PF-006-tools-and-skills', 'PF-013-model-profiles-and-invocation'):
        provenance = read('product/' + topic + '/projection/v3/provenance.json')
        assert provenance['version'] == 'v3'
        for source in provenance['sources']:
            assert sha((DESIGN / source['resource']).read_bytes()) == source['sha256'], (topic, source['resource'])
            if source['frozen']:
                assert frozen[source['resource']] == source['sha256']
        projections[topic] = len(provenance['sources'])
    # Main carries design and taste changes only: preserve all existing product / tool code.
    unchanged = ['packages', 'apps', 'tools', 'scripts', 'package.json', 'pnpm-lock.yaml']
    diff = subprocess.check_output(['git', 'diff', inputs['draft'], '--', *unchanged], cwd=REPO)
    assert not diff, 'Product or development tool source changed'
    return {'result': 'PASS', 'inputs': inputs, 'archived_frozen': archived_counts,
            'protected_draft_resources': archived_counts['draft'], 'shared_main_resources_unchanged': len(shared), 'catalog_coordinates': len(current),
            'current_frozen_resources': len(frozen), 'migrated_contracts': len(mappings),
            'migrated_resources': len(paths), 'formal_files_with_identical_executable_text': formal_count,
            'migrated_schema_validation_keywords_equal_after_uri_mapping': schema_count,
            'registered_schemas': len(schemas), 'resolved_schema_refs': refs_count,
            'projection_sources': projections, 'product_and_development_tool_code_changed': False,
            'original_delivery_archives_verified_at_draft_commit': len(omitted['files']),
            'scope': 'Static reconciliation checks; no model, cross-OS or deployment rerun claim.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = json.dumps(main(), ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(result)
    print(result)
