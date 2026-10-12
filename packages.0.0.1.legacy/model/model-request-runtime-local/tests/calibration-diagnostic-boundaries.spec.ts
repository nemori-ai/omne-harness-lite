import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type {
  DiagnosticEvent,
  DiagnosticMeasurementFact,
} from '@omne-harness-lite/model-request-runtime'
import {
  createDiagnosticCollector,
  type DiagnosticJournalStore,
  type DiagnosticRecord,
} from '../src/index.ts'

function fixture() {
  const records: DiagnosticRecord[] = []
  const store: DiagnosticJournalStore = {
    async append(record) {
      records.push(record)
      return 'written'
    },
    async flush() {},
    async query() {
      return { rejected: 'unavailable' }
    },
    async exportPage() {
      return { rejected: 'unavailable' }
    },
    async close() {
      return { complete: true, coverage: 'complete' }
    },
    health() {
      return {
        pendingQueries: 0,
        pendingQueryIo: 0,
        openQueryHandles: 0,
        pendingQueryCloses: 0,
        timedOutQueries: 0,
        queryCloseFailures: 0,
        expired: 0,
        expiredBytes: 0,
        evicted: 0,
        evictedBytes: 0,
        retainedBytes: 0,
        retainedRecords: 0,
        retainedSegments: 0,
        coverage: 'complete',
      }
    },
  }
  const collector = createDiagnosticCollector({
    collectorId: 'calibration-boundaries',
    scope: { kind: 'local' },
    maxRecordBytes: 4096,
    maxFieldBytes: 64,
    queueMaxRecords: 64,
    queueMaxBytes: 65536,
    segmentMaxBytes: 65536,
    retainedMaxBytes: 131072,
    retainedMaxSegments: 3,
    retentionMs: 60000,
    queryMaxRecords: 8,
    queryMaxBytes: 8192,
    queryScanMaxBytes: 8192,
    queryConcurrency: 1,
    queryMaxDurationMs: 500,
    exportMaxRecords: 8,
    exportMaxBytes: 8192,
    closeWaitMs: 500,
    stderrMaxReports: 1,
    wallClock: () => new Date('2026-09-28T00:00:00Z'),
    monotonicClock: () => 10,
    schedule(ms, callback) {
      const timer = setTimeout(callback, ms)
      return {
        cancel() {
          clearTimeout(timer)
        },
      }
    },
    store,
  })
  return { collector, records }
}

function marginal() {
  return {
    kind: 'measurement',
    mode: 'marginal',
    precision: 'exact',
    predictedInput: 12,
    admissionTokens: 12,
    basis: {
      model: 'teaching/model',
      provider: 'openai',
      tokenizerRevision: 'fixture-v1',
      meterRevision: 'fixture-v1',
      replayRevision: 'fixture-v1',
      transformRevision: 'fixture-v1',
      projectionRevision: 'fixture-v1',
    },
    replayContribution: { tokens: new LosslessNumber('-9007199254740993'), precision: 'exact' },
    newContribution: { tokens: new LosslessNumber('9007199254741005'), precision: 'exact' },
    calibrationSource: {
      kind: 'observation',
      observedInputKind: 'upstream_total',
      requestInput: {
        projectionRevision: 'fixture-v1',
        prefixBoundary: 1,
        prefixDigest: 'a'.repeat(64),
        inputEnvelopeDigest: 'b'.repeat(64),
      },
    },
  } satisfies DiagnosticMeasurementFact
}

function expectedMarginal(): DiagnosticMeasurementFact {
  return {
    kind: 'measurement',
    mode: 'marginal',
    precision: 'exact',
    predictedInput: 12,
    admissionTokens: 12,
    basis: {
      model: 'teaching/model',
      provider: 'openai',
      tokenizerRevision: 'fixture-v1',
      meterRevision: 'fixture-v1',
      replayRevision: 'fixture-v1',
      transformRevision: 'fixture-v1',
      projectionRevision: 'fixture-v1',
    },
    replayContribution: { tokens: new LosslessNumber('-9007199254740993'), precision: 'exact' },
    newContribution: { tokens: new LosslessNumber('9007199254741005'), precision: 'exact' },
    calibrationSource: {
      kind: 'observation',
      observedInputKind: 'upstream_total',
      requestInput: {
        projectionRevision: 'fixture-v1',
        prefixBoundary: 1,
        prefixDigest: 'a'.repeat(64),
        inputEnvelopeDigest: 'b'.repeat(64),
      },
    },
  }
}

function expectFrozen(value: unknown) {
  if (typeof value !== 'object' || value === null) return
  expect(Object.isFrozen(value)).toBe(true)
  for (const nested of Object.values(value)) expectFrozen(nested)
}

type PositiveCase = {
  name: string
  arrange: () => {
    facts: DiagnosticMeasurementFact
    expected: DiagnosticMeasurementFact
    mutate?: () => void
  }
}

const positives: PositiveCase[] = [
  {
    name: 'C4A-01 signed known observation',
    arrange() {
      const facts = marginal()
      return {
        facts,
        expected: expectedMarginal(),
        mutate() {
          facts.basis.model = 'caller-mutated'
          Reflect.set(facts.calibrationSource, 'observedInputKind', 'unavailable')
          facts.calibrationSource.requestInput.prefixDigest = 'c'.repeat(64)
          facts.replayContribution.tokens = new LosslessNumber('99')
          facts.newContribution.tokens = new LosslessNumber('100')
        },
      }
    },
  },
  {
    name: 'C4A-02 full no observation',
    arrange() {
      const facts: DiagnosticMeasurementFact = {
        kind: 'measurement',
        mode: 'full',
        precision: 'exact',
        predictedInput: 12,
        admissionTokens: 12,
        basis: marginal().basis,
        fullContribution: { tokens: 12, precision: 'exact' },
        calibrationSource: { kind: 'none', reason: 'no_observation' },
      }
      const expected: DiagnosticMeasurementFact = {
        kind: 'measurement',
        mode: 'full',
        precision: 'exact',
        predictedInput: 12,
        admissionTokens: 12,
        basis: expectedMarginal().basis,
        fullContribution: { tokens: 12, precision: 'exact' },
        calibrationSource: { kind: 'none', reason: 'no_observation' },
      }
      return { facts, expected }
    },
  },
  {
    name: 'C4A-03 full unavailable source',
    arrange() {
      const facts: DiagnosticMeasurementFact = {
        kind: 'measurement',
        mode: 'full',
        precision: 'exact',
        predictedInput: 12,
        admissionTokens: 12,
        basis: marginal().basis,
        fullContribution: { tokens: 12, precision: 'exact' },
        calibrationSource: { kind: 'none', reason: 'source_unavailable' },
      }
      const expected: DiagnosticMeasurementFact = {
        kind: 'measurement',
        mode: 'full',
        precision: 'exact',
        predictedInput: 12,
        admissionTokens: 12,
        basis: expectedMarginal().basis,
        fullContribution: { tokens: 12, precision: 'exact' },
        calibrationSource: { kind: 'none', reason: 'source_unavailable' },
      }
      return { facts, expected }
    },
  },
  {
    name: 'C4A-04 observation from usage without prior',
    arrange() {
      const facts: DiagnosticMeasurementFact = {
        ...marginal(),
        calibrationSource: { kind: 'observation', observedInputKind: 'from_usage' },
      }
      const expected: DiagnosticMeasurementFact = {
        ...expectedMarginal(),
        calibrationSource: { kind: 'observation', observedInputKind: 'from_usage' },
      }
      return { facts, expected }
    },
  },
  {
    name: 'C4A-05 observation upstream total without prior',
    arrange() {
      const facts: DiagnosticMeasurementFact = {
        ...marginal(),
        calibrationSource: { kind: 'observation', observedInputKind: 'upstream_total' },
      }
      const expected: DiagnosticMeasurementFact = {
        ...expectedMarginal(),
        calibrationSource: { kind: 'observation', observedInputKind: 'upstream_total' },
      }
      return { facts, expected }
    },
  },
  {
    name: 'C4A-06 observation unavailable without prior',
    arrange() {
      const facts: DiagnosticMeasurementFact = {
        ...marginal(),
        calibrationSource: { kind: 'observation', observedInputKind: 'unavailable' },
      }
      const expected: DiagnosticMeasurementFact = {
        ...expectedMarginal(),
        calibrationSource: { kind: 'observation', observedInputKind: 'unavailable' },
      }
      return { facts, expected }
    },
  },
  {
    name: 'C4A-07 null prototype nested basis',
    arrange() {
      const facts = marginal()
      Object.setPrototypeOf(facts.basis, null)
      return { facts, expected: expectedMarginal() }
    },
  },
  {
    name: 'C4A-08 64 byte revision boundary',
    arrange() {
      const facts = marginal()
      facts.basis.meterRevision = 'r'.repeat(64)
      facts.calibrationSource.requestInput.projectionRevision = 'r'.repeat(64)
      const expected = expectedMarginal()
      return {
        facts,
        expected: {
          ...expected,
          basis: { ...expected.basis, meterRevision: 'r'.repeat(64) },
          calibrationSource: {
            kind: 'observation',
            observedInputKind: 'upstream_total',
            requestInput: {
              projectionRevision: 'r'.repeat(64),
              prefixBoundary: 1,
              prefixDigest: 'a'.repeat(64),
              inputEnvelopeDigest: 'b'.repeat(64),
            },
          },
        },
      }
    },
  },
  {
    name: 'C4A-09 undefined optional prior',
    arrange() {
      const facts: DiagnosticMeasurementFact = {
        ...marginal(),
        calibrationSource: { kind: 'observation', observedInputKind: 'upstream_total' },
      }
      const expected: DiagnosticMeasurementFact = {
        ...expectedMarginal(),
        calibrationSource: { kind: 'observation', observedInputKind: 'upstream_total' },
      }
      Object.defineProperty(facts.calibrationSource, 'requestInput', {
        value: undefined,
        enumerable: true,
      })
      return { facts, expected }
    },
  },
]

type InvalidCase = {
  name: string
  change: (facts: ReturnType<typeof marginal>, getter: () => never) => void
}
const invalids: InvalidCase[] = [
  {
    name: 'C4A-10 basis null',
    change(facts) {
      Reflect.set(facts, 'basis', null)
    },
  },
  {
    name: 'C4A-11 basis foreign prototype',
    change(facts) {
      Object.setPrototypeOf(facts.basis, { foreign: true })
    },
  },
  {
    name: 'C4A-12 basis symbol',
    change(facts) {
      Reflect.set(facts.basis, Symbol('private'), 'secret')
    },
  },
  {
    name: 'C4A-13 basis accessor',
    change(facts, getter) {
      Object.defineProperty(facts.basis, 'meterRevision', { enumerable: true, get: getter })
    },
  },
  {
    name: 'C4A-14 basis nonenumerable',
    change(facts) {
      Object.defineProperty(facts.basis, 'meterRevision', {
        value: 'fixture-v1',
        enumerable: false,
      })
    },
  },
  {
    name: 'C4A-15 basis unknown key',
    change(facts) {
      Reflect.set(facts.basis, 'secret', 'private payload')
    },
  },
  {
    name: 'C4A-16 basis reflection throws',
    change(facts) {
      facts.basis = new Proxy(facts.basis, {
        ownKeys() {
          throw new Error('reflection')
        },
      })
    },
  },
  {
    name: 'C4A-17 prior null',
    change(facts) {
      Reflect.set(facts.calibrationSource, 'requestInput', null)
    },
  },
  {
    name: 'C4A-18 prior empty revision',
    change(facts) {
      facts.calibrationSource.requestInput.projectionRevision = ''
    },
  },
  {
    name: 'C4A-19 prior overlong revision',
    change(facts) {
      facts.calibrationSource.requestInput.projectionRevision = 'r'.repeat(65)
    },
  },
  {
    name: 'C4A-20 prior negative boundary',
    change(facts) {
      facts.calibrationSource.requestInput.prefixBoundary = -1
    },
  },
  {
    name: 'C4A-21 prior unsafe boundary',
    change(facts) {
      facts.calibrationSource.requestInput.prefixBoundary = Number.MAX_SAFE_INTEGER + 1
    },
  },
  {
    name: 'C4A-22 prior fractional lossless boundary',
    change(facts) {
      Reflect.set(facts.calibrationSource.requestInput, 'prefixBoundary', new LosslessNumber('1.5'))
    },
  },
  {
    name: 'C4A-23 prior malformed prefix digest',
    change(facts) {
      facts.calibrationSource.requestInput.prefixDigest = 'g'.repeat(64)
    },
  },
  {
    name: 'C4A-24 prior uppercase digest',
    change(facts) {
      facts.calibrationSource.requestInput.prefixDigest = 'A'.repeat(64)
    },
  },
  {
    name: 'C4A-25 prior malformed envelope digest',
    change(facts) {
      facts.calibrationSource.requestInput.inputEnvelopeDigest = 'b'.repeat(63)
    },
  },
  {
    name: 'C4A-26 source null',
    change(facts) {
      Reflect.set(facts, 'calibrationSource', null)
    },
  },
  {
    name: 'C4A-27 source invalid none reason',
    change(facts) {
      Reflect.set(facts, 'calibrationSource', { kind: 'none', reason: 'other' })
    },
  },
  {
    name: 'C4A-28 source extra none field',
    change(facts) {
      Reflect.set(facts, 'calibrationSource', {
        kind: 'none',
        reason: 'no_observation',
        observedInputKind: 'upstream_total',
      })
    },
  },
  {
    name: 'C4A-29 source invalid kind',
    change(facts) {
      Reflect.set(facts.calibrationSource, 'kind', 'other')
    },
  },
  {
    name: 'C4A-30 source observation reason present',
    change(facts) {
      Reflect.set(facts.calibrationSource, 'reason', 'no_observation')
    },
  },
  {
    name: 'C4A-31 source invalid observed input kind',
    change(facts) {
      Reflect.set(facts.calibrationSource, 'observedInputKind', 'other')
    },
  },
  {
    name: 'C4A-32 marginal full contribution present',
    change(facts) {
      Reflect.set(facts, 'fullContribution', { tokens: 12, precision: 'exact' })
    },
  },
  {
    name: 'C4A-33 marginal fallback reason present',
    change(facts) {
      Reflect.set(facts, 'fallbackReason', 'no_observation')
    },
  },
  {
    name: 'C4A-34 marginal replay missing',
    change(facts) {
      Reflect.deleteProperty(facts, 'replayContribution')
    },
  },
  {
    name: 'C4A-35 marginal new missing',
    change(facts) {
      Reflect.deleteProperty(facts, 'newContribution')
    },
  },
  {
    name: 'C4A-36 marginal replay precision invalid',
    change(facts) {
      Reflect.set(facts.replayContribution, 'precision', 'other')
    },
  },
  {
    name: 'C4A-37 marginal new tokens fractional',
    change(facts) {
      facts.newContribution.tokens = new LosslessNumber('1.5')
    },
  },
  {
    name: 'C4A-38 common mode invalid',
    change(facts) {
      Reflect.set(facts, 'mode', 'other')
    },
  },
  {
    name: 'C4A-39 common precision invalid',
    change(facts) {
      Reflect.set(facts, 'precision', 'other')
    },
  },
  {
    name: 'C4A-40 common basis field missing',
    change(facts) {
      Reflect.deleteProperty(facts.basis, 'provider')
    },
  },
  {
    name: 'C4A-41 common unsafe predicted count',
    change(facts) {
      facts.predictedInput = Number.MAX_SAFE_INTEGER + 1
    },
  },
  {
    name: 'C4A-42 common fractional predicted count',
    change(facts) {
      Reflect.set(facts, 'predictedInput', new LosslessNumber('1.5'))
    },
  },
  {
    name: 'C4A-43 common negative admission',
    change(facts) {
      facts.admissionTokens = -1
    },
  },
  {
    name: 'C4A-44 common overlong basis revision',
    change(facts) {
      facts.basis.meterRevision = 'r'.repeat(65)
    },
  },
]

describe('calibration diagnostic boundaries', () => {
  it.each(positives)('$name', async ({ arrange }) => {
    const { collector, records } = fixture()
    const { facts, expected, mutate } = arrange()
    const event: DiagnosticEvent = {
      source: 'invocation',
      stage: 'planning',
      outcome: 'accepted',
      facts,
    }
    try {
      expect(collector.record(event, { kind: 'local' })).toEqual({
        recorded: { collectorId: 'calibration-boundaries', sequence: '1' },
      })
      mutate?.()
    } finally {
      expect(await collector.close()).toMatchObject({ complete: true })
    }
    expect(records).toHaveLength(1)
    expect(records[0]?.facts).toStrictEqual(expected)
    expectFrozen(records[0]?.facts)
    if (expected.mode === 'marginal') {
      const encoded = writeJsonLossless(records[0]?.facts)
      expect(encoded).toContain(
        '"replayContribution":{"tokens":-9007199254740993,"precision":"exact"}',
      )
      expect(encoded).toContain('"newContribution":{"tokens":9007199254741005,"precision":"exact"}')
    }
  })

  it.each(invalids)('$name', async ({ change }) => {
    const { collector, records } = fixture()
    const facts = marginal()
    let getterCalls = 0
    change(facts, () => {
      getterCalls++
      throw new Error('getter must not run')
    })
    const event: unknown = { source: 'invocation', stage: 'planning', outcome: 'accepted', facts }
    try {
      expect(collector.record(event as DiagnosticEvent, { kind: 'local' })).toEqual({
        dropped: 'invalid',
      })
    } finally {
      expect(await collector.close()).toMatchObject({ complete: true })
    }
    expect(records).toHaveLength(0)
    expect(getterCalls).toBe(0)
  })
})
