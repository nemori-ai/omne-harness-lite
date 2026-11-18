import { Context, type EffectMeta, type Plugin } from '@deepseek-ai/cordis'
import {
  createIndependentSettingsPoint,
  createSettingsRegistry,
  type SettingDefinitions,
} from '@omne-harness/settings'
import { independentSettingsKey } from '@omne-harness/assets-cordis-contract'
import {
  IndependentSettingsService,
  independentSettingsPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'

const ACTIVE = 2
const PENDING = 0
const FAILED = 3

function declaration(providerId: string, title: string): SettingDefinitions {
  return {
    providerId,
    definitionId: 'environment',
    version: '1',
    groups: [{ id: 'general', parentId: null, title, description: `${title}。`, order: 0 }],
    items: [],
  }
}

function labels(effects: readonly EffectMeta[]): string[] {
  return effects.flatMap(effect => [effect.label, ...labels(effect.children)])
}

const provider: Plugin.Object = {
  name: 'independent-settings-provider',
  apply(ctx: Context) {
    const registry = createSettingsRegistry({ capacity: 8 })
    new IndependentSettingsService(ctx, createIndependentSettingsPoint(registry))
  },
}

async function settings() {
  const root = new Context()
  await root.plugin(provider)
  return { root, service: root.get(independentSettingsKey) as IndependentSettingsService }
}

describe('the independent settings service on a real Cordis root', () => {
  it('takes a declaration when the plugin starts and withdraws it when its scope unloads', async () => {
    const { root, service } = await settings()
    const fiber = root.plugin(
      independentSettingsPlugin('calendar-settings', declaration('calendar', '日历')),
    )
    await fiber.await()
    expect(labels(fiber.getEffects())).toContain('independentSettings.contribute')
    expect(service.view.list()).toEqual([declaration('calendar', '日历')])
    await fiber.dispose()
    expect(service.view.list()).toEqual([])
  })

  it('does not start a contribution plugin until the service is there', async () => {
    const root = new Context()
    const fiber = root.plugin(
      independentSettingsPlugin('calendar-settings', declaration('calendar', '日历')),
    )
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(fiber.state).toBe(PENDING)
    const service = root.plugin(provider)
    await service
    await fiber.await()
    expect(fiber.state).toBe(ACTIVE)
    await service.dispose()
    expect(fiber.state).toBe(PENDING)
  })

  it('a second plugin for the same declaration fails to start and the first one stays', async () => {
    const { root, service } = await settings()
    await root.plugin(independentSettingsPlugin('first', declaration('calendar', '第一份')))
    const second = root.plugin(
      independentSettingsPlugin('second', declaration('calendar', '第二份')),
    )
    await expect(second.await()).rejects.toThrow(/already contributed/)
    expect(second.state).toBe(FAILED)
    await second.dispose()
    expect(service.view.list()).toEqual([declaration('calendar', '第一份')])
  })

  it('gives readers a view that cannot contribute', async () => {
    const { service } = await settings()
    expect(Object.keys(service.view)).toEqual(['list'])
    expect(Object.isFrozen(service.view)).toBe(true)
  })
})
