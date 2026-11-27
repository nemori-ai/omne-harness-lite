import type { EndpointHolding } from '@omne-harness/mcp-contract'
import type { HoldingRows, KeptHolding } from '@omne-harness/mcp-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import { committer, reader, tenantText, type McpSqlOptions } from './store.ts'

/** The rows of each holding over SQL; a forget whose commit is not known is unavailable, and forgetting again is harmless. */
export function createSqlHoldingRows(options: McpSqlOptions): HoldingRows {
  const commit = committer(options)
  const readOf = reader(options)
  return {
    async kept(tenant) {
      try {
        const text = tenantText({ tenant })
        const found = await readOf(text, 'keptHoldings', { tenant: text })
        if (found === null) return fail('unavailable')
        const rows = found.ok as readonly Readonly<{ holding: string; grants: string[] }>[]
        return succeed(
          rows.map((row): KeptHolding => ({
            holding: row.holding as EndpointHolding,
            grants: row.grants,
          })),
        )
      } catch {
        return fail('unavailable')
      }
    },
    async forget(tenant, holding) {
      try {
        const text = tenantText({ tenant })
        const done = await commit(text, 'forgetHolding', { tenant: text, holding })
        return done?.kind === 'answer' ? succeed(true) : fail('unavailable')
      } catch {
        return fail('unavailable')
      }
    },
  }
}
