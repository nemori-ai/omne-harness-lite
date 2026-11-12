import { expect, test } from 'vitest'
import { calendarResolveResultSchema } from '@omne-harness/calendar-contract'
import {
  calendarFixture,
  context,
  definition,
  harness,
  input,
  selected,
  daily,
} from './fixtures.ts'

const faults = [
  { name: 'resolution calendar', resolution: { calendarId: 'other' } },
  { name: 'resolution version', resolution: { versionId: 'other' } },
  { name: 'resolution coverage start', resolution: { coverageStart: '2024-01-01' } },
  { name: 'resolution coverage end', resolution: { coverageEnd: '2029-12-31' } },
  { name: 'basis calendar', basis: { calendarId: 'other' } },
  { name: 'basis version', basis: { versionId: 'other' } },
  { name: 'basis coverage start', basis: { coverage: { from: '2024-01-01', to: '2028-12-31' } } },
  { name: 'basis coverage end', basis: { coverage: { from: '2025-01-01', to: '2029-12-31' } } },
  { name: 'basis content', basis: { contentHash: 'b'.repeat(64) } },
  { name: 'basis knowledge', basis: { knowledgeAsOf: '2024-01-01T00:00:00.000Z' } },
  { name: 'basis provenance', basis: { provenanceRefs: ['different:source'] } },
  { name: 'day date', day: { date: '2025-01-02' } },
  { name: 'day working classification', day: { working: false } },
  { name: 'day holiday classification', day: { holiday: true } },
  {
    name: 'day witness starts late',
    basis: { inspectedRange: { from: '2025-01-02', to: '2025-01-03' } },
  },
  {
    name: 'day witness ends early',
    basis: { inspectedRange: { from: '2024-12-30', to: '2024-12-31' } },
  },
]

test.each(faults)('rejects inconsistent $name on the first Calendar response', async fault => {
  const fixture = calendarFixture()
  const resolve = fixture.queries.resolve
  fixture.queries.resolve = async (ctx, request) => {
    const response = await resolve(ctx, request)
    if (response.kind !== 'ok' || response.value.result.kind !== 'day') return response
    const day = response.value.result.value
    return calendarResolveResultSchema.parse({
      ...response,
      value: {
        ...response.value,
        ...('resolution' in fault ? fault.resolution : {}),
        result: {
          kind: 'day',
          value: {
            ...day,
            ...('day' in fault ? fault.day : {}),
            basis: { ...day.basis, ...('basis' in fault ? fault.basis : {}) },
          },
        },
      },
    })
  }
  const { service, enumerations } = harness({ calendar: fixture.queries })
  expect(
    await service.preview(context, input(definition(undefined, { binding: selected }))),
  ).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure' },
  })
  expect(enumerations).toEqual([])
})

test('rejects a different query kind on the initial basis capture', async () => {
  const fixture = calendarFixture()
  const resolve = fixture.queries.resolve
  let replies = 0
  fixture.queries.resolve = async (ctx, request) => {
    const response = await resolve(ctx, request)
    if (response.kind !== 'ok') return response
    const changed = calendarResolveResultSchema.parse({
      ...response,
      value: {
        ...response.value,
        result: {
          kind: 'nth',
          value: { kind: 'ok', date: null, basis: response.value.result.value.basis },
        },
      },
    })
    replies++
    return changed
  }
  const { service, enumerations } = harness({ calendar: fixture.queries })
  expect(
    await service.preview(context, input(definition(undefined, { binding: selected }))),
  ).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure' },
  })
  expect(enumerations).toEqual([])
  expect(replies).toBe(1)
})

test.each([
  ['nextWorkingDay', '2026-02-06'],
  ['nextWorkingDay', '2026-02-07'],
  ['previousWorkingDay', '2026-02-08'],
  ['previousWorkingDay', '2026-02-07'],
] as const)('rejects %s shift returning %s on the wrong side of origin', async (adjust, date) => {
  const fixture = calendarFixture()
  const resolve = fixture.queries.resolve
  fixture.queries.resolve = async (ctx, request) => {
    const response = await resolve(ctx, request)
    if (response.kind !== 'ok' || response.value.result.kind !== 'shift') return response
    return calendarResolveResultSchema.parse({
      ...response,
      value: {
        ...response.value,
        result: {
          kind: 'shift',
          value: {
            ...response.value.result.value,
            date,
            basis: {
              ...response.value.result.value.basis,
              inspectedRange: { from: '2025-01-01', to: '2028-12-31' },
            },
          },
        },
      },
    })
  }
  const rule = definition(daily('2026-02-07T00:00:00', '2026-02-07T23:59:59'), {
    binding: selected,
    calendarOverlay: { predicate: 'workingDay', adjust },
  })
  expect(
    await harness({ calendar: fixture.queries }).service.preview(context, input(rule)),
  ).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure' },
  })
})

test.each([
  ['2026-01-31', 'error'],
  ['2026-03-01', 'error'],
  ['2026-02-28', 'ok'],
] as const)(
  'nth result %s respects the inclusive period even with a larger witness',
  async (date, kind) => {
    const fixture = calendarFixture()
    const resolve = fixture.queries.resolve
    fixture.queries.resolve = async (ctx, request) => {
      const response = await resolve(ctx, request)
      if (response.kind !== 'ok' || response.value.result.kind !== 'nth') return response
      return calendarResolveResultSchema.parse({
        ...response,
        value: {
          ...response.value,
          result: {
            kind: 'nth',
            value: {
              ...response.value.result.value,
              date,
              basis: {
                ...response.value.result.value.basis,
                inspectedRange: { from: '2026-01-01', to: '2026-03-31' },
              },
            },
          },
        },
      })
    }
    const rule = definition(
      {
        kind: 'position',
        period: 'month',
        interval: 1,
        begin: '2026-02-01T00:00:00',
        until: '2026-02-28T23:59:59',
        ordinal: 'last',
        selector: { kind: 'workingDay' },
        times: ['09:00:00'],
      },
      { binding: selected },
    )
    const result = await harness({ calendar: fixture.queries }).service.preview(
      context,
      input(rule),
    )
    expect(result.kind).toBe(kind)
    if (kind === 'error') expect(result).toMatchObject({ error: { code: 'provider_failure' } })
    else
      expect(result).toMatchObject({
        value: { candidates: [{ adjustedLocal: '2026-02-28T09:00:00' }] },
      })
  },
)
