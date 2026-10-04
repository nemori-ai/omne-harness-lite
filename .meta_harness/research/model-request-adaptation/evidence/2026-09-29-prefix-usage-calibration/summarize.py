from pathlib import Path
import json
import statistics
import hashlib

root = Path(__file__).parent
trials = [json.loads((root / f'trial-{i}.json').read_text()) for i in (1, 2, 3)]
warm = [sample for trial in trials for sample in trial['samples'] if sample['temperature'] == 'warm']
cold = [trial['samples'][0] for trial in trials]

def stats(values):
    return {'min': min(values), 'median': statistics.median(values), 'max': max(values), 'n': len(values)}

def phase(samples, name):
    return {
        'wallMs': stats([s[name]['wallMs'] for s in samples]),
        'cpuMs': stats([s[name]['cpuUserMs'] + s[name]['cpuSystemMs'] for s in samples]),
        'heapDeltaMiB': stats([s[name]['heapDeltaMiB'] for s in samples]),
        'observedHeapAfterMiB': stats([s[name]['heapAfterMiB'] for s in samples]),
    }

summary = {
    'hubHeadAtSnapshot': '846d4c9096f5b4d18d07fa60c5c56cf29f53fe00',
    'fixture': trials[0]['fixture'],
    'node': trials[0]['node'],
    'cpuModel': trials[0]['cpuModel'],
    'meterBinding': trials[0]['meterBinding'],
    'processImportWallMs': stats([t['processImport']['wallMs'] for t in trials]),
    'coldFactoryWallMs': stats([t['coldFactory']['wallMs'] for t in trials]),
    'coldFirstMeter': phase(cold, 'meter'),
    'warm': {name: phase(warm, name) for name in ('construction', 'serialization', 'meter')},
    'twoWarmMeterCallsEstimateMs': stats([2 * s['meter']['wallMs'] for s in warm]),
    'twoWarmConstructionSerializationMeterEstimateMs': stats([
        2 * sum(s[k]['wallMs'] for k in ('construction', 'serialization', 'meter')) for s in warm]),
    'trial3ProcVmHwmMiB': trials[2]['procVmHwmMiB'],
    'trial3ObservedHeapBeforeAfterMeterMiB': [[s['meter']['heapBeforeMiB'], s['meter']['heapAfterMiB']] for s in trials[2]['samples']],
    'finalHeapAfterGcMiB': [t['finalHeapAfterGcMiB'] for t in trials],
    'invalidResourceUsageMaxRss': 'Excluded. Bare Node control reports inherited launcher maxRSS; use trial-3 procVmHwmMiB instead.',
    'scope': 'Existing real meter offline microbenchmark; construction is a synthetic final-wire producer. Two-plan totals are arithmetic estimates, not end-to-end openCall+dispatch measurements.',
    'scriptsSha256': {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'snapshot/bench.mjs',root/'snapshot/bench-v1.mjs',root/'summarize.py']},
}
(root / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
