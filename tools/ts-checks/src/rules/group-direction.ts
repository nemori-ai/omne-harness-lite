import { evaluateDirection, memberGraph, type GroupDirectionPolicy } from '../metrics/graph.ts'
import type { Rule, Violation } from '../rule.ts'

const LAYOUT = '.meta_harness/design/realization/README.md「packages 的两层布局」'

/**
 * 组的依赖方向。层位与判据的权威是 realization 的布局正文，这里只是它的机检投影：
 * 改层位先改那里，再改这张表。新增一个 `packages/<组>` 而不登记，规则会报出。
 */
export const GROUP_DIRECTION_POLICY: GroupDirectionPolicy = {
  layers: [
    {
      // core 没有自己的领域事实、被多个领域消费；util 是无领域事实的格式化技术件。
      groups: ['packages/core', 'packages/util'],
      source: `${LAYOUT} core 行与 util 段`,
    },
    {
      // 各领域与基础设施提供者同层：领域之间只查环，infra 另受下面的装配独占约束。
      groups: [
        'packages/infra',
        'packages/tenancy',
        'packages/session',
        'packages/assets',
        'packages/tools',
        'packages/model',
        'packages/agent-loop',
        'packages/frontend',
      ],
      source: `${LAYOUT} <domain> 行与 infra 行`,
    },
    {
      groups: ['apps', 'examples'],
      source: 'docs/workspace.md「装配负责选择提供者」；examples 以包公开面演示闭环',
    },
  ],
  assemblyOnly: [{ group: 'packages/infra', source: `${LAYOUT} infra 行「被装配层选用」` }],
  exceptions: [],
}

export function createGroupDirection(policy: GroupDirectionPolicy): Rule {
  return {
    id: 'group-direction',
    source: `${LAYOUT}；docs/workspace.md「装配负责选择提供者」`,
    description: '产品源码的跨组依赖只能指向同层或更内层，infra 只由装配层选用，成员与组之间不成环',
    check(files) {
      const out: Violation[] = []
      for (const finding of evaluateDirection(memberGraph(files), policy)) {
        if (finding.sites.length === 0) {
          out.push({ rule: this.id, path: 'packages', line: 1, message: finding.message })
          continue
        }
        for (const site of finding.sites)
          out.push({ rule: this.id, path: site.path, line: site.line, message: finding.message })
      }
      return out
    },
  }
}

/** 路径相对于仓库根，登记在仓库路径规则里。 */
export const groupDirection: Rule = createGroupDirection(GROUP_DIRECTION_POLICY)
