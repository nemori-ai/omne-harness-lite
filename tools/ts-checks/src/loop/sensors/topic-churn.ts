// 主题 rev 翻动：产品设计的每个 PF-* topic，最近若干天里 HEAD 历史上改动过 `revision:` 那一行的提交数。
// 一个 topic 短时间里反复升 rev，说明它还没定下来，下游的规格与实现跟着返工。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { git } from '../../metrics/git.ts'
import { noData, data, type Reading } from '../reading.ts'

export interface TopicChurn {
  /** 相对于仓库根的 README 路径。 */
  readonly path: string
  readonly topic: string
  readonly revisions: number
}

/** 各 topic 的翻动次数，多的在前。`productRoot` 不存在或里面没有 PF-* topic 就没有数据。 */
export function readTopicChurn(
  root: string,
  productRoot: string,
  since: Date,
): Reading<readonly TopicChurn[]> {
  const dir = join(root, productRoot)
  if (statSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true)
    return noData(`目录 ${productRoot} 不存在`)
  const topics = readdirSync(dir)
    .filter(name => name.startsWith('PF-'))
    .filter(name => statSync(join(dir, name, 'README.md'), { throwIfNoEntry: false })?.isFile())
    .sort()
  if (topics.length === 0) return noData(`${productRoot} 下没有 PF-* topic`)
  const churn = topics.map(topic => {
    const path = `${productRoot}/${topic}/README.md`
    const log = git(root, [
      'log',
      `--since=${since.toISOString()}`,
      '-G^revision:',
      '--format=%H',
      'HEAD',
      '--',
      path,
    ])
    return { path, topic, revisions: log.split('\n').filter(line => line !== '').length }
  })
  return data(churn.sort((a, b) => b.revisions - a.revisions || a.topic.localeCompare(b.topic)))
}
