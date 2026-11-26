import { DEFAULT_JUDGE_CONFIG } from '@omne-harness/goal-contract'
import { goalJudgeItems, goalJudgeSettings } from '@omne-harness/goal-local'
import { describe, expect, it } from 'vitest'
import type { TenantIndependentSettingsService } from '../../../src/rows/governance/independent-settings-service.ts'
import { examinationSettingsFor, releaseJudging } from '../../../src/rows/goal/judging.ts'

const viewOf = (
  model: unknown,
  locked = false,
  more: readonly { itemId: string; value: unknown }[] = [],
) => ({
  views: [
    {
      definition: goalJudgeSettings,
      state: {
        sources: [
          {
            id: 'tenant',
            values: [
              ...(model === undefined
                ? []
                : [
                    {
                      itemId: goalJudgeItems.model,
                      value: { kind: 'value', value: model },
                      locked,
                    },
                  ]),
              ...more.map(({ itemId, value }) => ({
                itemId,
                value: { kind: 'value', value },
                locked: false,
              })),
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
    expect(await judging.config('tenant-1', 's', null)).toEqual({
      kind: 'read',
      value: DEFAULT_JUDGE_CONFIG,
    })
    model = 'typesafe/jev-1.14'
    expect(await judging.config('tenant-1', 's', null)).toEqual({
      kind: 'read',
      value: { ...DEFAULT_JUDGE_CONFIG, model: 'typesafe/jev-1.14' },
    })
    expect(asked).toEqual(Array(2).fill({ tenant: 'tenant-1', definition: goalJudgeSettings }))
  })

  it('has no basis, never the default, when the setting cannot be read or the settings are away', async () => {
    const UNAVAILABLE = { kind: 'unavailable' }
    expect(await releaseJudging(() => undefined).config('t', 's', null)).toEqual(UNAVAILABLE)
    const unreadable = settings(() => ({ views: [] }))
    expect(await releaseJudging(() => unreadable.service).config('t', 's', null)).toEqual(
      UNAVAILABLE,
    )
    const strange = settings(() => viewOf('some/chat-model'))
    expect(await releaseJudging(() => strange.service).config('t', 's', null)).toEqual(UNAVAILABLE)
    const broken = settings(() => {
      throw new Error('down')
    })
    expect(await releaseJudging(() => broken.service).config('t', 's', null)).toEqual(UNAVAILABLE)
  })

  it('judges with the model the session chose for itself, unless the tenant locked its own', async () => {
    const free = settings(() => viewOf('typesafe/jev-1.14'))
    const chosen = 'typesafe/jev-1.13'
    expect(await releaseJudging(() => free.service).config('t', 's', chosen)).toEqual({
      kind: 'read',
      value: { ...DEFAULT_JUDGE_CONFIG, model: chosen },
    })
    const locked = settings(() => viewOf('typesafe/jev-1.14', true))
    expect(await releaseJudging(() => locked.service).config('t', 's', chosen)).toEqual({
      kind: 'read',
      value: { ...DEFAULT_JUDGE_CONFIG, model: 'typesafe/jev-1.14' },
    })
    const unreadable = settings(() => ({ views: [] }))
    expect(await releaseJudging(() => unreadable.service).config('t', 's', chosen)).toEqual({
      kind: 'unavailable',
    })
  })

  it('gives what the tenant set of examinations, read at each use: how many a goal may use and what the goal of a job may wait for', async () => {
    let more: { itemId: string; value: unknown }[] = []
    const { service } = settings(() => viewOf(undefined, false, more))
    const judging = releaseJudging(() => service)
    expect(await judging.examination('tenant-1')).toEqual({
      kind: 'read',
      value: { maxExaminations: 3, job: 'rerun' },
    })
    more = [
      { itemId: goalJudgeItems.maxExaminations, value: '5' },
      { itemId: goalJudgeItems.jobAwaited, value: 'all' },
    ]
    expect(await judging.examination('tenant-1')).toEqual({
      kind: 'read',
      value: { maxExaminations: 5, job: 'all' },
    })
    expect(await examinationSettingsFor(() => service, 'tenant-1')).toMatchObject({
      examiner: { definition: 'examiner', model: 'openai/gpt-6.1-sol' },
      minutes: 10,
    })
    more = [{ itemId: goalJudgeItems.maxExaminations, value: '4' }]
    expect(await judging.examination('tenant-1')).toEqual({ kind: 'unavailable' })
    expect(await releaseJudging(() => undefined).examination('t')).toEqual({ kind: 'unavailable' })
  })
})
