import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { openProductionLedger } from '../../../../../../tools/model-probe/src/production-gate.mjs'
import {
  assertCalibrationWire,
  decimalUsd,
  exactEndpoint,
  runPaidCase,
  safeTokenCount,
  resumeSuccessfulFirstCase,
  wholeContextReservation,
} from './paid-calibration.mjs'

const endpoint = {
  context_length: 1000000,
  max_completion_tokens: 128,
  provider_name: 'xAI',
  pricing: { prompt: '0.000002', completion: '0.000008' },
}
async function isolatedLedger(action, limitUsd = '100') {
  const directory = await mkdtemp(join(tmpdir(), 'xai-ledger-test-'))
  const path = join(directory, 'ledger.json')
  const budget = { limitUsd, researchLimitUsd: limitUsd }
  await writeFile(path, JSON.stringify({ format: 1, ...budget, entries: [] }), { mode: 0o600 })
  await chmod(path, 0o600)
  const ledger = await openProductionLedger(path, path, budget)
  try {
    await action(ledger, path)
  } finally {
    await ledger.close()
    await rm(directory, { recursive: true, force: true })
  }
}
const completed = cost => ({
  outcome: 'complete',
  usage: {
    source: 'upstream',
    input_tokens: new LosslessNumber('25'),
    output_tokens: new LosslessNumber('10'),
  },
  cost: { source: 'upstream_usage', cost_usd: cost },
  servingProvider: 'xAI',
  upstreamRequestId: 'controlled-request',
})
const base = {
  model: 'x-ai/grok-4.7',
  endpoint,
  outputTokens: 128,
  identity: { scenario: 'fit-short' },
  body: {
    model: 'x-ai/grok-4.7',
    max_tokens: 128,
    provider: { order: ['xai'], allow_fallbacks: false },
  },
}

test('reserves full context before sole effect and settles every scientific decimal digit', async () => {
  await isolatedLedger(async (ledger, path) => {
    const rows = []
    let calls = 0
    await runPaidCase({
      ...base,
      ledger,
      append: row => rows.push(row),
      invoke: async () => {
        calls++
        const disk = JSON.parse(await readFile(path, 'utf8'))
        assert.equal(disk.entries[0].state, 'reserved')
        assert.equal(disk.entries[0].estimateUsd, '2.001024000000000000')
        assert.equal(rows[0].stage, 'before_send')
        assert.equal(rows[0].reservation, disk.entries[0].id)
        return completed(new LosslessNumber('1.234567890123456789012345e-7'))
      },
    })
    assert.equal(calls, 1)
    assert.equal(ledger.snapshot().entries[0].state, 'settled')
    assert.equal(ledger.snapshot().entries[0].actualUsd, '0.0000001234567890123456789012345')
    assert.equal(rows[1].costUsd, '0.0000001234567890123456789012345')
  })
})
for (const variant of ['unknown', 'throw'])
  test(`${variant} retains unresolved reservation and prevents another send`, async () => {
    await isolatedLedger(async ledger => {
      let calls = 0
      const rows = []
      const invoke = async () => {
        calls++
        if (variant === 'throw') throw new Error('SECRET raw error')
        return completed('unknown')
      }
      const request = { ...base, ledger, append: row => rows.push(row), invoke }
      await assert.rejects(runPaidCase(request), /Actual cost unknown/)
      assert.equal(ledger.snapshot().entries[0].state, 'unknown')
      assert.equal(ledger.snapshot().entries[0].actualUsd, undefined)
      assert.equal(rows[1].costUsd, null)
      assert.ok(!JSON.stringify(rows).includes('SECRET'))
      await assert.rejects(runPaidCase(request), /Unsettled/)
      assert.equal(calls, 1)
    })
  })
test('insufficient full-context budget sends nothing and creates no reservation', async () => {
  await isolatedLedger(async ledger => {
    let calls = 0
    await assert.rejects(
      runPaidCase({
        ...base,
        ledger,
        append: () => {},
        invoke: async () => {
          calls++
          return completed(0)
        },
      }),
      /Budget reservation refused/,
    )
    assert.equal(calls, 0)
    assert.deepEqual(ledger.snapshot().entries, [])
  }, '1')
})
test('receipt is settled but incomplete/provider mismatch stops the case', async () => {
  await isolatedLedger(async ledger => {
    await assert.rejects(
      runPaidCase({
        ...base,
        ledger,
        append: () => {},
        invoke: async () => ({
          ...completed(new LosslessNumber('4.2e-5')),
          servingProvider: 'different',
        }),
      }),
      /Incomplete calibration/,
    )
    assert.equal(ledger.snapshot().entries[0].actualUsd, '0.000042')
  })
})
test('catalog uses original endpoint source and explicit freshness, not model-card context', () => {
  const now = Date.parse('2026-09-28T18:00:00Z')
  const snapshot = {
    cards: [{ contextLength: 1 }],
    endpointSources: {
      model: {
        observedAt: '2026-09-28T17:30:00Z',
        raw: JSON.stringify({ data: { endpoints: [{ ...endpoint, tag: 'xai' }] } }),
      },
    },
  }
  assert.equal(exactEndpoint(snapshot, 'model', 1800000, now).context_length, 1000000)
  assert.throws(() => exactEndpoint(snapshot, 'model', 1799999, now), /stale/)
  assert.throws(() => exactEndpoint(snapshot, 'other', 1800000, now), /missing/)
})
test('budget accounts for cache, image, fee and rejects nonzero unbudgeted charges', () => {
  assert.equal(
    wholeContextReservation(
      {
        ...endpoint,
        pricing: {
          ...endpoint.pricing,
          input_cache_write_1h: '6e-6',
          image: '0.01',
          request: '0.001',
          web_search: '0',
        },
      },
      128,
    ),
    '6.012024000000000000',
  )
  assert.throws(
    () =>
      wholeContextReservation(
        {
          ...endpoint,
          pricing: {
            ...endpoint.pricing,
            unexpected_charge: '0.001',
          },
        },
        128,
      ),
    /Unbudgeted/,
  )
  assert.equal(decimalUsd(new LosslessNumber('2e3')), '2000')
  assert.throws(() => decimalUsd(new LosslessNumber('-1e-9')), /nonnegative/)
})

test('fixed-wire gate rejects web search and provider fallback before payment', () => {
  assertCalibrationWire(base.body)
  for (const change of [
    { plugins: [{ id: 'web' }] },
    { model: 'x-ai/grok-4.7:online' },
    { tools: [{ type: 'web_search' }] },
    { provider: { order: ['xai'], allow_fallbacks: true } },
  ])
    assert.throws(() => assertCalibrationWire({ ...base.body, ...change }), /wire capability/)
})

test('highest long-context override determines the reservation, not the small fixture estimate', () => {
  assert.equal(
    wholeContextReservation(
      {
        ...endpoint,
        context_length: 500000,
        pricing: {
          prompt: '0.000002',
          completion: '0.000006',
          web_search: '0.005',
          overrides: [{ min_prompt_tokens: 200000, prompt: '0.000004', completion: '0.000012' }],
        },
      },
      128,
    ),
    '2.001536000000000000',
  )
})

test('safe token oracle consumes real core numbers without changing recorded usage', async () => {
  for (const [source, expected] of [
    ['103', 103],
    ['1.03e2', 103],
    ['0', 0],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['9007199254740992', undefined],
    ['103.0000000000000000000001', undefined],
    ['-1', undefined],
  ])
    assert.equal(safeTokenCount(new LosslessNumber(source)), expected)
  assert.equal(safeTokenCount('103'), undefined)
  await isolatedLedger(async ledger => {
    const usage = new LosslessNumber('1.03e2')
    const rows = []
    await runPaidCase({
      ...base,
      ledger,
      append: row => rows.push(row),
      invoke: async () => ({
        ...completed(new LosslessNumber('0.0008512')),
        usage: { source: 'upstream', input_tokens: usage, output_tokens: new LosslessNumber('47') },
      }),
    })
    assert.strictEqual(rows[1].upstreamInputTokens, usage)
    assert.match(writeJsonLossless(rows[1]), /"upstreamInputTokens":1.03e2/)
    assert.equal(ledger.snapshot().entries[0].state, 'settled')
  })
})

test('explicit resume accepts only one exact successful first-case pair with original settled receipt', async () => {
  await isolatedLedger(async ledger => {
    const identity = {
      modelId: base.model,
      scenario: 'fit-short',
      partition: 'fit',
      candidateRevision: 'grok-build-wire-projection-candidate-1',
      wireSha256: 'a'.repeat(64),
      snapshotSha256: 'b'.repeat(64),
      estimatedTokens: 78,
      admissionTokens: 78,
      requestBytes: 314,
      images: 0,
    }
    const rows = []
    let calls = 0
    await runPaidCase({
      ...base,
      identity,
      ledger,
      append: row => rows.push(row),
      invoke: async () => {
        calls++
        return completed(new LosslessNumber('0.0008512'))
      },
    })
    const source = rows.map(writeJsonLossless).join('\n') + '\n'
    const ledgerBefore = ledger.snapshot()
    const copied = resumeSuccessfulFirstCase(source, identity, endpoint, ledgerBefore)
    assert.equal(copied.length, 2)
    assert.equal(calls, 1)
    assert.deepEqual(ledger.snapshot(), ledgerBefore)
    assert.equal(copied[1].reservation, rows[1].reservation)
    for (const key of ['modelId', 'scenario', 'candidateRevision', 'wireSha256'])
      assert.throws(
        () =>
          resumeSuccessfulFirstCase(
            source,
            { ...identity, [key]: 'changed' },
            endpoint,
            ledgerBefore,
          ),
        /identity mismatch/,
      )
    const journal = changes =>
      rows
        .map((row, index) => writeJsonLossless(index === 1 ? { ...row, ...changes } : row))
        .join('\n')
    for (const changes of [
      { outcome: 'failed' },
      { costUsd: null },
      { servingProvider: 'Other' },
      { upstreamInputTokens: new LosslessNumber('9007199254740992') },
      { reservation: 'other' },
    ])
      assert.throws(
        () => resumeSuccessfulFirstCase(journal(changes), identity, endpoint, ledgerBefore),
        /evidence/,
      )
    for (const entryChanges of [
      { state: 'unknown' },
      { actualUsd: '0.0008513' },
      { model: 'other' },
    ])
      assert.throws(
        () =>
          resumeSuccessfulFirstCase(source, identity, endpoint, {
            ...ledgerBefore,
            entries: [{ ...ledgerBefore.entries[0], ...entryChanges }],
          }),
        /original settled ledger/,
      )
    assert.throws(
      () => resumeSuccessfulFirstCase(source + source, identity, endpoint, ledgerBefore),
      /exactly one/,
    )
    assert.throws(
      () => resumeSuccessfulFirstCase(writeJsonLossless(rows[0]), identity, endpoint, ledgerBefore),
      /exactly one/,
    )
  })
})
