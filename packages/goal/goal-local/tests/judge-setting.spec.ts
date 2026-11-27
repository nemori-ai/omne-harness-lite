import { describe, expect, it } from 'vitest'
import { DEFAULT_JUDGE_MODEL, JUDGE_MODELS } from '@omne-harness/goal-contract'
import { evaluateSettings } from '@omne-harness/settings'
import {
  examinationSettingsOf,
  EXAMINERS,
  goalJudgeItems,
  goalJudgeSettings,
  judgeModelOf,
  judgeSettingOf,
} from '../src/index.ts'

const read = (values: readonly { itemId: string; value: unknown; locked?: boolean }[]) => ({
  views: [
    {
      definition: goalJudgeSettings,
      state: {
        sources: [
          {
            id: 'tenant',
            values: values.map(({ itemId, value, locked }) => ({
              itemId,
              value: { kind: 'value', value },
              locked: locked ?? false,
            })),
          },
        ],
      },
    },
  ],
})

describe('the setting for the model a goal is judged with', () => {
  it('declares the item whose values are the decision models, the default first, taking effect at the next read', () => {
    expect(goalJudgeSettings).toMatchObject({ providerId: 'goal', definitionId: 'judge' })
    const [item] = goalJudgeSettings.items
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

  it('tells whether the tenant locked its model against a session choosing another', () => {
    const model = JUDGE_MODELS[1]
    const free = read([{ itemId: goalJudgeItems.model, value: model }])
    expect(judgeSettingOf(free)).toEqual({ model, locked: false })
    const locked = read([{ itemId: goalJudgeItems.model, value: model, locked: true }])
    expect(judgeSettingOf(locked)).toEqual({ model, locked: true })
    expect(judgeSettingOf(read([]))).toEqual({ model: DEFAULT_JUDGE_MODEL, locked: false })
    expect(judgeSettingOf(null)).toBeNull()
  })
})

describe('the settings of examinations', () => {
  const items = goalJudgeSettings.items.filter(item => item.groupId === 'examination')

  it('are four closed choices in a group of their own, each taking effect at the next read and each option saying what it means', () => {
    expect(goalJudgeSettings.groups.map(group => group.id)).toEqual(['judge', 'examination'])
    expect(items.map(item => [item.id, item.valueSchema, item.default])).toEqual([
      [
        goalJudgeItems.examiner,
        { type: 'string', enum: ['examiner@openai/gpt-6.1-sol'] },
        { kind: 'value', value: 'examiner@openai/gpt-6.1-sol' },
      ],
      [
        goalJudgeItems.maxExaminations,
        { type: 'string', enum: ['1', '2', '3', '5'] },
        { kind: 'value', value: '3' },
      ],
      [
        goalJudgeItems.examinationMinutes,
        { type: 'string', enum: ['5', '10', '20', '30'] },
        { kind: 'value', value: '10' },
      ],
      [
        goalJudgeItems.jobAwaited,
        { type: 'string', enum: ['none', 'rerun', 'all'] },
        { kind: 'value', value: 'rerun' },
      ],
    ])
    for (const item of items) {
      expect(item).toMatchObject({ merge: 'override', presentation: { adoption: 'next-read' } })
      const labels = item.presentation.enumLabels ?? []
      expect(labels.map(label => label.value)).toEqual(item.valueSchema['enum'])
      for (const label of labels) expect(label.description).not.toBe('')
    }
    expect(EXAMINERS.map(({ definition, model }) => [definition, model])).toEqual([
      ['examiner', 'openai/gpt-6.1-sol'],
    ])
  })

  it('read as the defaults when the tenant set none: the examiner of the release, three examinations, ten minutes, a job may run a command again', () => {
    expect(examinationSettingsOf(read([]))).toEqual({
      examiner: { definition: 'examiner', model: 'openai/gpt-6.1-sol' },
      maxExaminations: 3,
      minutes: 10,
      job: 'rerun',
    })
  })

  it('read what the tenant set, as numbers where they count, and nothing from a read that cannot be used or carries a value outside the choices', () => {
    const set = read([
      { itemId: goalJudgeItems.maxExaminations, value: '5' },
      { itemId: goalJudgeItems.examinationMinutes, value: '30' },
      { itemId: goalJudgeItems.jobAwaited, value: 'all' },
    ])
    expect(examinationSettingsOf(set)).toMatchObject({
      maxExaminations: 5,
      minutes: 30,
      job: 'all',
    })
    expect(examinationSettingsOf(null)).toBeNull()
    expect(examinationSettingsOf({ views: [] })).toBeNull()
    for (const [itemId, value] of [
      [goalJudgeItems.examiner, 'coding@some/model'],
      [goalJudgeItems.maxExaminations, '4'],
      [goalJudgeItems.examinationMinutes, '60'],
      [goalJudgeItems.jobAwaited, 'examination'],
    ] as const)
      expect(examinationSettingsOf(read([{ itemId, value }]))).toBeNull()
  })
})
