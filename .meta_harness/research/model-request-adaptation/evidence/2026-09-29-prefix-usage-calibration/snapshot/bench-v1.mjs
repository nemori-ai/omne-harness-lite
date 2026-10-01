import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

// Offline synthetic experiment only. No SDK, transport send, credentials or logs.
const root = new URL('../', import.meta.url);
const mode = process.argv[2];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const mib = value => value / 1048576;
function measure(name, fn) {
  const before = process.memoryUsage();
  const cpu = process.cpuUsage();
  const start = performance.now();
  const value = fn();
  const wallMs = performance.now() - start;
  const used = process.cpuUsage(cpu);
  const after = process.memoryUsage();
  return { value, metric: { name, wallMs, cpuUserMs: used.user / 1000,
    cpuSystemMs: used.system / 1000, heapBeforeMiB: mib(before.heapUsed),
    heapAfterMiB: mib(after.heapUsed), heapDeltaMiB: mib(after.heapUsed - before.heapUsed),
    rssBeforeMiB: mib(before.rss), rssAfterMiB: mib(after.rss),
    processMaxRssMiB: process.resourceUsage().maxRSS / 1024 } };
}
function bodyFromRows(rows) {
  return {
    model: 'openai/gpt-5.6-sol',
    provider: { order: ['openai'], allow_fallbacks: false, require_parameters: true },
    stream: true, store: false, reasoning: { effort: 'low' }, max_tokens: 1024,
    messages: rows.map(row => ({ role: row.role, content: [{ type: 'text', text: row.text }] })),
  };
}
function row(index) {
  const lines = [];
  for (let j = 0; j < 18; j++) {
    const id = index * 18 + j;
    const value = (id * 7919) % 99991;
    lines.push(`Record ${id}: const item_${id} = { count: ${value}, enabled: true }; The offline worker checks the item, appends a result, and preserves the prior message. 校验序号 ${id}，保留历史内容。`);
  }
  return { role: index % 2 === 0 ? 'user' : 'assistant', text: lines.join('\n') };
}
if (mode === 'generate') {
  const { getEncoding } = await import('js-tiktoken');
  const { writeJsonLossless } = await import('@omne-harness-lite/content-blocks');
  const tokenizer = getEncoding('o200k_base');
  let rows = Array.from({length: 700}, (_, i) => row(i));
  let serialized = writeJsonLossless(bodyFromRows(rows));
  let count = tokenizer.encode(serialized).length;
  const n = Math.round(rows.length * 1_000_000 / count);
  rows = Array.from({length: n}, (_, i) => row(i));
  serialized = writeJsonLossless(bodyFromRows(rows));
  count = tokenizer.encode(serialized).length;
  const fixture = { rows };
  const meta = {
    tokenizer: 'js-tiktoken 1.0.21 / o200k_base',
    exactLocalTokenizerTokensOfFinalSerializedBody: count,
    messageCount: rows.length, contentBlockCount: rows.length,
    utf8RequestBytes: Buffer.byteLength(serialized), utf16CodeUnits: serialized.length,
    concatenatedTextUtf8Bytes: rows.reduce((n, r) => n + Buffer.byteLength(r.text), 0),
    serializedSha256: sha(serialized),
    corpus: 'deterministic English prose, code-shaped records, CJK, numbers; 18 lines/message',
    seedRule: 'count=(recordId*7919)%99991',
    semantics: 'Local o200k_base token count, not upstream usage or proof of 1M route support',
  };
  fs.writeFileSync(new URL('fixture.json', root), JSON.stringify(fixture));
  fs.writeFileSync(new URL('fixture-meta.json', root), JSON.stringify(meta, null, 2) + '\n');
  process.stdout.write(JSON.stringify(meta) + '\n');
} else if (mode === 'run') {
  const importCpu = process.cpuUsage();
  const importStart = performance.now();
  const [{ createOpenAiInputMeter }, { writeJsonLossless }] = await Promise.all([
    import('./transport/input-meters/openai.js'), import('@omne-harness-lite/content-blocks'),
  ]);
  const importUsed = process.cpuUsage(importCpu);
  const importMetric = { wallMs: performance.now() - importStart,
    cpuUserMs: importUsed.user / 1000, cpuSystemMs: importUsed.system / 1000 };
  const fixture = JSON.parse(fs.readFileSync(new URL('fixture.json', root), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(new URL('fixture-meta.json', root), 'utf8'));
  // The existing factory consumes these exact binding values; no request is sent.
  const definition = { modelId: 'openai/gpt-5.6-sol', revision: '3',
    implementation: { name: 'pi-ai:openai', revision: 'mp4-3' }, routes: { openai: {} } };
  global.gc();
  const initialized = measure('cold_meter_factory_tokenizer_init', () => createOpenAiInputMeter(definition));
  const meter = initialized.value;
  const samples = [];
  for (let run = 0; run < 4; run++) {
    global.gc();
    const built = measure('final_body_build', () => bodyFromRows(fixture.rows));
    const body = built.value;
    const wire = measure('final_body_writeJsonLossless', () => writeJsonLossless(body));
    const serialized = wire.value;
    if (sha(serialized) !== meta.serializedSha256) throw new Error('fixture serialization drift');
    const measured = measure('actual_meter_measure', () => meter.measure({ body, serialized }));
    if (measured.value.kind !== 'estimated' || measured.value.tokens !== meta.exactLocalTokenizerTokensOfFinalSerializedBody)
      throw new Error(`unexpected meter result: ${JSON.stringify(measured.value)}`);
    samples.push({ run, temperature: run === 0 ? 'cold_first_measure' : 'warm',
      construction: built.metric, serialization: wire.metric, meter: measured.metric,
      result: measured.value });
  }
  global.gc();
  const result = {
    trial: process.argv[3], node: process.version, v8: process.versions.v8,
    cpuModel: os.cpus()[0]?.model, logicalCpuCount: os.cpus().length,
    platform: process.platform, arch: process.arch,
    processImport: importMetric, coldFactory: initialized.metric,
    meterBinding: { modelId: meter.modelId, provider: meter.provider,
      algorithmRevision: meter.algorithmRevision, implementation: meter.implementation },
    fixture: meta, samples,
    finalHeapAfterGcMiB: mib(process.memoryUsage().heapUsed),
    processMaxRssMiB: process.resourceUsage().maxRSS / 1024,
    measurementNotes: [
      'Fresh process per trial; one cold first measure and three warm repeats; explicit GC only before runs, outside timing.',
      'Construction is a synthetic final-wire producer, not the full runtime planner; texts are immutable source strings.',
      'Actual meter includes its existing body/serialized consistency reserialization and sanitized-body tokenization.',
      'Heap is observed before/after synchronous phases, not a sampled peak; maxRSS is process high-water RSS.',
      'No HTTP or model request. Full openCall/dispatch latency and extra validation/copy work are not measured.',
    ],
  };
  fs.writeFileSync(new URL(`trial-${process.argv[3]}.json`, root), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ trial: result.trial, initMs: initialized.metric.wallMs,
    tokens: meta.exactLocalTokenizerTokensOfFinalSerializedBody,
    meterWallMs: samples.map(s => s.meter.wallMs), maxRssMiB: result.processMaxRssMiB }) + '\n');
} else {
  throw new Error('usage: node --expose-gc snapshot/bench.mjs generate | run <trial>');
}
