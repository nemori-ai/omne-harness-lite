// The transaction domain of a tenant. The tenant arrives in the shape of legal-identity's TenantId,
// minted or as a copy that a record read back (the ledger passes both); its text is rebuilt and
// parsed by legal-identity, so only a legal tenant text reaches the directory. The published
// directory is the only source of the domain: a tenant it does not hold is not read and not
// written, and an entry for another tenant is refused, never used.
import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { CommitRequestV2, DomainRef, SqlIdentity } from '@omne-harness/sql-contract'
import { isTenantShape } from '@omne-harness/tool'
import type { ToolFacts } from './worker/facts.ts'
import { PARTICIPANT } from './worker/schema.ts'
import type { SqlToolStorageOptions } from './options.ts'

export type TenantDomain = Readonly<{ tenant: string; domain: DomainRef }>

export type Resolution =
  | Readonly<{ kind: 'ready'; at: TenantDomain }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

function tenantText(tenant: unknown): string | null {
  if (!isTenantShape(tenant)) return null
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: tenant.organization.text, account: tenant.account.text }),
  )
  if (!parsed.ok) return null
  const encoded = tenantCodec.encode(parsed.value)
  return encoded.ok ? encoded.value : null
}

export async function resolveTenant(
  options: SqlToolStorageOptions,
  tenant: unknown,
): Promise<Resolution> {
  const text = tenantText(tenant)
  if (text === null) return { kind: 'unavailable', diagnostic: 'not a legal tenant' }
  const found = await options.domains.lookup({ tenant: text })
  switch (found.kind) {
    case 'unregistered':
      return { kind: 'unavailable', diagnostic: 'the tenant has no transaction domain' }
    case 'unavailable':
      return { kind: 'unavailable', diagnostic: `tenant domain lookup: ${found.diagnostic}` }
    case 'ready':
      return found.domain.scope.kind === 'tenant' && found.domain.scope.tenant === text
        ? { kind: 'ready', at: { tenant: text, domain: found.domain } }
        : { kind: 'unavailable', diagnostic: 'the tenant domain directory answered another scope' }
    default: {
      const exhaustive: never = found
      return exhaustive
    }
  }
}

/**
 * One command of the `tool` participant under a fresh operation key. Every call is a new SQL
 * operation: the ports recognise their own outcomes (the ledger by its records, the custody by its
 * manifests), so no SQL identity is ever reused and no SQL receipt is recalled.
 */
export function requestOf(
  options: SqlToolStorageOptions,
  at: TenantDomain,
  facts: ToolFacts,
): CommitRequestV2 {
  const identity: SqlIdentity = {
    scope: at.domain.scope,
    transactionDomain: at.domain.transactionDomain,
    operation: `tool.${facts.intent}`,
    protocolVersion: '2',
    operationKey: randomUUID(),
  }
  return { identity, ...options.combination, commands: [{ participant: PARTICIPANT, facts }] }
}
