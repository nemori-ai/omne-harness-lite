import { describe, expect, it } from 'vitest'
import { usageProtocol } from '@omne-harness/usage-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'
import { fact, measures, result } from './fixtures/values.ts'

const { operations } = usageProtocol
const query = operations['query-usage']
const records = operations['list-usage-records']
const occupancy = operations['read-context-occupancy']
const range = { from: '2026-11-19T00:00:00Z', to: '2026-11-20T00:00:00Z' }
const queryBody = {
  tenant,
  scope: { kind: 'session', session },
  range,
  zone: 'Asia/Shanghai',
  bucket: 'day',
  groupBy: ['model', 'purpose'],
}
const recordsBody = { tenant, scope: { kind: 'tenant' }, range, after: null, limit: 100 }
const refused = (codec: Parameters<typeof readSample>[0], sample: unknown) =>
  expect(readSample(codec, sample).ok).toBe(false)

describe('query-usage', () => {
  it('reads each scope, bucket and up to two dimensions, and writes them back as they were', () => {
    expectRoundTrip(query.body, queryBody)
    for (const scope of [{ kind: 'tenant' }, { kind: 'organization' }])
      expectRoundTrip(query.body, { ...queryBody, scope })
    for (const bucket of ['none', 'hour', 'week', 'month'])
      expectRoundTrip(query.body, { ...queryBody, bucket, groupBy: [] })
    for (const groupBy of [['source', 'provider'], ['tool']])
      expectRoundTrip(query.body, { ...queryBody, groupBy })
  })

  it('refuses three dimensions, an unknown dimension or bucket, a bad session, a missing zone and an extra member', () => {
    refused(query.body, { ...queryBody, groupBy: ['model', 'purpose', 'tool'] })
    refused(query.body, { ...queryBody, groupBy: ['request'] })
    refused(query.body, { ...queryBody, bucket: 'minute' })
    refused(query.body, { ...queryBody, scope: { kind: 'session', session: 's-1' } })
    refused(query.body, { ...queryBody, range: { from: 'yesterday', to: range.to } })
    const { zone: _zone, ...withoutZone } = queryBody
    refused(query.body, withoutZone)
    refused(query.body, { ...queryBody, parameters: {} })
  })

  it('writes a result back as it was, with known and unknown ratios and empty distributions', () => {
    expectRoundTrip(query.outcomes.succeeded, result)
    expectRoundTrip(query.outcomes.succeeded, {
      ...result,
      coverage: { ...result.coverage, earliest: '2026-11-18T08:00:00Z' },
    })
  })

  it('refuses a fractional count or milliseconds, and a measure with a member outside the shape', () => {
    refused(query.outcomes.succeeded, { ...result, total: { ...measures, calls: 1.5 } })
    const fractional = { count: 1, p50: 310.5, p90: 310.5 }
    refused(query.outcomes.succeeded, {
      ...result,
      total: { ...measures, duration: { ...measures.duration, whole: fractional } },
    })
    refused(query.outcomes.succeeded, { ...result, total: { ...measures, request: 'x' } })
  })
})

describe('list-usage-records', () => {
  it('reads a first page and a continuation of up to one hundred', () => {
    expectRoundTrip(records.body, recordsBody)
    expectRoundTrip(records.body, { ...recordsBody, after: 'ur1.abc', limit: 1 })
    refused(records.body, { ...recordsBody, limit: 0 })
    refused(records.body, { ...recordsBody, limit: 101 })
  })

  it('writes a page of facts back as it was, each with only numbers and names', () => {
    const undated = {
      ...fact,
      at: null,
      cost: null,
      window: null,
      accounted: false,
      outcome: 'pending',
      subject: { kind: 'tool_execution', id: 'exec-1' },
    }
    const unknownCost = { ...fact, cost: { state: 'unknown' }, cause: 'no-reply' }
    expectRoundTrip(records.outcomes.succeeded, {
      entries: [fact, undated, unknownCost],
      next: 'ur1.x',
    })
    expectRoundTrip(records.outcomes.succeeded, { entries: [], next: null })
    expectRoundTrip(records.outcomes.succeeded, {
      entries: ['interrupted', 'failed'].map(outcome => ({ ...fact, outcome })),
      next: null,
    })
  })

  it('refuses a fact that carries a request, a reply or arguments', () => {
    for (const extra of [{ request: {} }, { reply: 'text' }, { arguments: {} }])
      refused(records.outcomes.succeeded, { entries: [{ ...fact, ...extra }], next: null })
    refused(records.outcomes.succeeded, {
      entries: [{ ...fact, consumer: { ...fact.consumer, secret: 'k' } }],
      next: null,
    })
  })
})

describe('read-context-occupancy', () => {
  it('reads a tenant and a session', () => {
    expectRoundTrip(occupancy.body, { tenant, session })
    refused(occupancy.body, { tenant, session: 'not-hex' })
  })

  it('writes each of the three answers back as it was and refuses another reason', () => {
    expectRoundTrip(occupancy.outcomes.succeeded, {
      kind: 'known',
      used: '1501',
      window: '200000',
      percent: '0.75',
      compactAtPercent: null,
      asOf: { at: '2026-11-19T10:00:00Z', model: 'm-a' },
    })
    expectRoundTrip(occupancy.outcomes.succeeded, { kind: 'none-yet' })
    for (const reason of ['usage-unknown', 'window-unknown'])
      expectRoundTrip(occupancy.outcomes.succeeded, { kind: 'unknown', reason })
    refused(occupancy.outcomes.succeeded, { kind: 'unknown', reason: 'guessed' })
  })
})

describe('the refusals every read shares', () => {
  it.each([query, records, occupancy])('round-trips each refusal body', operation => {
    for (const field of ['scope', 'range', 'zone', 'bucket', 'groupBy', 'limit', 'after'])
      expectRoundTrip(operation.outcomes.invalid, { field, reason: 'shape' })
    refused(operation.outcomes.invalid, { field: 'tenant', reason: 'shape' })
    expectRoundTrip(operation.outcomes.unsupported, { field: 'scope' })
    expectRoundTrip(operation.outcomes['not-found'], {})
    for (const limit of ['buckets', 'pages']) expectRoundTrip(operation.outcomes.limited, { limit })
    refused(operation.outcomes.limited, { limit: 'rows' })
  })
})
