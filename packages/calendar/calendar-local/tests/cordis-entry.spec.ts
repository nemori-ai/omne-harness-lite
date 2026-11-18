import { Context, type Plugin } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  CalendarQueryService,
  CalendarSupplyService,
} from '@omne-harness/calendar-cordis-contract/cordis'
import { IndependentSettingsService } from '@omne-harness/assets-cordis-contract/cordis'
import { createIndependentSettingsPoint, createSettingsRegistry } from '@omne-harness/settings'
import { calendarEnvironmentSettings } from '@omne-harness/calendar-local'

it('exports local providers inheriting the unique calendar service definitions', async () => {
  const cordis = await import('@omne-harness/calendar-local/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'CalendarLocalQueryProvider',
    'CalendarLocalSupplyProvider',
    'calendarEnvironmentSettingsPlugin',
  ])
  expect(Object.getPrototypeOf(cordis.CalendarLocalQueryProvider)).toBe(CalendarQueryService)
  expect(Object.getPrototypeOf(cordis.CalendarLocalSupplyProvider)).toBe(CalendarSupplyService)
})

it('brings its own environment settings to the independent settings point', async () => {
  const { calendarEnvironmentSettingsPlugin } = await import('@omne-harness/calendar-local/cordis')
  const root = new Context()
  await root.plugin({
    name: 'independent-settings',
    apply(ctx: Context) {
      const point = createIndependentSettingsPoint(createSettingsRegistry({ capacity: 4 }))
      new IndependentSettingsService(ctx, point)
    },
  } satisfies Plugin.Object)
  const fiber = root.plugin(calendarEnvironmentSettingsPlugin)
  await fiber.await()
  expect(root.independentSettings.view.list()).toEqual([calendarEnvironmentSettings])
  await fiber.dispose()
  expect(root.independentSettings.view.list()).toEqual([])
})
