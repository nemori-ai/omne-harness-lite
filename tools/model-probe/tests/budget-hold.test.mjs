import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLedger } from '../src/budget.mjs'
import { openProductionLedger, paidInvocation } from '../src/production-gate.mjs'

const budget = { limitUsd: '100', researchLimitUsd: '50' }
const audit = {
  reason: 'Historical receipt unavailable; reserve approved allowance',
  source: 'approval-42',
}
const evidence = { evidence: 'receipt.json', sha256: 'a'.repeat(64) }
const reservation = (estimateUsd, stage = 'research') => ({
  model: 'fixture',
  provider: 'fixture',
  stage,
  estimateUsd,
})
async function fixture(t, state = 'unknown', estimateUsd = '1', stage = 'research') {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-budget-hold-')))
  const path = join(directory, 'ledger.json')
  let ledger = await openLedger(path, budget)
  t.after(async () => {
    if (ledger) await ledger.close()
    await rm(directory, { recursive: true, force: true })
  })
  const id = await ledger.reserve(reservation(estimateUsd, stage))
  if (state === 'unknown') await assert.rejects(ledger.settle(id, undefined), /unknown/)
  await ledger.close()
  ledger = undefined
  return {
    id,
    path,
    async open(options) {
      if (ledger) await ledger.close()
      ledger = undefined
      ledger = await openProductionLedger(path, path, budget, options)
      return ledger
    },
  }
}

for (const state of ['unknown', 'reserved']) {
  test(`explicit ${state} hold survives reopen without fabricating actual cost`, async t => {
    const f = await fixture(t, state)
    await assert.rejects(f.open(), /Unsettled/)
    let ledger = await f.open({ reconciliation: true })
    await ledger.acknowledgeBudgetHold(f.id, '5.00000000000000000001', audit)
    const entry = ledger.snapshot().entries[0]
    assert.equal(entry.state, state)
    assert.equal(Object.hasOwn(entry, 'actualUsd'), false)
    assert.deepEqual(entry.budgetHoldAcknowledgments[0], {
      ...audit,
      holdUsd: '5.00000000000000000001',
      state,
      acknowledgedAt: entry.budgetHoldAcknowledgments[0].acknowledgedAt,
    })
    assert.ok(Number.isFinite(Date.parse(entry.budgetHoldAcknowledgments[0].acknowledgedAt)))
    await assert.rejects(openLedger(f.path, budget, { reconciliation: true }), { code: 'EEXIST' })
    ledger = await f.open()
    assert.deepEqual(ledger.snapshot().entries[0], entry)
    let effects = 0
    await paidInvocation(ledger, reservation('44.99999999999999999999'), async () => {
      effects++
      return { actualUsd: '44.99999999999999999999' }
    })
    await assert.rejects(ledger.reserve(reservation('0.00000000000000000001')), /refused/)
    assert.equal(effects, 1)
    assert.equal(Object.hasOwn(ledger.snapshot().entries[0], 'actualUsd'), false)
  })
}

test('maintenance mode, nonempty audit, positive exact decimal and original estimate are required', async t => {
  const f = await fixture(t, 'reserved', '1.00000000000000000001')
  const ledger = await f.open({ reconciliation: true })
  const original = ledger.snapshot()
  for (const amount of ['0', '0.0000', '1', '-1', 'NaN', '1e2', '', null, 2, undefined]) {
    await assert.rejects(ledger.acknowledgeBudgetHold(f.id, amount, audit))
  }
  for (const metadata of [
    {},
    { reason: ' ', source: 'source' },
    { reason: 'reason', source: '' },
    { reason: 'reason', source: {} },
  ]) {
    await assert.rejects(ledger.acknowledgeBudgetHold(f.id, '2', metadata), /reason and source/)
  }
  await assert.rejects(ledger.acknowledgeBudgetHold('missing', '2', audit), /entry/)
  assert.deepEqual(ledger.snapshot(), original)
  assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')), original)
  await ledger.acknowledgeBudgetHold(f.id, '1.00000000000000000001', audit)
  const ordinary = await f.open()
  await assert.rejects(ordinary.acknowledgeBudgetHold(f.id, '2', audit), /maintenance/)
})

test('even an original zero estimate requires a positive hold, with exact sub-unit precision', async t => {
  const f = await fixture(t, 'unknown', '0')
  const ledger = await f.open({ reconciliation: true })
  await assert.rejects(ledger.acknowledgeBudgetHold(f.id, '0', audit), /positive/)
  await ledger.acknowledgeBudgetHold(f.id, '0.00000000000000000001', audit)
  assert.equal(
    ledger.snapshot().entries[0].budgetHoldAcknowledgments[0].holdUsd,
    '0.00000000000000000001',
  )
})

for (const [stage, limit] of [
  ['research', '50'],
  ['acceptance', '100'],
]) {
  test(`${stage} exposure rejects excessive holds and new reservations at the exact limit`, async t => {
    const f = await fixture(t, 'unknown', '1', stage)
    const ledger = await f.open({ reconciliation: true })
    await assert.rejects(
      ledger.acknowledgeBudgetHold(f.id, `${limit}.00000000000000000001`, audit),
      /refused/,
    )
    await ledger.acknowledgeBudgetHold(f.id, limit, audit)
    await assert.rejects(ledger.reserve(reservation('0.00000000000000000001', stage)), /refused/)
    if (stage === 'research') {
      const id = await ledger.reserve(reservation('50', 'acceptance'))
      await ledger.settle(id, '50')
      await assert.rejects(
        ledger.reserve(reservation('0.00000000000000000001', 'acceptance')),
        /refused/,
      )
    }
  })
}

test('a new unknown cost blocks further sends and reopening until separately acknowledged', async t => {
  const f = await fixture(t)
  let ledger = await f.open({ reconciliation: true })
  await ledger.acknowledgeBudgetHold(f.id, '2', audit)
  const id = await ledger.reserve(reservation('1'))
  await assert.rejects(ledger.settle(id, undefined), /unknown/)
  await assert.rejects(ledger.reserve(reservation('1')), /Unsettled/)
  await assert.rejects(f.open(), /Unsettled/)
  ledger = await f.open({ reconciliation: true })
  await ledger.acknowledgeBudgetHold(id, '1', audit)
  await f.open()
})

test('reserved-to-unknown transition needs a fresh acknowledgment and retains the prior audit', async t => {
  const f = await fixture(t, 'reserved')
  let ledger = await f.open({ reconciliation: true })
  await ledger.acknowledgeBudgetHold(f.id, '2', audit)
  await assert.rejects(ledger.settle(f.id, undefined), /unknown/)
  await assert.rejects(ledger.reserve(reservation('1')), /Unsettled/)
  await assert.rejects(f.open(), /Unsettled/)
  ledger = await f.open({ reconciliation: true })
  await ledger.acknowledgeBudgetHold(f.id, '3', audit)
  assert.deepEqual(
    ledger.snapshot().entries[0].budgetHoldAcknowledgments.map(h => h.state),
    ['reserved', 'unknown'],
  )
  await f.open()
})

for (const method of ['settle', 'reconcile']) {
  test(`${method} replaces the hold with actual expense and preserves acknowledgment audit`, async t => {
    const f = await fixture(t, method === 'settle' ? 'reserved' : 'unknown')
    let ledger = await f.open({ reconciliation: true })
    await ledger.acknowledgeBudgetHold(f.id, '50', audit)
    const history = ledger.snapshot().entries[0].budgetHoldAcknowledgments
    await ledger[method](f.id, '2.00000000000000000001', evidence)
    ledger = await f.open()
    const entry = ledger.snapshot().entries[0]
    assert.equal(entry.state, 'settled')
    assert.equal(entry.actualUsd, '2.00000000000000000001')
    assert.deepEqual(entry.budgetHoldAcknowledgments, history)
    if (method === 'reconcile') assert.deepEqual(entry.costSource, evidence)
    const id = await ledger.reserve(reservation('47.99999999999999999999'))
    await ledger.settle(id, '47.99999999999999999999')
    await assert.rejects(ledger.reserve(reservation('0.00000000000000000001')), /refused/)
  })
}

for (const [stage, actualUsd] of [
  ['research', '50.00000000000000000001'],
  ['acceptance', '100.00000000000000000001'],
]) {
  test(`reconciliation persists ${stage} overrun and rejects further spending`, async t => {
    const f = await fixture(t, 'unknown', '1', stage)
    let ledger = await f.open({ reconciliation: true })
    await ledger.acknowledgeBudgetHold(f.id, '2', audit)
    await assert.rejects(ledger.reconcile(f.id, actualUsd, evidence), /exceeds budget/)
    assert.equal(ledger.snapshot().entries[0].actualUsd, actualUsd)
    ledger = await f.open()
    await assert.rejects(ledger.reserve(reservation('0', 'acceptance')), /refused/)
  })
}

test('maintenance accounts for other unacknowledged reservations before increasing a hold', async t => {
  const f = await fixture(t)
  const ledger = await f.open({ reconciliation: true })
  await ledger.acknowledgeBudgetHold(f.id, '20', audit)
  await ledger.reserve(reservation('30'))
  const original = ledger.snapshot()
  await assert.rejects(
    ledger.acknowledgeBudgetHold(f.id, '20.00000000000000000001', audit),
    /refused/,
  )
  assert.deepEqual(ledger.snapshot(), original)
  assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')), original)
})

test('replacing a hold keeps audit history without counting the prior allowance twice', async t => {
  const f = await fixture(t)
  const ledger = await f.open({ reconciliation: true })
  await ledger.acknowledgeBudgetHold(f.id, '40', audit)
  await ledger.acknowledgeBudgetHold(f.id, '50', { ...audit, reason: 'Revised allowance' })
  assert.equal(ledger.snapshot().entries[0].budgetHoldAcknowledgments.length, 2)
  const id = await ledger.reserve(reservation('50', 'acceptance'))
  await ledger.settle(id, '50')
})

test('malformed persisted acknowledgment cannot unlock ordinary sending', async t => {
  const f = await fixture(t)
  const original = JSON.parse(await readFile(f.path, 'utf8'))
  const good = {
    ...audit,
    state: 'unknown',
    acknowledgedAt: new Date().toISOString(),
    holdUsd: '2',
  }
  for (const history of [
    [],
    {},
    [{ ...good, holdUsd: '0' }],
    [{ ...good, holdUsd: '0.9' }],
    [{ ...good, reason: ' ' }],
    [{ ...good, source: null }],
    [{ ...good, acknowledgedAt: 'invalid' }],
  ]) {
    const state = structuredClone(original)
    state.entries[0].budgetHoldAcknowledgments = history
    await writeFile(f.path, JSON.stringify(state), { mode: 0o600 })
    await assert.rejects(f.open(), /Invalid budget hold/)
  }
})
