import type { ProductTopic } from '@omne-harness/repo-toolchain/product/scenarios'
import type { Declaration } from './coverage.ts'

export interface ScenarioStatus {
  readonly id: string
  readonly coverageDeclarations: readonly string[]
  readonly execution: { readonly kind: 'unknown'; readonly reason: string }
  readonly acceptance: { readonly kind: 'unknown'; readonly reason: string }
}

export interface TopicStatus {
  readonly dir: string
  readonly coverage: 'numbered-scenarios' | 'uncovered'
  readonly scenarios: readonly ScenarioStatus[]
}

export function scenarioStatuses(coverage: {
  readonly topics: readonly ProductTopic[]
  readonly declarations: readonly Declaration[]
}): TopicStatus[] {
  return coverage.topics.map(topic => ({
    dir: topic.dir,
    coverage: topic.scenarios.size === 0 ? 'uncovered' : 'numbered-scenarios',
    scenarios: [...topic.scenarios.keys()].map(id => ({
      id,
      coverageDeclarations: coverage.declarations
        .filter(declaration =>
          declaration.covers.some(ref => ref.topic === topic.topic && ref.id === id),
        )
        .map(declaration => declaration.path),
      execution: { kind: 'unknown', reason: '没有有效执行证据输入' },
      acceptance: { kind: 'unknown', reason: '没有有效接受与权限证据输入' },
    })),
  }))
}

export function renderScenarioStatus(
  statuses: readonly TopicStatus[],
  notes: readonly string[],
): string[] {
  const out = [
    '场景事实（覆盖声明、执行、有效接受分别报告）',
    '覆盖声明不授予执行或有效接受。',
    ...notes.map(note => `  ${note}`),
  ]
  if (statuses.length === 0)
    out.push('uncovered：产品区没有当前 topic；执行 unknown；有效接受 unknown')
  for (const topic of statuses) {
    out.push(`${topic.dir}（${topic.scenarios.length} 条）`)
    if (topic.coverage === 'uncovered')
      out.push('  uncovered：缺编号场景；执行 unknown；有效接受 unknown')
    for (const scenario of topic.scenarios)
      out.push(
        `  ${scenario.id}：覆盖声明 ${scenario.coverageDeclarations.length === 0 ? '无' : scenario.coverageDeclarations.join('、')}；执行 unknown；有效接受 unknown`,
      )
  }
  out.push(
    `合计 ${statuses.length} 个 topic、${statuses.reduce((sum, topic) => sum + topic.scenarios.length, 0)} 条带编号场景`,
  )
  return out
}
