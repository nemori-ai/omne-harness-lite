// 场景状态：每条带编号的验收场景眼下处于哪一种——由 acceptance.md、stories.md 里的卡与各成员验收的覆盖声明推导，
// 不落盘、不是第二份权威。规矩正文在 `.meta_harness/design/product/conventions.md`「卡的一生」：
// 一条场景交付了没有不在任何地方手写，有验收覆盖它就算（主线检查绿不绿这里看不到，只看声明）。
import { TOPIC_DIR, type ProductTopic } from '../product/scenarios.ts'
import { linkedScenario, type TopicStories } from '../product/stories.ts'
import type { Declaration } from './coverage.ts'

export const SCENARIO_STATES = ['delivered', 'delivering', 'carded', 'uncut'] as const
export type ScenarioState = (typeof SCENARIO_STATES)[number]

export const STATE_WORDS: Readonly<Record<ScenarioState, string>> = {
  delivered: '已交付',
  delivering: '交付中',
  carded: '已立卡',
  uncut: '还没切到',
}

export interface ScenarioStatus {
  readonly id: string
  readonly state: ScenarioState
  /** 覆盖它的卡（还在 stories.md 里的）。 */
  readonly cards: readonly string[]
  /** 声明覆盖它的验收文件。 */
  readonly acceptance: readonly string[]
}

export interface TopicStatus {
  readonly dir: string
  readonly scenarios: readonly ScenarioStatus[]
}

function stateOf(carded: boolean, accepted: boolean): ScenarioState {
  if (accepted) return carded ? 'delivering' : 'delivered'
  return carded ? 'carded' : 'uncut'
}

const keyOf = (topic: string, id: string) => `${topic} ${id}`

/** 纯函数：按 topic 列出每条带编号场景的状态；没有带编号场景的 topic 不列。 */
export function scenarioStatuses(
  topics: readonly ProductTopic[],
  stories: readonly TopicStories[],
  declarations: readonly Declaration[],
): TopicStatus[] {
  const cards = new Map<string, string[]>()
  for (const { topic, cards: listed } of stories)
    for (const card of listed)
      for (const link of card.covers) {
        const scenario = linkedScenario(topic, link)
        const code = scenario === undefined ? undefined : TOPIC_DIR.exec(scenario.topic)?.[1]
        if (scenario === undefined || code === undefined) continue
        const key = keyOf(`PF-${code}`, scenario.id)
        const seen = cards.get(key) ?? []
        if (!seen.includes(card.id)) cards.set(key, [...seen, card.id])
      }
  const accepted = new Map<string, string[]>()
  for (const declaration of declarations)
    for (const scenario of declaration.covers) {
      const key = keyOf(scenario.topic, scenario.id)
      accepted.set(key, [...(accepted.get(key) ?? []), declaration.path])
    }
  return topics
    .filter(topic => topic.scenarios.size > 0)
    .map(topic => ({
      dir: topic.dir,
      scenarios: [...topic.scenarios.keys()].map(id => {
        const key = keyOf(topic.topic, id)
        const byCard = cards.get(key) ?? []
        const byAcceptance = accepted.get(key) ?? []
        return {
          id,
          state: stateOf(byCard.length > 0, byAcceptance.length > 0),
          cards: byCard,
          acceptance: byAcceptance,
        }
      }),
    }))
}

function describeScenario(scenario: ScenarioStatus): string {
  const where = [
    ...(scenario.cards.length === 0 ? [] : [`卡 ${scenario.cards.join('、')}`]),
    ...(scenario.acceptance.length === 0 ? [] : [`验收 ${scenario.acceptance.join('、')}`]),
  ]
  return where.length === 0 ? scenario.id : `${scenario.id}（${where.join('；')}）`
}

export function renderScenarioStatus(
  statuses: readonly TopicStatus[],
  notes: readonly string[],
): string[] {
  const totals = Object.fromEntries(SCENARIO_STATES.map(state => [state, 0])) as Record<
    ScenarioState,
    number
  >
  const out = [
    '场景状态（由 acceptance.md 的带编号场景、stories.md 里的卡与各成员验收的覆盖声明推导；只读，不落盘）',
    '  已交付：有验收覆盖、没有卡；交付中：有卡也有验收；已立卡：有卡、没有验收；还没切到：都没有。',
    '  「已交付」只看覆盖声明，主线的检查绿不绿这里看不到。',
    ...notes.map(note => `  ${note}`),
  ]
  for (const topic of statuses) {
    out.push(`${topic.dir}（${topic.scenarios.length} 条）`)
    for (const state of SCENARIO_STATES) {
      const here = topic.scenarios.filter(scenario => scenario.state === state)
      totals[state] += here.length
      if (here.length > 0)
        out.push(`  ${STATE_WORDS[state]} ${here.length}：${here.map(describeScenario).join('、')}`)
    }
  }
  const count = statuses.reduce((sum, topic) => sum + topic.scenarios.length, 0)
  out.push(
    `合计 ${statuses.length} 个 topic、${count} 条带编号场景：` +
      SCENARIO_STATES.map(state => `${STATE_WORDS[state]} ${totals[state]}`).join('、'),
  )
  return out
}
