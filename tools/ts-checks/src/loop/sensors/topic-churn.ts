import { statSync } from 'node:fs'
import { join } from 'node:path'
import { readProductTopics } from '../../product/scenarios.ts'
import { git } from '../../metrics/git.ts'
import { noData, data, type Reading } from '../reading.ts'

export interface TopicChurn {
  /** 相对于仓库根的 README 路径。 */
  readonly path: string
  readonly topic: string
  readonly revisions: number
}

/** 各 topic 的翻动次数，多的在前。`productRoot` 不存在或没有当前 topic 就没有数据；非法产品元数据明确失败。 */
export function readTopicChurn(
  root: string,
  productRoot: string,
  since: Date,
): Reading<readonly TopicChurn[]> {
  const dir = join(root, productRoot)
  if (statSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true)
    return noData(`目录 ${productRoot} 不存在或不是目录`)
  const topics = readProductTopics(dir)
  if (topics.length === 0) return noData(`${productRoot} 下没有当前 PD topic`)
  const churn = topics.map(topic => {
    const path = `${productRoot}/${topic.dir}/README.md`
    const log = git(root, [
      'log',
      `--since=${since.toISOString()}`,
      '-G^revision:',
      '--format=%H',
      'HEAD',
      '--',
      path,
    ])
    return {
      path,
      topic: topic.topic,
      revisions: log.split('\n').filter(line => line !== '').length,
    }
  })
  return data(churn.sort((a, b) => b.revisions - a.revisions || a.topic.localeCompare(b.topic)))
}
