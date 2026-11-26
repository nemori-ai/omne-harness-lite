import { DEFAULT_JUDGE_CONFIG } from '@omne-harness/goal-contract'
import { goalJudgeItems, goalJudgeSettings } from '@omne-harness/goal-local'
import { describe, expect, it } from 'vitest'
import type { TenantIndependentSettingsService } from '../../../src/rows/governance/independent-settings-service.ts'
import { releaseJudging } from '../../../src/rows/goal/judging.ts'

const viewOf = (model: unknown) => ({
  views: [
    {
      definition: goalJudgeSettings,
      state: {
        sources: [
          {
            id: 'tenant',
            values:
              model === undefined
                ? []
                : [
                    {
                      itemId: goalJudgeItems.model,
                      value: { kind: 'value', value: model },
                      locked: false,
                    },
                  ],
          },
        ],
      },
    },
  ],
})

function settings(read: () => unknown) {
  const asked: unknown[] = []
  const service = {
    bindingOf(tenant: string, definition: unknown) {
      asked.push({ tenant, definition })
      return { request: { tenant } }
    },
    read: async () => read(),
  } as unknown as TenantIndependentSettingsService
  return { service, asked }
}

describe('how a judging of this release is asked', () => {
  it('uses the configuration the release was measured with, under the model the tenant set, read at each judging', async () => {
    let model: unknown
    const { service, asked } = settings(() => viewOf(model))
    const judging = releaseJudging(() => service)
    expect(await judging.config('tenant-1', 's')).toEqual({
      kind: 'read',
      value: DEFAULT_JUDGE_CONFIG,
    })
    model = 'typesafe/jev-1.14'
    expect(await judging.config('tenant-1', 's')).toEqual({
      kind: 'read',
      value: { ...DEFAULT_JUDGE_CONFIG, model: 'typesafe/jev-1.14' },
    })
    expect(asked).toEqual(Array(2).fill({ tenant: 'tenant-1', definition: goalJudgeSettings }))
  })

  it('has no basis, never the default, when the setting cannot be read or the settings are away', async () => {
    const UNAVAILABLE = { kind: 'unavailable' }
    expect(await releaseJudging(() => undefined).config('t', 's')).toEqual(UNAVAILABLE)
    const unreadable = settings(() => ({ views: [] }))
    expect(await releaseJudging(() => unreadable.service).config('t', 's')).toEqual(UNAVAILABLE)
    const strange = settings(() => viewOf('some/chat-model'))
    expect(await releaseJudging(() => strange.service).config('t', 's')).toEqual(UNAVAILABLE)
    const broken = settings(() => {
      throw new Error('down')
    })
    expect(await releaseJudging(() => broken.service).config('t', 's')).toEqual(UNAVAILABLE)
  })
})
