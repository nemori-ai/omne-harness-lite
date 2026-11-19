import { expect, it } from 'vitest'

it('exposes the two blocks, their readers, the notification source and its translation', async () => {
  const root = (await import('@omne-harness/calendar-adapters')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'CALENDAR_ENVIRONMENT_KEY',
      'CALENDAR_SUPPLY_RISK_KEY',
      'calendarEnvironmentBlock',
      'calendarEnvironmentDescriptor',
      'calendarSupplyRiskBlock',
      'calendarSupplyRiskDescriptor',
      'calendarSupplySource',
      'createCalendarEnvironmentReader',
      'standingItemsOfRisks',
      'supplyRisksOf',
    ].sort(),
  )
})
