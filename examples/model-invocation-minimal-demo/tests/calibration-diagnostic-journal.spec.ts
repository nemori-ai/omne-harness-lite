import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  createDiagnosticCollector,
  invokeModel,
  type DiagnosticCollectorConfig,
  type DiagnosticEvent,
  type DiagnosticMeasurementFact,
  type DiagnosticRecord,
  type InputMeasurement,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  adapter,
  fixturePlan,
  policy,
  request,
} from '../../../packages/model/model-request-runtime-local/tests/invoke-policy-fixture.ts'
import {
  createDiagnosticJournal,
  openDiagnosticJournalReader,
  type DiagnosticJournalConfig,
} from '../src/diagnostic-journal.ts'
let temporary: string
beforeEach(async () => {
  const dir = resolve(import.meta.dirname, '../../../tmp/calibration-diagnostics')
  await fs.mkdir(dir, { recursive: true })
  temporary = await fs.mkdtemp(join(dir, 'journal-'))
})
afterEach(async () => {
  await fs.rm(temporary, { recursive: true, force: true })
})
function config(): DiagnosticJournalConfig {
  return {
    rootDir: join(temporary, 'private'),
    collectorId: 'calibration',
    scope: { kind: 'local' },
    maxRecordBytes: 16384,
    segmentMaxBytes: 65536,
    retainedMaxBytes: 1048576,
    retainedMaxSegments: 32,
    retentionMs: 60000,
    queryMaxRecords: 100,
    queryMaxBytes: 1048576,
    queryScanMaxBytes: 1048576,
    queryConcurrency: 1,
    queryMaxDurationMs: 1000,
    exportMaxRecords: 100,
    exportMaxBytes: 1048576,
    wallClock: () => new Date('2026-09-29T00:00:00Z'),
    monotonicClock: () => 100,
    schedule(ms, cb) {
      const timer = setTimeout(cb, ms)
      return { cancel: () => clearTimeout(timer) }
    },
  }
}
async function collectorFixture(sink?: DiagnosticCollectorConfig['sink']) {
  const cfg = config(),
    journal = await createDiagnosticJournal(cfg)
  let tick = 0
  const { rootDir: _root, fs: _fs, ...collectorConfig } = cfg
  const collector = createDiagnosticCollector({
    ...collectorConfig,
    store: journal,
    maxFieldBytes: 1024,
    queueMaxRecords: 100,
    queueMaxBytes: 1048576,
    closeWaitMs: 1000,
    stderrMaxReports: 1,
    stderr: () => {},
    monotonicClock: () => ++tick,
    ...(sink ? { sink } : {}),
  })
  return { cfg, journal, collector }
}
const secret = 'diagnostic-secret-abcdef-12345'
function planning(mode: 'full' | 'marginal', fallbackReason?: 'basis_changed') {
  const input = request(),
    plan = fixturePlan(input)
  const basis = {
    ...plan.measurement.basis,
    binding: {
      ...plan.measurement.basis.binding,
      configuration: {
        revision: 'fixed',
        values: { credential: secret, nested: { signature: 'not-for-diagnostics' } },
      },
    },
  }
  const total = new LosslessNumber('900719925474099312345')
  const measurement: InputMeasurement =
    mode === 'full'
      ? {
          mode,
          precision: 'estimated',
          predictedInput: total,
          admissionTokens: total,
          fullContribution: { tokens: total, precision: 'estimated' },
          basis,
          fallbackReason: fallbackReason ?? 'no_observation',
        }
      : {
          mode,
          precision: 'estimated',
          predictedInput: total,
          admissionTokens: total,
          replayContribution: {
            tokens: new LosslessNumber('-9007199254740993'),
            precision: 'estimated',
          },
          newContribution: { tokens: new LosslessNumber('9007199254740995'), precision: 'exact' },
          basis,
        }
  return {
    ...plan,
    input: {
      ...input,
      snapshot: {
        ...input.snapshot,
        maxInputTokens: new LosslessNumber('900719925474099312350'),
        adaptation: basis.binding,
      },
    },
    measurement,
  }
}
function diagnosticFacts(): DiagnosticMeasurementFact {
  const { basis, ...measurement } = planning('marginal').measurement
  const { binding: _binding, ...safeBasis } = basis
  return {
    ...measurement,
    kind: 'measurement',
    basis: safeBasis,
    calibrationSource: {
      kind: 'observation',
      observedInputKind: 'from_usage',
      requestInput: {
        projectionRevision: 'fixture',
        prefixBoundary: 2,
        prefixDigest: 'a'.repeat(64),
        inputEnvelopeDigest: 'b'.repeat(64),
      },
    },
  } as DiagnosticMeasurementFact
}
function record(facts: DiagnosticMeasurementFact, sequence = '1'): DiagnosticRecord {
  return {
    format: 'model-diagnostics/1',
    observedAt: '2026-09-29T00:00:00Z',
    collectorId: 'calibration',
    sequence,
    scope: { kind: 'local' },
    source: 'invocation',
    stage: 'planning',
    outcome: 'accepted',
    facts,
  }
}
describe('calibration engineering facts through the real JSONL journal', () => {
  it('actual invoke preserves outcomes and HTTP effects; planning facts and explicit-clock durations remain queryable after reopen', async () => {
    const { cfg, collector } = await collectorFixture({
      mode: 'sync',
      record() {
        throw Error('sink failure')
      },
    })
    let requests = 0
    const server = createServer((_req, res) => {
      requests++
      res.end('ok')
    })
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw Error('no local server')
    try {
      for (const [mode, fallback] of [
        ['full', undefined],
        ['marginal', undefined],
        ['full', 'basis_changed'],
      ] as const) {
        const base = adapter(),
          plan = planning(mode, fallback)
        if (mode === 'marginal' || fallback) {
          plan.input = {
            ...plan.input,
            calibration: {
              kind: 'observation',
              inputCalibration: {
                requestInput: {
                  kind: 'known',
                  projectionRevision: 'fixture',
                  prefixBoundary: 2,
                  prefixDigest: 'a'.repeat(64),
                  inputEnvelopeDigest: 'b'.repeat(64),
                  countingBasis: plan.measurement.basis,
                },
                observedInput: {
                  kind: 'from_usage',
                  provenance: { adapterRevision: 'fixture', fieldPaths: ['usage.input_tokens'] },
                },
                outputGroup: {
                  kind: 'known',
                  projectionRevision: 'fixture',
                  source: 'none',
                  completeness: 'complete',
                  usageRef: 'usage',
                  blockDigests: [],
                },
              },
              usage: {
                input_tokens: new LosslessNumber('900719925474099312343'),
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                source: 'upstream',
              },
              outputBlocks: [],
              replaySelection: [],
            },
          }
        }
        const result = await invokeModel({
          ...plan.input,
          transport: {
            ...base.transport,
            plan: async () => ({ planned: plan }),
            async send(p, c, s, d) {
              await fetch(`http://127.0.0.1:${addr.port}/`)
              return base.transport.send(p, c, s)
            },
          },
          credential: secret,
          signal: new AbortController().signal,
          policy: policy(),
          diagnosticAssociation: { executionId: `${mode}-${fallback ?? 'ordinary'}` },
          diagnosticEmitterFactory: a => collector.emitter({ kind: 'local' }, a),
        }).outcome
        expect(result).toHaveProperty('outcome', 'complete')
        if (!('outcome' in result)) throw Error('missing outcome')
        expect(result.usage.input_tokens).toBe(503) // predictions do not replace real usage
      }
      expect(requests).toBe(3)
      await expect
        .poll(() => collector.health().queuedRecords + collector.health().pendingWrites)
        .toBe(0)
      for (const name of ['README.md', 'README_ZH.md']) {
        const doc = await fs.readFile(
          resolve(import.meta.dirname, '../../../packages/model/model-request-runtime-local', name),
          'utf8',
        )
        const block = doc.match(/```ts\n(\/\/ calibration-diagnostics-query[\s\S]*?)\n```/)?.[1]
        if (!block) throw Error('missing README query example')
        const compiled = transpileModule(block, {
          compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
        }).outputText
        const read = new Function(
          compiled.replace('export async function', 'async function') +
            '\nreturn readPlanningDiagnostics',
        )()
        const viewed = await read(collector, { kind: 'local' })
        expect(viewed.measurements).toHaveLength(3)
      }

      expect(await collector.close()).toHaveProperty('complete', true)
      const metrics = collector.metrics({ kind: 'local' })
      if ('rejected' in metrics) throw Error('metrics rejected')
      expect(metrics.stageDurations.find(v => v.stage === 'planning')).toMatchObject({ count: 3 })
      expect(collector.health().sinkFailures).toBeGreaterThan(0)
      const reader = await openDiagnosticJournalReader(cfg)
      try {
        const result = await reader.query({
          scope: { kind: 'local' },
          limit: 100,
          maxBytes: 1048576,
        })
        if (!('page' in result)) throw Error(JSON.stringify(result))
        const facts = result.page.records
          .filter(r => r.facts.kind === 'measurement')
          .map(r => r.facts)
        expect(facts).toHaveLength(3)
        expect(facts[0]).toMatchObject({
          mode: 'full',
          fallbackReason: 'no_observation',
          precision: 'estimated',
        })
        expect(facts[1]).toMatchObject({
          mode: 'marginal',
          calibrationSource: {
            kind: 'observation',
            requestInput: { prefixDigest: 'a'.repeat(64) },
          },
        })
        expect(facts[2]).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
        const exported = await reader.exportPage(
          { scope: { kind: 'local' }, limit: 100, maxBytes: 1048576 },
          { maxRecords: 100, maxBytes: 1048576 },
        )
        if (!('page' in exported)) throw Error('export rejected')
        expect(exported.page.jsonl).toContain('900719925474099312345')
        expect(exported.page.jsonl).toContain('-9007199254740993')
        expect(exported.page.jsonl).not.toContain(secret)
        expect(exported.page.jsonl).not.toContain('not-for-diagnostics')
        expect(exported.page.jsonl).not.toContain('"values"')
      } finally {
        await reader.close()
      }
    } finally {
      server.closeAllConnections()
      await new Promise<void>(done => server.close(() => done()))
      await collector.close()
    }
  })
  it('collector and journal own nested facts before mutation and reject unknown/accessor payloads without executing getters', async () => {
    const { cfg, collector, journal } = await collectorFixture()
    let getters = 0
    const raw = diagnosticFacts()
    expect(
      collector.record(
        { source: 'invocation', stage: 'planning', outcome: 'accepted', facts: raw },
        { kind: 'local' },
      ),
    ).toHaveProperty('recorded')
    ;(raw.basis as { meterRevision: string }).meterRevision = 'mutated-after-admission'
    for (const facts of [
      { ...diagnosticFacts(), raw: secret },
      {
        ...diagnosticFacts(),
        basis: { ...diagnosticFacts().basis, values: { credential: secret } },
      },
      {
        ...diagnosticFacts(),
        newContribution: {
          get tokens() {
            getters++
            return 1
          },
          precision: 'estimated',
        },
      },
    ]) {
      expect(
        collector.record(
          {
            source: 'invocation',
            stage: 'planning',
            outcome: 'accepted',
            facts,
          } as DiagnosticEvent,
          { kind: 'local' },
        ),
      ).toEqual({ dropped: 'invalid' })
      await expect(
        journal.append(record(facts as DiagnosticMeasurementFact, '10')),
      ).rejects.toThrow('invalid')
    }
    expect(getters).toBe(0)
    await expect
      .poll(() => collector.health().queuedRecords + collector.health().pendingWrites)
      .toBe(0)
    const direct = record(diagnosticFacts(), '2')
    const pending = journal.append(direct)
    ;(
      (direct.facts as DiagnosticMeasurementFact).basis as { meterRevision: string }
    ).meterRevision = 'mutated-after-journal-append'
    await pending
    await collector.close()
    const reader = await openDiagnosticJournalReader(cfg)
    try {
      const result = await reader.query({ scope: { kind: 'local' }, limit: 100, maxBytes: 1048576 })
      if (!('page' in result)) throw Error(JSON.stringify(result))
      expect(writeJsonLossless(result.page.records)).not.toContain('mutated-after-admission')
      expect(writeJsonLossless(result.page.records)).not.toContain('mutated-after-journal-append')
      expect(result.page.records).toHaveLength(2)
    } finally {
      await reader.close()
    }
  })
  it('projection accessors fail only the diagnostic projection, without changing send/outcome', async () => {
    const { collector } = await collectorFixture()
    let getters = 0
    const base = adapter(),
      plan = planning('full')
    Object.defineProperty(plan.measurement, 'predictedInput', {
      enumerable: true,
      get() {
        getters++
        throw Error('getter sentinel')
      },
    })
    const result = await invokeModel({
      ...plan.input,
      transport: { ...base.transport, plan: async () => ({ planned: plan }) },
      credential: secret,
      signal: new AbortController().signal,
      policy: policy(),
      diagnosticEmitterFactory: () => collector.emitter({ kind: 'local' }),
    }).outcome
    expect(result).toHaveProperty('outcome', 'complete')
    expect(base.sends()).toBe(1)
    expect(getters).toBe(0)
    await collector.close()
  })
})
