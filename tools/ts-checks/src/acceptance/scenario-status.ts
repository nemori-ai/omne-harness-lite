import type { ProductTopic } from '../product/scenarios.ts'
import type { CurrentSources, SourceCard } from '../product/sources.ts'
import type { Declaration } from './coverage.ts'

export interface ScenarioStatus {
  readonly id: string
  readonly coverageDeclarations: readonly string[]
  readonly execution: { readonly kind: 'unknown'; readonly reason: string }
  readonly acceptance: { readonly kind: 'unknown'; readonly reason: string }
  readonly activity: {
    readonly cards: readonly SourceCard[]
    readonly unassociated: readonly SourceCard[]
    readonly completeness: CurrentSources['completeness']
    readonly dailyEnabled: boolean
  }
}

export interface TopicStatus {
  readonly dir: string
  readonly scenarios: readonly ScenarioStatus[]
}

export function scenarioStatuses(
  topics: readonly ProductTopic[],
  sources: CurrentSources,
  declarations: readonly Declaration[],
): TopicStatus[] {
  const unassociated = sources.cards.filter(
    card => card.kind === 'issue' && card.read.kind === 'unknown',
  )
  return topics
    .filter(topic => topic.scenarios.size > 0)
    .map(topic => ({
      dir: topic.dir,
      scenarios: [...topic.scenarios.keys()].map(id => ({
        id,
        coverageDeclarations: declarations
          .filter(declaration =>
            declaration.covers.some(ref => ref.topic === topic.topic && ref.id === id),
          )
          .map(declaration => declaration.path),
        execution: { kind: 'unknown', reason: '没有有效执行证据输入' },
        acceptance: { kind: 'unknown', reason: '没有有效接受与权限证据输入' },
        activity: {
          cards: sources.cards.filter(card => {
            const refs =
              card.kind === 'legacy'
                ? card.scenarios
                : card.read.kind === 'known'
                  ? card.read.scenarios
                  : []
            return refs.some(ref => ref.topic === topic.topic && ref.id === id)
          }),
          unassociated,
          completeness:
            unassociated.length > 0 && sources.completeness === 'complete'
              ? 'partial'
              : sources.completeness,
          dailyEnabled: sources.dailyEnabled,
        },
      })),
    }))
}

function describeCard(card: SourceCard): string {
  if (card.kind === 'legacy') return `${card.id}（旧卡）`
  return card.read.kind === 'unknown'
    ? `${card.identity.url}（平台活动 unknown：${card.read.reason}）`
    : `${card.identity.url}（平台 ${card.read.state}，Stage ${card.read.stage ?? '未读到'}）`
}

export function renderScenarioStatus(
  statuses: readonly TopicStatus[],
  notes: readonly string[],
): string[] {
  const out = [
    '场景事实（覆盖声明、执行、有效接受、当前平台活动分别报告）',
    '覆盖声明与平台 closed／Stage 不授予执行或有效接受。',
    ...notes.map(note => `  ${note}`),
  ]
  for (const topic of statuses) {
    out.push(`${topic.dir}（${topic.scenarios.length} 条）`)
    for (const scenario of topic.scenarios) {
      out.push(
        `  ${scenario.id}：覆盖声明 ${scenario.coverageDeclarations.length === 0 ? '无' : scenario.coverageDeclarations.join('、')}；执行 unknown；有效接受 unknown`,
      )
      out.push(
        `    当前活动（${scenario.activity.completeness}，日常${scenario.activity.dailyEnabled ? '启用' : '禁用'}）：${scenario.activity.cards.length === 0 ? '未观察到关联卡' : scenario.activity.cards.map(describeCard).join('、')}`,
      )
      if (scenario.activity.unassociated.length > 0)
        out.push(`    关联未读全：${scenario.activity.unassociated.map(describeCard).join('、')}`)
    }
  }
  out.push(
    `合计 ${statuses.length} 个 topic、${statuses.reduce((sum, topic) => sum + topic.scenarios.length, 0)} 条带编号场景`,
  )
  return out
}
