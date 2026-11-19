import { describe, expect, it } from 'vitest'
import { calendarHealthSchema, type CalendarHealth } from '@omne-harness/calendar-contract'
import { standingItemsSchema } from '@omne-harness/notification-contract'
import {
  calendarSupplyRiskBlock,
  calendarSupplySource,
  standingItemsOfRisks,
  supplyRisksOf,
} from '../src/index.ts'

function health(overrides: Partial<CalendarHealth> = {}): CalendarHealth {
  return calendarHealthSchema.parse({
    calendarId: 'jp-legal-holidays',
    observedAt: '2027-03-08T00:00:00.000Z',
    queryAvailability: 'available',
    supply: 'ok',
    horizon: 'ok',
    coverageStart: '1955-01-01',
    coverageEnd: '2027-12-31',
    knowledgeAsOf: null,
    remainingCoverageDays: 298,
    consecutiveFailures: 0,
    lastSuccess: null,
    pendingRuns: 0,
    sources: [],
    reasons: [],
    ...overrides,
  })
}

const kinds = (items: ReturnType<typeof supplyRisksOf>) => items.map(item => item.kind)

describe('supply risks of the calendar health (the totalisation table of design-detail A5)', () => {
  it('has no risk for an ok horizon with an ok or pending supply', () => {
    expect(supplyRisksOf([health(), health({ supply: 'pending' })])).toEqual([])
  })
  it('opens one coverage risk for a warning or critical horizon', () => {
    expect(kinds(supplyRisksOf([health({ horizon: 'warning' })]))).toEqual(['coverage-warning'])
    expect(kinds(supplyRisksOf([health({ horizon: 'critical' })]))).toEqual(['coverage-critical'])
  })
  it('does not count an unknown horizon or an unknown supply as an open risk', () => {
    expect(supplyRisksOf([health({ horizon: 'unknown', supply: 'unknown' })])).toEqual([])
  })
  it('adds a supply risk when supply failed, beside any coverage risk', () => {
    expect(
      kinds(
        supplyRisksOf([health({ horizon: 'critical', supply: 'failed', consecutiveFailures: 3 })]),
      ),
    ).toEqual(['coverage-critical', 'supply-failing'])
  })
})

describe('the supply risk block', () => {
  it('reads unknown, not empty, when health cannot be read', async () => {
    const block = calendarSupplyRiskBlock(async () => null)
    expect(await block.supply({ tenant: {} } as never)).toEqual({ kind: 'unknown' })
  })
  it('reads the risks as its value, in the shape of the standing items Notification reads', async () => {
    const block = calendarSupplyRiskBlock(async () => [health({ horizon: 'warning' })])
    const read = await block.supply({ tenant: {} } as never)
    expect(read).toMatchObject({
      kind: 'value',
      value: [
        { id: 'calendar.supply/jp-legal-holidays/coverage-warning', type: 'coverage-warning' },
      ],
    })
  })
})

describe('the translation into standing items', () => {
  it('keeps one identity per calendar and cause, so a repeated read reminds once', () => {
    const first = standingItemsOfRisks(supplyRisksOf([health({ horizon: 'warning' })]))
    const later = standingItemsOfRisks(
      supplyRisksOf([
        health({
          horizon: 'warning',
          observedAt: '2027-03-09T00:00:00.000Z' as CalendarHealth['observedAt'],
        }),
      ]),
    )
    expect(first.map(item => item.id)).toEqual([
      'calendar.supply/jp-legal-holidays/coverage-warning',
    ])
    expect(later.map(item => item.id)).toEqual(first.map(item => item.id))
  })
  it('gives a critical horizon a new identity, so it reminds again', () => {
    const [warned] = standingItemsOfRisks(supplyRisksOf([health({ horizon: 'warning' })]))
    const [critical] = standingItemsOfRisks(supplyRisksOf([health({ horizon: 'critical' })]))
    expect(critical?.id).not.toBe(warned?.id)
  })
  it('produces items in the shape Notification reads, from the declared source and types', () => {
    const items = standingItemsOfRisks(
      supplyRisksOf([health({ horizon: 'critical', supply: 'failed' })]),
    )
    expect(standingItemsSchema.safeParse(items).success).toBe(true)
    const declared = calendarSupplySource.types.map(type => type.name)
    for (const item of items) {
      expect(item.source).toBe(calendarSupplySource.name)
      expect(declared).toContain(item.type)
    }
  })
  it('declares every risk type as standing on the risk block; only a critical horizon is strong for a person', () => {
    expect(
      calendarSupplySource.types.map(type => [type.name, type.kind, type.defaults.person]),
    ).toEqual([
      ['coverage-warning', { kind: 'standing', binding: 'calendar.supply-risk' }, 'weak'],
      ['coverage-critical', { kind: 'standing', binding: 'calendar.supply-risk' }, 'strong'],
      ['supply-failing', { kind: 'standing', binding: 'calendar.supply-risk' }, 'weak'],
    ])
  })
})
