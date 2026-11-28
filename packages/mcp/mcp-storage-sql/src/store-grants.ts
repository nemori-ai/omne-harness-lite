import type { TenantId } from '@omne-harness/legal-identity'
import type { EndpointHolding } from '@omne-harness/mcp-contract'
import type {
  AuthorizationRecords,
  ClientRegistration,
  GrantFacts,
  GrantKey,
  PendingAuthorization,
} from '@omne-harness/mcp-contract/provider'
import { fail, succeed, type Ack } from '@omne-harness/operation-result'
import type { GrantCells } from './rows-grants.ts'
import type { ScriptName } from './schema.ts'
import { committer, reader, tenantText, type Committed, type McpSqlOptions } from './store.ts'

const cellsOf = (key: GrantKey): GrantCells => ({
  tenant: tenantText(key),
  grantKey: JSON.stringify([key.holding, key.endpoint]),
})

function keyOf(tenant: TenantId, grantKey: string): GrantKey | undefined {
  const parsed: unknown = JSON.parse(grantKey)
  if (!Array.isArray(parsed) || parsed.length !== 2) return undefined
  const [holding, endpoint] = parsed as unknown[]
  return typeof holding === 'string' && typeof endpoint === 'string'
    ? { tenant, holding: holding as EndpointHolding, endpoint }
    : undefined
}

const okOf = (done: Committed | null): unknown =>
  done === null || done.kind === 'unknown' ? undefined : (done.response as { ok?: unknown }).ok

/** The grants over SQL in each tenant's domain; a write whose commit is not known counts when the row now holds its revision. */
export function createSqlAuthorizationRecords(options: McpSqlOptions): AuthorizationRecords {
  const commit = committer(options)
  const readOf = reader(options)
  const ack = async (
    tenant: string,
    script: ScriptName,
    command: unknown,
  ): Promise<Ack<'unavailable'>> => {
    try {
      return okOf(await commit(tenant, script, command)) === undefined
        ? fail('unavailable')
        : succeed(true)
    } catch {
      return fail('unavailable')
    }
  }
  const read: AuthorizationRecords['read'] = async key => {
    try {
      const cells = cellsOf(key)
      const found = await readOf(cells.tenant, 'readGrant', { key: cells })
      if (found === null) return fail('unavailable')
      return found.ok === 'absent'
        ? succeed('absent')
        : succeed((found.ok as { row: GrantFacts }).row)
    } catch {
      return fail('unavailable')
    }
  }
  return {
    begin(pending) {
      const { key, ...row } = pending
      const cells = cellsOf(key)
      return ack(cells.tenant, 'beginPending', { cells, state: pending.state, row })
    },
    async take(tenant, state) {
      try {
        const text = tenantText({ tenant })
        const taken = okOf(await commit(text, 'takePending', { tenant: text, state }))
        if (taken === undefined) return fail('unavailable')
        if (taken === 'absent') return succeed('absent')
        const { grantKey, row } = taken as {
          grantKey: string
          row: Omit<PendingAuthorization, 'key'>
        }
        const key = keyOf(tenant, grantKey)
        return key === undefined ? fail('unavailable') : succeed({ ...row, key })
      } catch {
        return fail('unavailable')
      }
    },
    void(key) {
      const cells = cellsOf(key)
      return ack(cells.tenant, 'voidPending', { cells })
    },
    read,
    async write(key, facts, expected) {
      try {
        const cells = cellsOf(key)
        const done = await commit(cells.tenant, 'writeGrant', {
          cells,
          revision: facts.revision,
          row: facts,
          expected,
        })
        if (done !== null && done.kind === 'answer')
          return (done.response as { ok?: unknown }).ok === 'written'
            ? succeed('written')
            : fail('conflict')
        if (done === null) return fail('unavailable')
        const now = await read(key)
        return 'ok' in now && now.ok !== 'absent' && now.ok.revision === facts.revision
          ? succeed('written')
          : fail('unavailable')
      } catch {
        return fail('unavailable')
      }
    },
    remove(key) {
      const cells = cellsOf(key)
      return ack(cells.tenant, 'removeGrant', { cells })
    },
    async registration(tenant, issuer) {
      try {
        const text = tenantText({ tenant })
        const found = await readOf(text, 'readClient', { tenant: text, issuer })
        if (found === null) return fail('unavailable')
        return succeed(found.ok as ClientRegistration | 'absent')
      } catch {
        return fail('unavailable')
      }
    },
    register(tenant, issuer, registration) {
      const text = tenantText({ tenant })
      return ack(text, 'register', { tenant: text, issuer, row: registration })
    },
  }
}
