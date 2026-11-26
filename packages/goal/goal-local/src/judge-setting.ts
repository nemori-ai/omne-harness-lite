import { JUDGE_MODELS, type JudgeModel } from '@omne-harness/goal-contract'
import {
  evaluateSettings,
  SettingDefinitionsSchema,
  type SettingDefinitions,
} from '@omne-harness/settings'

export const goalJudgeItems = { model: 'model' } as const

const LABELS: Readonly<Record<JudgeModel, string>> = {
  'openai/gpt-6-luna-decisions': '默认。发行的判定方案是在它上面调出来的。',
  'typesafe/jev-1.14': '每次判定便宜一半；评测里把没做到认成做到的次数约多一倍。',
  'typesafe/jev-1.13': '上一代。每次判定便宜一半；评测里把没做到认成做到的次数约多一倍。',
}

export const goalJudgeSettings: SettingDefinitions = SettingDefinitionsSchema.parse({
  providerId: 'goal',
  definitionId: 'judge',
  version: '1',
  groups: [
    {
      id: 'judge',
      parentId: null,
      title: '目标的判定',
      description: '一轮想收工时，系统拿会话里做过的事对照目标判一次。这里选判这一次用的决策型号。',
      order: 0,
    },
  ],
  items: [
    {
      id: goalJudgeItems.model,
      groupId: 'judge',
      category: 'preference',
      presentation: {
        title: '判定用的决策型号',
        description:
          '判定只答选择题与是非题，不写文字。三个型号都在评测台上量过，数在各自的说明里。',
        impact: '下一次判定起用新值；正在进行的那一次照它开始时的值。',
        clear: '回到默认的型号。',
        adoption: 'next-read',
        enumLabels: JUDGE_MODELS.map(value => ({
          value,
          title: value,
          description: LABELS[value],
        })),
      },
      valueSchema: { type: 'string', enum: JUDGE_MODELS },
      default: { kind: 'value', value: JUDGE_MODELS[0] },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})

type View = Readonly<{ definition: unknown; state: Readonly<{ sources: unknown }> }>

function onlyView(basis: unknown): View | null {
  const views = (basis as { views?: unknown } | null)?.views
  return Array.isArray(views) && views.length === 1 ? (views[0] as View) : null
}

/** The model a settings read gives. Null: the read does not carry a value of it. */
export function judgeModelOf(basis: unknown): JudgeModel | null {
  const view = onlyView(basis)
  if (view === null) return null
  const evaluated = evaluateSettings({ definition: view.definition, sources: view.state?.sources })
  if (evaluated.kind !== 'complete') return null
  const entry = evaluated.entries.find(item => item.itemId === goalJudgeItems.model)
  const value = entry?.value.kind === 'value' ? entry.value.value : undefined
  return JUDGE_MODELS.find(known => known === value) ?? null
}
