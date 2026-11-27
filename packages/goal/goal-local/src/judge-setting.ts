import {
  DEFAULT_BUDGET_EXAMINATIONS,
  JOB_AWAITED,
  JUDGE_MODELS,
  type JobAwaited,
  type JudgeModel,
} from '@omne-harness/goal-contract'
import {
  evaluateSettings,
  SettingDefinitionsSchema,
  type SettingDefinitions,
} from '@omne-harness/settings'

export const goalJudgeItems = {
  model: 'model',
  examiner: 'examiner',
  maxExaminations: 'max-examinations',
  examinationMinutes: 'examination-minutes',
  jobAwaited: 'job-awaited',
} as const

const LABELS: Readonly<Record<JudgeModel, string>> = {
  'openai/gpt-6-luna-decisions': '默认。发行的判定方案是在它上面调出来的。',
  'typesafe/jev-1.14': '每次判定便宜一半；评测里把没做到认成做到的次数约多一倍。',
  'typesafe/jev-1.13': '上一代。每次判定便宜一半；评测里把没做到认成做到的次数约多一倍。',
}

/** The pairs of Agent definition and model an examination may run as: only pairs that were measured are here. */
export const EXAMINERS = Object.freeze([
  {
    value: 'examiner@anthropic/claude-haiku-5.5',
    definition: 'examiner',
    model: 'anthropic/claude-haiku-5.5',
    description:
      '默认。发行带的查验用定义，只有读写文件、跑命令与交读数三个工具。评测台上量过一遍（8 份小成品，40 条没做到的判据、184 条做到的）：没做到的没有一条被认成成立，做到的没有一条不敢认；一批约 0.004 美元、半分钟以内。只量了一遍，条数少，分不出零与百分之几。',
  },
  {
    value: 'examiner@openai/gpt-6.1-sol',
    definition: 'examiner',
    model: 'openai/gpt-6.1-sol',
    description:
      '同一份定义配贵一档的型号。量过四遍，每遍同样一条没错；一批约 0.02 美元、半分钟，是默认那款的六倍。活大的更贵：量到过一批 0.11 美元、两分半钟。',
  },
] as const)
export type Examiner = Readonly<{ definition: string; model: string }>

const COUNTS = ['1', '2', '3', '5'] as const
/** What each option was measured as, in the words of the item itself: the page shows the description of an item, not of its options. */
const told = (options: readonly (readonly [string, string])[]): string =>
  options.map(([value, description]) => ` ${value}：${description}`).join('')
const MINUTES = ['5', '10', '20', '30'] as const
const DEFAULT_MINUTES = '10'
const JOB_LABELS: Readonly<Record<JobAwaited, string>> = {
  none: '都不许。作业的目标只能用当场读得了的判据。',
  rerun: '默认。只许复跑：系统在副本里再跑一遍命令，不花模型的钱。',
  all: '复跑与查验都许。查验要花模型的钱，没有人看着的作业也会花。',
}
const labelled = (values: readonly string[], describe: (value: string) => string) =>
  values.map(value => ({ value, title: value, description: describe(value) }))

export const goalJudgeSettings: SettingDefinitions = SettingDefinitionsSchema.parse({
  providerId: 'goal',
  definitionId: 'judge',
  version: '2',
  groups: [
    {
      id: 'judge',
      parentId: null,
      title: '目标的判定',
      description: '一轮想收工时，系统拿会话里做过的事对照目标判一次。这里选判这一次用的决策型号。',
      order: 0,
    },
    {
      id: 'examination',
      parentId: null,
      title: '目标的查验',
      description:
        '写成「查验」的判据由另一个会话里的 agent 照查法动手去验，写成「复跑」的由系统自己再跑一遍命令。这里定查验用什么、最多用多少。',
      order: 1,
    },
  ],
  items: [
    {
      id: goalJudgeItems.model,
      groupId: 'judge',
      category: 'preference',
      presentation: {
        title: '判定用的决策型号',
        description: `判定只答选择题与是非题，不写文字。三个型号都在评测台上量过。一个会话可以在目标面板上另选，只管它自己。${told(JUDGE_MODELS.map(value => [value, LABELS[value]]))}`,
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
    {
      id: goalJudgeItems.examiner,
      groupId: 'examination',
      category: 'preference',
      presentation: {
        title: '查验用的定义与型号',
        description: `查验的 agent 用哪份 Agent 定义、哪个型号。只列量过的组合。${told(EXAMINERS.map(({ value, description }) => [value, description]))}`,
        impact: '下一批查验起用新值；已经交出去的那一批照它交出时的值。',
        clear: '回到默认的组合。',
        adoption: 'next-read',
        enumLabels: EXAMINERS.map(({ value, description }) => ({
          value,
          title: value,
          description,
        })),
      },
      valueSchema: { type: 'string', enum: EXAMINERS.map(entry => entry.value) },
      default: { kind: 'value', value: EXAMINERS[0].value },
      merge: 'override',
      sensitivity: 'ordinary',
    },
    {
      id: goalJudgeItems.maxExaminations,
      groupId: 'examination',
      category: 'preference',
      presentation: {
        title: '一个目标至多几次查验',
        description:
          '目标的预算里「查验的次数」不能写得比它多；没写时取它与 3 的小者。次数用完，目标照预算那条退出收场。一次查验小的约 0.02 美元，量到过的大的 0.11 美元。',
        impact: '之后设或修订的目标照新值校验；已经成立的目标不变。',
        clear: '回到 3 次。',
        adoption: 'next-read',
        enumLabels: labelled(COUNTS, value => `至多 ${value} 次。`),
      },
      valueSchema: { type: 'string', enum: COUNTS },
      default: { kind: 'value', value: String(DEFAULT_BUDGET_EXAMINATIONS) },
      merge: 'override',
      sensitivity: 'ordinary',
    },
    {
      id: goalJudgeItems.examinationMinutes,
      groupId: 'examination',
      category: 'preference',
      presentation: {
        title: '一次查验至多多久',
        description: '到时还没交读数，这一批记成判不了，查验的那一轮被停下。',
        impact: '下一次看查验的那一轮时起用新值。',
        clear: '回到 10 分钟。',
        adoption: 'next-read',
        enumLabels: labelled(MINUTES, value => `${value} 分钟。`),
      },
      valueSchema: { type: 'string', enum: MINUTES },
      default: { kind: 'value', value: DEFAULT_MINUTES },
      merge: 'override',
      sensitivity: 'ordinary',
    },
    {
      id: goalJudgeItems.jobAwaited,
      groupId: 'examination',
      category: 'preference',
      presentation: {
        title: '作业的目标可以等哪些判法',
        description: '日程到点起的作业没有人看着。这里定它的目标里能不能写复跑与查验的判据。',
        impact: '之后建的安排照新值校验：写了不许的判据，建安排时就被拒绝，并写明是哪一条。',
        clear: '回到只许复跑。',
        adoption: 'next-read',
        enumLabels: JOB_AWAITED.map(value => ({
          value,
          title: value,
          description: JOB_LABELS[value],
        })),
      },
      valueSchema: { type: 'string', enum: JOB_AWAITED },
      default: { kind: 'value', value: 'rerun' },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})

type View = Readonly<{ definition: unknown; state: Readonly<{ sources: unknown }> }>
type Read = Readonly<{ value: unknown; locked: boolean }>

function onlyView(basis: unknown): View | null {
  const views = (basis as { views?: unknown } | null)?.views
  return Array.isArray(views) && views.length === 1 ? (views[0] as View) : null
}

/** The values a settings read carries, by item. Null: the read cannot be used. */
function valuesOf(basis: unknown): ReadonlyMap<string, Read> | null {
  const view = onlyView(basis)
  if (view === null) return null
  const evaluated = evaluateSettings({ definition: view.definition, sources: view.state?.sources })
  if (evaluated.kind !== 'complete') return null
  return new Map(
    evaluated.entries.map(entry => [
      entry.itemId,
      {
        value: entry.value.kind === 'value' ? entry.value.value : undefined,
        locked: entry.lockedBy !== null,
      },
    ]),
  )
}

export type JudgeSetting = Readonly<{ model: JudgeModel; locked: boolean }>
/** The decision model the tenant set, and whether it is locked against a session's own choice. Null: the read does not carry a value of it. */
export function judgeSettingOf(basis: unknown): JudgeSetting | null {
  const read = valuesOf(basis)?.get(goalJudgeItems.model)
  const model = JUDGE_MODELS.find(known => known === read?.value)
  return read === undefined || model === undefined ? null : { model, locked: read.locked }
}

/** The model a settings read gives. Null: the read does not carry a value of it. */
export const judgeModelOf = (basis: unknown): JudgeModel | null =>
  judgeSettingOf(basis)?.model ?? null

export type ExaminationSettings = Readonly<{
  examiner: Examiner
  maxExaminations: number
  minutes: number
  job: JobAwaited
}>
/** What the tenant set of examinations. Null: the read does not carry one of the four values. */
export function examinationSettingsOf(basis: unknown): ExaminationSettings | null {
  const read = valuesOf(basis)
  const of = (item: string) => read?.get(item)?.value
  const examiner = EXAMINERS.find(known => known.value === of(goalJudgeItems.examiner))
  const count = COUNTS.find(known => known === of(goalJudgeItems.maxExaminations))
  const minutes = MINUTES.find(known => known === of(goalJudgeItems.examinationMinutes))
  const job = JOB_AWAITED.find(known => known === of(goalJudgeItems.jobAwaited))
  if (examiner === undefined || count === undefined || minutes === undefined || job === undefined)
    return null
  const { definition, model } = examiner
  return {
    examiner: { definition, model },
    maxExaminations: Number(count),
    minutes: Number(minutes),
    job,
  }
}
