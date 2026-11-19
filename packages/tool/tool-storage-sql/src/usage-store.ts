// The usage read of the SQL ledger: one page of a tenant's usage rows by start and consumer; a tenant
// with no transaction domain has no calls and so an empty page.
import { randomUUID } from 'node:crypto'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { LedgerUsageQuery, LedgerUsageRead } from '@omne-harness/tool'
import type { ToolUsageFact } from '@omne-harness/tool-contract/provider'
import type { SqlToolStorageOptions } from './options.ts'
import { tenantText } from './tenant.ts'
import type { UsageReadInput } from './worker/facts.ts'
import { PROTOCOL, USAGE_READ_HANDLER } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

const unavailable = (diagnostic: string): LedgerUsageRead => ({ kind: 'unavailable', diagnostic })
const EMPTY: LedgerUsageRead = { kind: 'page', facts: [], undated: 0, more: false }

function factsOf(rows: readonly unknown[]): readonly ToolUsageFact[] | null {
  const facts: ToolUsageFact[] = []
  for (const row of rows) {
    if (typeof row !== 'string') return null
    const fact = JSON.parse(row) as JsonValue
    if (!isObject(fact) || typeof fact['call'] !== 'string') return null
    facts.push(fact as unknown as ToolUsageFact)
  }
  return facts
}

export function usageReadOver(
  options: SqlToolStorageOptions,
): (query: LedgerUsageQuery) => Promise<LedgerUsageRead> {
  return async query => {
    const tenant = tenantText(query.tenant)
    if (tenant === null) return unavailable('not a legal tenant')
    try {
      const found = await options.domains.lookup({ tenant })
      if (found.kind === 'unregistered') return EMPTY
      if (found.kind !== 'ready') return unavailable(`tenant domain lookup: ${found.diagnostic}`)
      if (found.domain.scope.kind !== 'tenant' || found.domain.scope.tenant !== tenant)
        return unavailable('the tenant domain directory answered another scope')
      const input: UsageReadInput = {
        tenant,
        from: query.range?.from ?? null,
        to: query.range?.to ?? null,
        owner: query.consumer?.owner ?? null,
        works: query.consumer?.works ?? [],
        order: query.order,
        afterStart: query.after?.start ?? null,
        afterCall: query.after?.call ?? null,
        limit: query.limit,
      }
      const answer = await options.storage.read({
        domain: found.domain,
        handler: USAGE_READ_HANDLER,
        protocol: PROTOCOL,
        requestKey: randomUUID(),
        input,
      })
      if (answer.kind !== 'read')
        return unavailable(
          answer.kind === 'cancelled'
            ? 'usage read: cancelled'
            : `usage read: ${answer.reason} ${answer.diagnostic ?? ''}`.trimEnd(),
        )
      const output = answer.output
      const undated = isObject(output) ? output['undated'] : undefined
      const rows = isObject(output) ? output['facts'] : undefined
      const facts = Array.isArray(rows) ? factsOf(rows) : null
      if (typeof undated !== 'number' || facts === null)
        return unavailable('usage read: the rows do not hold a usage page')
      return {
        kind: 'page',
        facts: facts.slice(0, query.limit),
        undated,
        more: facts.length > query.limit,
      }
    } catch {
      return unavailable('usage read: the storage threw')
    }
  }
}
