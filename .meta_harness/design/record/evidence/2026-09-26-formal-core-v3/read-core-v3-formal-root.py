"""Read preserved raw results independently; never execute solvers or change the run."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ARCHIVE = Path('/data/qiwei/repos/omne-harness-lite/tmp/core-delivery/spoke-evidence/w6-core-formal-v3')
DESIGN = Path('.meta_harness/design')


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def load(p):
    return json.loads(p.read_text())


frozen = load(DESIGN / 'registry/frozen.json')['files']
snapshot = load(ARCHIVE / 'input-index.json')
for item in snapshot:
    path = item['path']
    assert digest(ARCHIVE / 'input' / path) == item['sha256'], path
    if item.get('frozen'):
        assert frozen[path] == item['sha256'] == digest(DESIGN / path), path
assert sum(bool(i.get('frozen')) for i in snapshot) == 32

task = next(t for t in load(DESIGN / 'registry/formal-tasks.json')['tasks']
            if t['id'] == 'stream-assembly-v3-assembly')
tools = load(ARCHIVE / 'tool-paths.json')
for tool in tools.values():
    assert digest(Path(tool['resolved'])) == tool['sha256']
expanded = [tools[x[2:-1]]['configured'] if x.startswith('${') else x for x in task['command']]
positive = load(ARCHIVE / 'runs/sa3-positive/invocation.json')
assert positive['argv'] == expanded and positive['timeout_seconds'] == task['timeout_seconds'] == 600
tlc = []
for label, invariant in [('sa3-positive', None),
                         ('sa3-Assembly_OrderByClose', 'BlockOrderIsOpenOrder'),
                         ('sa3-Assembly_ReplaceAsAppend', 'SplitInvariance'),
                         ('sa3-Assembly_OneShotCloseFirst', 'OneShotAccepted')]:
    base = ARCHIVE / 'runs' / label
    result = load(base / 'result.json')
    log = (base / 'stdout.log').read_text()
    assert not result['timed_out'] and result['exit_code'] == (12 if invariant else 0)
    assert result['argv'][result['argv'].index('-workers') + 1] == '1'
    assert result['timeout_seconds'] == 600 and 'with 1 worker' in log
    if invariant:
        assert f'Error: Invariant {invariant} is violated.' in log
        assert 'State 1:' in log and 'Abandon' in log
    else:
        assert 'Model checking completed. No error has been found.' in log
        assert '871519 states generated, 826411 distinct states found, 0 states left on queue.' in log
    tlc.append({'label': label, 'exit': result['exit_code'], 'violated_invariant': invariant})

ae_mutants = {
    1: ['LockTruncates', 'ReplacementCannotEscapePermission'],
    2: ['DisableIsDisjunction'], 3: ['WorkspaceNeverSourcesPermission'],
    4: ['OfficialLowerBound'], 5: ['TeamAssetsStayInTree'],
    6: ['WorkspaceNeverSourcesPlacement'],
    7: ['ReplacementCannotEscapePermission', 'UnusableKeepsBounds'],
    8: ['NonFittingPickNeverSources'], 9: ['UnusableNeverEffective'],
    10: ['OfficialLowerBound'], 11: ['UnusableKeepsBounds'],
    12: ['ForbidIsBound'], 13: ['WorkspaceNeverSourcesGovernance'],
}
msg_mutants = {1: 'NewBlocksBornReadable', 2: 'NewBlocksBornReadable',
               3: 'OutstandingPlaceholderStaysReadable', 4: 'OutstandingPlaceholderStaysReadable',
               5: 'NestedReadableImpliesContainersReadable'}
formal = load(ARCHIVE / 'formal-results.json')
xmls = load(ARCHIVE / 'xml-readouts.json')
primary = supplements = 0
for run in formal['Alloy']:
    label = run['label']
    base = ARCHIVE / 'runs' / label
    invocation = load(base / 'invocation.json')
    result = load(base / 'result.json')
    assert result['exit_code'] == 0 and not result['timed_out']
    # Resolve only the actual recorded model into the preserved copy.
    model = ARCHIVE / invocation['argv'][-1].split('/tmp/w6-core-formal/', 1)[1]
    commands = {m.group(2): (m.group(1), m.group(0)) for m in
                re.finditer(r'^(run|check)\s+(\w+)[^\n]*$', model.read_text(), re.M)}
    receipt = load(base / 'solutions/receipt.json')
    solver = {m.group(2): (m.group(1), m.group(3)) for m in re.finditer(
        r'^\d+\.\s+(run|check)\s+(\w+)[^\n]*?\b(UNSAT|SAT)\s*$',
        (base / 'stderr.log').read_text().replace('\b', ''), re.M)}
    assert receipt['solver'] == 'sat4j'
    is_xml = '-xml-' in label
    if is_xml:
        assert len(receipt['commands']) == 1
        expected = {next(iter(receipt['commands'])): 'SAT'}
    elif label.startswith('ae3-'):
        assert len(commands) == 18
        expected = {n: 'SAT' if k == 'run' else 'UNSAT' for n, (k, _) in commands.items()}
        if label != 'ae3-original':
            number = int(label.removeprefix('ae3-M'))
            expected.update({n: 'SAT' for n in ae_mutants[number]})
            if number == 8:
                expected['pickSkipped'] = 'UNSAT'
    elif label == 'msg3-original':
        assert len(commands) == 6
        expected = {n: 'SAT' if k == 'run' else 'UNSAT' for n, (k, _) in commands.items()}
    else:
        expected = {msg_mutants[int(label.removeprefix('msg3-M'))]: 'SAT'}
    assert set(receipt['commands']) == set(solver) == set(expected)
    for name, entry in receipt['commands'].items():
        kind, source = commands[name]
        assert entry['type'] == kind and entry['source'] == source
        solutions = entry.get('solution', [])
        actual = 'SAT' if solutions else 'UNSAT'
        assert actual == expected[name] and solver[name] == (kind, actual), (label, name)
        assert all(s.get('instances') for s in solutions)
        if actual == 'SAT':
            path = base / 'solutions' / f'{name}-solution-0.{"xml" if is_xml else "md"}'
            assert path.is_file() and path.stat().st_size > 0
    if is_xml:
        row = run['results'][0]
        readout = xmls[supplements]
        assert row['solution_path'] == readout['xml_path']
        path = ARCHIVE / row['solution_path']
        assert digest(path) == row['solution_sha256'] == readout['sha256']
        instance = ET.parse(path).getroot().findall('instance')
        assert len(instance) == 1 and any(f.findall('tuple') for f in instance[0].findall('field'))
        supplements += 1
    else:
        primary += len(expected)
assert primary == 263 and supplements == 28
controls = load(ARCHIVE / 'measurement-selftests.json')
assert controls['passed'] and len(controls['negative_cases']) == 8
assert all(n['detected'] and n['error'] for n in controls['negative_cases'])

report = {
    'reader': 'root independent read-only raw parsing; no solver rerun',
    'at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'input_snapshots_verified': len(snapshot), 'accepted_frozen_verified': 32,
    'tool_binary_hashes_verified': len(tools), 'registered_tlc_argv_exact': True,
    'TLC': tlc, 'Alloy_primary_readings': primary, 'Alloy_XML_supplements': supplements,
    'primary_expectation_source': 'frozen run/check commands and prescribed thirteen AE/five Messages mutation outcomes',
    'solver_receipt_stderr_and_actual_model_command_agree': True,
    'XML_actual_instance_relations_and_sha_agree': True,
    'reader_controls_recorded': 8,
    'implementation_verified': False,
    'limits': 'Only declared finite model scopes. SA no fairness/deadlock check, two indices/two symbols/max six accepted events; no parameter/representation/error priority proof. Alloy facts/constructions are not producer/implementation evidence.',
}
Path('tmp/core-delivery/w6-core-formal-v3-root-readout.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
