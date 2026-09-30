import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usdUnits, usdString, estimateReservation, openLedger } from '../src/budget.mjs'
import { parseFacts, streamFacts, readCredential, sendOnce } from '../src/network.mjs'
import { models } from '../src/models.mjs'
import { makeRequest, validateRun } from '../src/run.mjs'
import { summarizeCatalog } from '../src/catalog.mjs'

const budget = { limitUsd: '100', researchLimitUsd: '50' }
const config = {
  format: 1,
  stage: 'research',
  budget,
  timeoutMs: 30000,
  maxResponseBytes: 1000000,
  probes: [
    {
      model: 'openai/gpt-6-luna',
      provider: 'openai',
      maxOutputTokens: 128,
      prefixLines: 128,
      repetitions: 2,
      cache: { mode: 'automatic' },
    },
  ],
}
const snapshot = {
  cards: [
    {
      id: 'openai/gpt-6-luna',
      endpoints: [
        {
          tag: 'openai',
          provider: 'OpenAI',
          supportedParameters: ['reasoning'],
          pricing: { prompt: '0.000001', completion: '0.000005' },
        },
      ],
    },
  ],
}

test('decimal accounting retains digits and rounds reservations upward', () => {
  assert.equal(usdString(usdUnits('0.123456789012345678')), '0.123456789012345678')
  assert.equal(usdUnits('0.0000000000000000001'), 1n)
  assert.equal(usdUnits('100'), 100n * 10n ** 18n)
})
for (const invalid of ['-1', 'NaN', 'Infinity', '1e3', '', null, 1])
  test(`reject invalid money ${String(invalid)}`, () => assert.throws(() => usdUnits(invalid)))
test('estimate includes most expensive cache write and long-context override', () => {
  assert.equal(
    estimateReservation(
      {
        prompt: '0.001',
        completion: '0.002',
        input_cache_write_1h: '0.003',
        overrides: [{ prompt: '0.004', completion: '0.005', request: '0.01' }],
      },
      100,
      10,
    ),
    '0.460000000000000000',
  )
})

test('research budget preserves final acceptance allocation across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-probe-'))
  const path = join(directory, 'ledger.json')
  try {
    let ledger = await openLedger(path, budget)
    const id = await ledger.reserve({
      model: 'm',
      provider: 'p',
      stage: 'research',
      estimateUsd: '40',
    })
    await ledger.settle(id, '40')
    await assert.rejects(
      ledger.reserve({ model: 'm', provider: 'p', stage: 'research', estimateUsd: '11' }),
      /reservation refused/,
    )
    await ledger.close()
    ledger = await openLedger(path, budget)
    const final = await ledger.reserve({
      model: 'm',
      provider: 'p',
      stage: 'acceptance',
      estimateUsd: '60',
    })
    await ledger.settle(final, '60')
    await assert.rejects(
      ledger.reserve({ model: 'm', provider: 'p', stage: 'acceptance', estimateUsd: '0.01' }),
      /reservation refused/,
    )
    await ledger.close()
    assert.equal(JSON.parse(await readFile(path, 'utf8')).entries.length, 2)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('unknown cost blocks both current and subsequent runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-probe-'))
  const path = join(directory, 'ledger.json')
  try {
    const ledger = await openLedger(path, budget)
    const id = await ledger.reserve({
      model: 'm',
      provider: 'p',
      stage: 'research',
      estimateUsd: '1',
    })
    await assert.rejects(ledger.settle(id, undefined), /unknown/)
    await assert.rejects(
      ledger.reserve({ model: 'm', provider: 'p', stage: 'research', estimateUsd: '1' }),
      /Unsettled/,
    )
    await ledger.close()
    await assert.rejects(openLedger(path, budget), /Unsettled/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('exclusive lock refuses concurrent paid runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-probe-'))
  try {
    const path = join(directory, 'ledger.json')
    const ledger = await openLedger(path, budget)
    await assert.rejects(openLedger(path, budget), { code: 'EEXIST' })
    await ledger.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('reconciliation requires an explicit upstream evidence hash and keeps provenance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-probe-'))
  try {
    const path = join(directory, 'ledger.json')
    let ledger = await openLedger(path, budget)
    const id = await ledger.reserve({
      model: 'm',
      provider: 'p',
      stage: 'research',
      estimateUsd: '1',
    })
    await ledger.close()
    ledger = await openLedger(path, budget, { reconciliation: true })
    await assert.rejects(ledger.reconcile(id, '0', {}), /evidence/)
    await ledger.reconcile(id, '0', { evidence: 'billing.json', sha256: 'a'.repeat(64) })
    await ledger.close()
    ledger = await openLedger(path, budget)
    assert.equal(ledger.snapshot().entries[0].costSource.evidence, 'billing.json')
    await ledger.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('abandoned reservation stops restart even after lock release', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-probe-'))
  try {
    const path = join(directory, 'ledger.json')
    const ledger = await openLedger(path, budget)
    await ledger.reserve({ model: 'm', provider: 'p', stage: 'research', estimateUsd: '1' })
    await ledger.close()
    await assert.rejects(openLedger(path, budget), /Unsettled/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
// Values sit one above APPROVED_SCOPE_LIMIT_USD (200 since 169fedc3) so the guard, not the fixture, decides.
test('hard approved limit and configured allocation are checked', async () => {
  await assert.rejects(
    openLedger('/unused', { limitUsd: '201', researchLimitUsd: '50' }),
    /approved/,
  )
  await assert.rejects(
    openLedger('/unused', { limitUsd: '200', researchLimitUsd: '201' }),
    /approved/,
  )
})
test('numeric cost lexeme is preserved losslessly', () =>
  assert.equal(
    parseFacts('{"usage":{"cost":0.123456789012345678}}').usage.cost,
    '0.123456789012345678',
  ))
test('SSE handles CRLF, comments, metadata and unknown versus zero cache', () => {
  const facts = streamFacts(
    ': heartbeat\r\n\r\ndata: {"id":"id","provider":"OpenAI","model":"actual","choices":[{"delta":{"content":"A"}}]}\r\n\r\ndata: {"choices":[{"finish_reason":"stop"}],"usage":{"cost":0.1,"prompt_tokens_details":{"cached_tokens":0}}}\r\n\r\ndata: [DONE]\r\n\r\n',
  )
  assert.equal(facts.done, true)
  assert.equal(facts.cachedTokens, 0)
  assert.equal(facts.cacheWriteTokens, undefined)
  assert.equal(facts.provider, 'OpenAI')
  assert.equal(facts.usage.cost, '0.1')
})
test('trailing content after terminal event is refused', () =>
  assert.throws(() => streamFacts('data: [DONE]\n\ndata: {}\n\n'), /Trailing/))
test('catalog presence never implies certification', () => {
  const cards = summarizeCatalog({ data: [{ id: models[0].id }] }, {})
  assert.equal(cards.length, 37)
  assert.equal(new Set(models.map(m => m.id)).size, 37)
  assert.equal(cards[0].state, 'directory_present')
  assert.equal(cards[1].state, 'directory_absent')
  assert.ok(cards.every(c => c.certification === 'unverified' && c.cacheEvidence === 'unverified'))
})
test('OpenAI reminder maps to developer and other family maps to user', () => {
  const probe = validateRun(config, snapshot)[0]
  const body = makeRequest(probe)
  assert.equal(body.messages[1].role, 'developer')
  assert.equal(
    makeRequest({ ...probe, target: models.find(m => m.family === 'anthropic') }).messages[1].role,
    'user',
  )
  assert.deepEqual(body.provider, {
    order: ['openai'],
    allow_fallbacks: false,
    require_parameters: true,
  })
  assert.ok(!Object.hasOwn(body, 'reasoning'))
  assert.ok(!Object.hasOwn(body, 'prompt_cache_key'))
})
test('explicit cache TTL comes from configuration', () => {
  const probe = validateRun(config, snapshot)[0]
  const body = makeRequest({ ...probe, cache: { mode: 'explicit', ttl: '1h' } })
  assert.equal(body.messages[0].content[0].cache_control.ttl, '1h')
  assert.ok(!Object.hasOwn(makeRequest(probe).messages[0].content[0], 'cache_control'))
})
test('run refuses unregistered models, routes and absent explicit TTL', () => {
  for (const mutation of [
    { model: 'latest' },
    { provider: 'random' },
    { cache: { mode: 'explicit' } },
    { maxOutputTokens: 0 },
    { repetitions: 1 },
  ]) {
    assert.throws(() =>
      validateRun({ ...config, probes: [{ ...config.probes[0], ...mutation }] }, snapshot),
    )
  }
})
test('credential must be explicit and cannot fall back to environment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-probe-'))
  try {
    const path = join(directory, '.env')
    await writeFile(path, 'UNRELATED=not-a-key\n')
    await assert.rejects(readCredential(path), /exactly one/)
    await writeFile(path, 'OPENROUTER_API_KEY="sentinel-credential"\n')
    assert.equal(await readCredential(path), 'sentinel-credential')
    await writeFile(path, 'OPENROUTER_API_KEY=one\nOPENROUTER_API_KEY=two\n')
    await assert.rejects(readCredential(path), /exactly one/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('unsafe routing and identity fields refuse before networking', () => {
  const body = makeRequest(validateRun(config, snapshot)[0])
  assert.throws(() => sendOnce({ ...body, user: 'session' }, 'sentinel', config), /Forbidden/)
  assert.throws(
    () =>
      sendOnce(
        { ...body, provider: { ...body.provider, allow_fallbacks: true } },
        'sentinel',
        config,
      ),
    /pin/,
  )
})
