// 用量事实的分页读：按租户、开始时刻的区间与消费者范围；没有开始时刻的另数。
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { parseUsageInput, type UsageReadInput, type UsageReadOutput } from './facts.ts'
import { PROTOCOL, USAGE_READ_HANDLER } from './schema.ts'
import { rowsOf, text } from './support.ts'

function scopeOf(input: UsageReadInput): { where: string[]; params: string[] } {
  const where = ['tenant = ?']
  const params = [input.tenant]
  if (input.owner === null) return { where, params }
  const work = '(consumer_work = ? OR (consumer_work >= ? AND consumer_work < ?))'
  where.push('consumer_owner = ?', `(${input.works.map(() => work).join(' OR ')})`)
  params.push(input.owner)
  for (const item of input.works) params.push(item, `${item}/`, `${item}0`)
  return { where, params }
}

const handler: ReadHandlerModule = {
  handler: USAGE_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const parsed = parseUsageInput(input)
    if (parsed === null || (parsed.owner !== null && parsed.works.length === 0))
      return { kind: 'failed', diagnostic: 'not a usage page request' }
    const { where, params } = scopeOf(parsed)
    const undated = rowsOf(
      port,
      `SELECT COUNT(*) AS undated FROM tl_usage WHERE ${where.join(' AND ')} AND started_at IS NULL LIMIT 1`,
      params,
    )[0]?.['undated']
    const clauses = [...where, 'started_at IS NOT NULL']
    const dated: (string | bigint)[] = [...params]
    if (parsed.from !== null && parsed.to !== null) {
      clauses.push('started_at >= ?', 'started_at <= ?')
      dated.push(parsed.from, parsed.to)
    }
    const ascending = parsed.order === 'ascending'
    if (parsed.afterStart !== null && parsed.afterCall !== null) {
      clauses.push(`(started_at, call) ${ascending ? '>' : '<'} (?, ?)`)
      dated.push(parsed.afterStart, parsed.afterCall)
    }
    const direction = ascending ? 'ASC' : 'DESC'
    const rows = rowsOf(
      port,
      `SELECT fact FROM tl_usage WHERE ${clauses.join(' AND ')}
        ORDER BY started_at ${direction}, call ${direction} LIMIT ?`,
      [...dated, BigInt(parsed.limit + 1)],
    )
    const output: UsageReadOutput = {
      undated: Number(undated ?? 0),
      facts: rows.map(row => text(row['fact'])),
    }
    return { kind: 'read', output }
  },
}
export default handler
