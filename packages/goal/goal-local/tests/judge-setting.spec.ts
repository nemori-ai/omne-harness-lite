import { describe, expect, it } from 'vitest'
import { DEFAULT_JUDGE_MODEL, JUDGE_MODELS } from '@omne-harness/goal-contract'
import { evaluateSettings } from '@omne-harness/settings'
import { goalJudgeItems, goalJudgeSettings, judgeModelOf } from '../src/index.ts'

const read = (values: readonly { itemId: string; value: unknown }[]) => ({
  views: [
    {
      definition: goalJudgeSettings,
      state: {
        sources: [
          {
            id: 'tenant',
            values: values.map(({ itemId, value }) => ({
              itemId,
              value: { kind: 'value', value },
              locked: false,
            })),
          },
        ],
      },
    },
  ],
})

describe('the setting for the model a goal is judged with', () => {
  it('declares one item whose values are the decision models, the default first, taking effect at the next read', () => {
    expect(goalJudgeSettings).toMatchObject({ providerId: 'goal', definitionId: 'judge' })
    const [item, ...rest] = goalJudgeSettings.items
    expect(rest).toEqual([])
    expect(JUDGE_MODELS[0]).toBe(DEFAULT_JUDGE_MODEL)
    expect(item).toMatchObject({
      id: goalJudgeItems.model,
      valueSchema: { type: 'string', enum: [...JUDGE_MODELS] },
      default: { kind: 'value', value: DEFAULT_JUDGE_MODEL },
      merge: 'override',
      sensitivity: 'ordinary',
      presentation: { adoption: 'next-read' },
    })
    expect(item?.presentation.enumLabels?.map(label => label.value)).toEqual([...JUDGE_MODELS])
    expect(evaluateSettings({ definition: goalJudgeSettings, sources: [] })).toMatchObject({
      kind: 'complete',
    })
  })

  it('reads the model a tenant set, the default when none is set, and nothing from a read it cannot use', () => {
    for (const value of JUDGE_MODELS)
      expect(judgeModelOf(read([{ itemId: goalJudgeItems.model, value }]))).toBe(value)
    expect(judgeModelOf(read([]))).toBe(DEFAULT_JUDGE_MODEL)
    expect(judgeModelOf(null)).toBeNull()
    expect(judgeModelOf({ views: [] })).toBeNull()
    expect(judgeModelOf({ views: [{ definition: goalJudgeSettings }] })).toBeNull()
    expect(
      judgeModelOf(read([{ itemId: goalJudgeItems.model, value: 'some/chat-model' }])),
    ).toBeNull()
  })
})
