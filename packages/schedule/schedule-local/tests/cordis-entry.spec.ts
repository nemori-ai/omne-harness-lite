import { Context, type Plugin } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { IndependentSettingsService } from '@omne-harness/assets-cordis-contract/cordis'
import { createIndependentSettingsPoint, createSettingsRegistry } from '@omne-harness/settings'
import { scheduleAgentAuthoringSettings } from '@omne-harness/schedule-local'

it('exports the local plugin factory and its own settings', async () => {
  const cordis = (await import('@omne-harness/schedule-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'createScheduleLocalPlugin',
    'scheduleAgentAuthoringSettingsPlugin',
  ])
})

it('brings its own agent authoring settings to the independent settings point', async () => {
  const { scheduleAgentAuthoringSettingsPlugin } =
    await import('@omne-harness/schedule-local/cordis')
  const root = new Context()
  await root.plugin({
    name: 'independent-settings',
    apply(ctx: Context) {
      const point = createIndependentSettingsPoint(createSettingsRegistry({ capacity: 4 }))
      new IndependentSettingsService(ctx, point)
    },
  } satisfies Plugin.Object)
  const fiber = root.plugin(scheduleAgentAuthoringSettingsPlugin)
  await fiber.await()
  expect(root.independentSettings.view.list()).toEqual([scheduleAgentAuthoringSettings])
  await fiber.dispose()
  expect(root.independentSettings.view.list()).toEqual([])
})
