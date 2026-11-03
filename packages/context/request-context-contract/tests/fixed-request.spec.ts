import { describe, expect, it } from 'vitest'
import type * as M from '@omne-harness/model-contract'
import {
  decodeCandidateRef,
  decodeFixedRequestRecord,
  encodeFixedRequestRecord,
  forecastOf,
  type FixedRequestRecord,
} from '@omne-harness/request-context-contract'
import { assemble, budget, fixture, must, target } from './fixtures.js'

async function recordOf(): Promise<FixedRequestRecord> {
  const f = fixture()
  const result = await assemble(f.input, f.ports, f.policies)
  if (result.kind !== 'candidate-before-extension') throw new Error('Fixture did not assemble')
  return {
    schema: 'request-context/fixed-request/1',
    target,
    candidate: must(decodeCandidateRef('candidate:1')),
    coverage: result.candidate.coverage,
    windowTokens: '1000',
    forecast: { kind: 'estimate', usedTokens: '103' },
    continuation: null,
  }
}
const refused = (field: string) => ({ failure: { field, reason: 'unsupported-format' } })
function stored(value: FixedRequestRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify(encodeFixedRequestRecord(value))) as Record<string, unknown>
}

describe('FixedRequestRecord format (RQ-14)', () => {
  it('round-trips through JSON text to an equal record', async () => {
    const value = await recordOf()
    expect(decodeFixedRequestRecord(stored(value))).toEqual({ ok: value })
    expect(decodeFixedRequestRecord(stored({ ...value, forecast: null }))).toEqual({
      ok: { ...value, forecast: null },
    })
  })

  it('refuses an extra key at the top level, in the target and in the forecast', async () => {
    const value = stored(await recordOf())
    expect(decodeFixedRequestRecord({ ...value, extra: 1 })).toEqual(refused('record'))
    expect(
      decodeFixedRequestRecord({ ...value, target: { ...(value.target as object), extra: 1 } }),
    ).toEqual(refused('target'))
    expect(
      decodeFixedRequestRecord({
        ...value,
        forecast: { kind: 'estimate', usedTokens: '1', extra: 1 },
      }),
    ).toEqual(refused('forecast'))
  })

  it('refuses a missing key, another format name and a value that is not a record', async () => {
    const { windowTokens: _omitted, ...rest } = stored(await recordOf())
    expect(decodeFixedRequestRecord(rest)).toEqual(refused('record'))
    expect(decodeFixedRequestRecord({ ...stored(await recordOf()), schema: 'other/1' })).toEqual(
      refused('schema'),
    )
    expect(decodeFixedRequestRecord(null)).toEqual(refused('record'))
    expect(decodeFixedRequestRecord([])).toEqual(refused('record'))
  })

  it.each(['0', '01', '-1', '1.5', ' 1', '1e3', 1000])(
    'refuses windowTokens %j that is not a positive decimal',
    async windowTokens => {
      const value = stored(await recordOf())
      expect(decodeFixedRequestRecord({ ...value, windowTokens })).toEqual(refused('windowTokens'))
    },
  )

  it.each([
    { kind: 'exact', usedTokens: '1' },
    { kind: 'estimate', usedTokens: '1.5' },
    { kind: 'estimate', usedTokens: 1 },
    'estimate',
  ])('refuses forecast %j', async forecast => {
    const value = stored(await recordOf())
    expect(decodeFixedRequestRecord({ ...value, forecast })).toEqual(refused('forecast'))
  })

  it('refuses a coverage of the wrong shape, a bad candidate and a bad target', async () => {
    const value = stored(await recordOf())
    expect(decodeFixedRequestRecord({ ...value, coverage: { history: {} } })).toEqual(
      refused('coverage'),
    )
    expect(decodeFixedRequestRecord({ ...value, coverage: null })).toEqual(refused('coverage'))
    expect(decodeFixedRequestRecord({ ...value, candidate: '' })).toEqual(refused('candidate'))
    expect(
      decodeFixedRequestRecord({ ...value, target: { tenant: 'not-a-tenant', scope: { ref: 's' } } }),
    ).toEqual(refused('target'))
  })

  it('refuses a stored continuation until the basis has a stored form', async () => {
    const value = stored(await recordOf())
    expect(decodeFixedRequestRecord({ ...value, continuation: {} })).toEqual(
      refused('continuation'),
    )
  })

  it('does not alias the coverage of its input', async () => {
    const json = stored(await recordOf())
    const decoded = decodeFixedRequestRecord(json)
    if (!('ok' in decoded)) throw new Error('Record refused')
    expect(decoded.ok.coverage).not.toBe(json.coverage)
  })
})

describe('forecastOf', () => {
  const check = (amount: string, metric: M.BudgetCheck['metric'] = 'input-tokens') => ({
    ...budget().checks[0]!,
    metric,
    measurement: { kind: 'exact' as const, amount, method: budget().checks[0]!.supplier },
  })
  const withChecks = (...checks: M.BudgetCheck[]): M.RequestBudget => ({ ...budget(), checks })

  it('takes the largest input-tokens measurement, not the first', () => {
    expect(forecastOf(withChecks(check('7'), check('90'), check('12')))).toEqual({
      kind: 'estimate',
      usedTokens: '90',
    })
  })

  it('compares numbers, not text', () => {
    expect(forecastOf(withChecks(check('9'), check('10')))?.usedTokens).toBe('10')
  })

  it('counts an estimate at its upper bound', () => {
    const base = check('100')
    const estimate: M.BudgetCheck = {
      ...base,
      measurement: {
        kind: 'estimate',
        amount: '100',
        margin: '5',
        method: base.supplier,
        marginSource: base.supplier,
      },
    }
    expect(forecastOf(withChecks(estimate))?.usedTokens).toBe('105')
  })

  it('is null without an input-tokens check', () => {
    expect(forecastOf(withChecks())).toBeNull()
    const others = budget().checks[0]!
    expect(forecastOf(withChecks({ ...others, metric: 'image-count' as const }))).toBeNull()
  })
})
