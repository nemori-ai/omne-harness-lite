import { describe, expect, it, vi } from 'vitest'
import {
  calendarHealthSchema,
  calendarIdSchema,
  type CalendarHealth,
  type CalendarId,
  type CalendarQueryResult,
} from '@omne-harness/calendar-contract'
import { createCalendarQueries } from '../../src/index.ts'
import type { CalendarAuthorityReader, CalendarHealthProjection } from '../../src/index.ts'
import { context, repository } from './fixture.ts'

const ids = ['cn-legal-holidays', 'jp-legal-holidays'].map(id => calendarIdSchema.parse(id))

function health(calendarId: CalendarId): CalendarHealth {
  return calendarHealthSchema.parse({
    calendarId,
    observedAt: '2026-11-19T00:00:00.000Z',
    queryAvailability: 'available',
    supply: 'ok',
    horizon: 'ok',
    coverageStart: '2022-12-31',
    coverageEnd: '2027-12-31',
    knowledgeAsOf: null,
    remainingCoverageDays: 407,
    consecutiveFailures: 0,
    lastSuccess: null,
    pendingRuns: 0,
    sources: [],
    reasons: [],
  })
}

function setup(healthProjection?: CalendarHealthProjection) {
  const authority = {
    check: vi.fn<CalendarAuthorityReader['check']>().mockResolvedValue({ kind: 'allowed' }),
  }
  const queries = createCalendarQueries({
    repository: repository(),
    authority,
    environment: { read: vi.fn() },
    clock: { now: () => 1793664000000 },
    catalog: ids.map(calendarId => ({ calendarId, timezone: 'UTC', semanticBoundary: 'b' })),
    ...(healthProjection ? { healthProjection } : {}),
  })
  return { queries, authority }
}

describe('calendar queries: supply health', () => {
  it('answers the health of every catalogued calendar, in catalog order', async () => {
    const projection = vi.fn(async (calendarId: CalendarId) => ({
      kind: 'ok' as const,
      value: health(calendarId),
    }))
    const { queries, authority } = setup(projection)
    const result = await queries.health(context)
    expect(result).toEqual({ kind: 'ok', value: ids.map(health) })
    expect(projection.mock.calls.map(([id]) => id)).toEqual(ids)
    expect(authority.check).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'health', calendarId: null }),
    )
  })

  it('answers that the basis is unavailable when the assembly gave no projection', async () => {
    const { queries } = setup()
    const result = await queries.health(context)
    expect(result).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
  })

  it('answers no partial list when one calendar cannot be read', async () => {
    const failed: CalendarQueryResult<CalendarHealth> = {
      kind: 'error',
      error: {
        code: 'authority_unavailable',
        message: 'x',
        requestId: 'r',
        retryable: true,
        details: {},
      },
    }
    const projection = vi.fn(async (calendarId: CalendarId) =>
      calendarId === ids[1] ? failed : { kind: 'ok' as const, value: health(calendarId) },
    )
    const { queries } = setup(projection)
    expect(await queries.health(context)).toMatchObject({
      kind: 'error',
      error: { code: 'provider_failure' },
    })
    const throwing = vi.fn(async () => {
      throw new Error('down')
    })
    expect(await setup(throwing).queries.health(context)).toMatchObject({
      kind: 'error',
      error: { code: 'provider_failure' },
    })
  })

  it('refuses a caller who may not read, without reading the projection', async () => {
    const projection = vi.fn()
    const { queries, authority } = setup(projection)
    authority.check.mockResolvedValue({ kind: 'denied' })
    expect(await queries.health(context)).toMatchObject({
      kind: 'error',
      error: { code: 'forbidden' },
    })
    expect(projection).not.toHaveBeenCalled()
  })
})
