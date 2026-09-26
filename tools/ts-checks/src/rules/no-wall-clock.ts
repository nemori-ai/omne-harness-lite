import { isTestPath, type Rule } from '../rule.ts'
import { scanCode } from '../source-text.ts'

/**
 * SC-OE-3（offer-expiry 节点）：消费者不得另用墙钟；领域时间只从 clock 服务取。
 * 豁免：`infra/`（clock 的实现是唯一取锚点；storage-sql 用墙钟算锁等待的截止，那不是领域时间）与测试。
 * `new Date(x)` 是转换不是取时，只禁无参的 `new Date()`。
 */
export const noWallClock: Rule = {
  id: 'no-wall-clock',
  source: 'data.offer-expiry v1 S-16/S-17 · offer-expiry 节点 SC-OE-3',
  description:
    'core/ 与 tenancy/ 源码里不得出现 Date.now()、new Date()、performance.now()；时间只从 clock 服务取',
  check(files) {
    return scanCode(
      this.id,
      files,
      path => !isTestPath(path) && !path.startsWith('infra/'),
      /\bDate\s*\.\s*now\s*\(\s*\)|\bnew\s+Date\s*\(\s*\)|\bperformance\s*\.\s*now\s*\(\s*\)/,
      () => '使用了墙钟；领域时间必须来自 clock 服务（Clock.now()）',
    )
  },
}
