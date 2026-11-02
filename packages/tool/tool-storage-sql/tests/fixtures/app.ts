// The composition of one test application: a SQLite test provider in a fresh temporary directory,
// a fault wrapper over it, a published tenant directory with one transaction domain per tenant,
// the registered `tool` combination, and the two adapters of this member over them.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { TenantDomainLookup } from '@omne-harness/sql-contract'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import {
  createSqlToolLedgerStore,
  type SqlToolOutputCustodyOptions,
  type SqlToolStorageOptions,
} from '../../src/index.ts'
import { createFaultyStorage, type FaultyStorage } from './faults.ts'
import { createSqliteStorage, domainRef, type SqliteStorage } from './sqlite-storage.ts'

/** The tenants of the tool conformance suites and of the coordinator tests. */
export const SUITE_TENANTS: readonly TenantId[] = [
  testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
  testingTenant(`org_${'2'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
  testingTenant(`org_${'0'.repeat(26)}`, `acc_${'3'.repeat(26)}`),
  testingTenant(`org_${'2'.repeat(26)}`, `acc_${'3'.repeat(26)}`),
  testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000'),
  testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000'),
]

export const [TENANT_A, TENANT_B] = SUITE_TENANTS as [TenantId, TenantId, ...TenantId[]]

/** A legal tenant that the directory does not hold. */
export const UNREGISTERED = testingTenant(`org_${'9'.repeat(26)}`, `acc_${'9'.repeat(26)}`)

export const COMBINATION = { combinationVersion: 'tool-c1', manifestDigest: 'a'.repeat(64) }

export const MAX_COMMAND_BYTES = 1_048_576

export function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('not a minted tenant')
  return encoded.value
}

/** The transaction domain the directory publishes for `tenant`. */
export function domainNameOf(tenant: TenantId): string {
  const index = SUITE_TENANTS.findIndex(known => textOf(known) === textOf(tenant))
  if (index === -1) throw new Error('the tenant is not in the directory')
  return `dom_${index}`
}

export type App = Readonly<{
  directory: string
  sqlite: SqliteStorage
  faults: FaultyStorage
  options: SqlToolStorageOptions
  custodyOptions(overrides?: Partial<SqlToolOutputCustodyOptions>): SqlToolOutputCustodyOptions
  store: ReturnType<typeof createSqlToolLedgerStore>
  /** Closes the databases and removes the directory. */
  close(): void
}>

function lookupOf(tenants: readonly TenantId[]): TenantDomainLookup {
  const published = new Map(
    tenants.map(tenant => [textOf(tenant), domainRef(textOf(tenant), domainNameOf(tenant))]),
  )
  return {
    lookup: input => {
      const domain = published.get(input.tenant)
      return Promise.resolve(
        domain === undefined ? { kind: 'unregistered' } : { kind: 'ready', domain },
      )
    },
  }
}

/**
 * Opens (or reopens, when `directory` is given) the test application. Every suite tenant is
 * registered with the `tool` combination, as the session storage composite would do.
 */
export async function openApp(
  input: Readonly<{ directory?: string; maxCommandBytes?: number; keep?: boolean }> = {},
): Promise<App> {
  const directory =
    input.directory ?? realpathSync(mkdtempSync(join(tmpdir(), 'tool-storage-sql-')))
  const sqlite = createSqliteStorage({
    directory,
    maxCommandBytes: input.maxCommandBytes ?? MAX_COMMAND_BYTES,
  })
  for (const tenant of SUITE_TENANTS) {
    const domain = domainRef(textOf(tenant), domainNameOf(tenant))
    await sqlite.storage.registerCombination({
      scope: domain.scope,
      transactionDomain: domain.transactionDomain,
      ...COMBINATION,
      participants: ['tool'],
    })
  }
  const faults = createFaultyStorage(sqlite.storage)
  const options: SqlToolStorageOptions = {
    storage: faults.storage,
    domains: lookupOf(SUITE_TENANTS),
    combination: COMBINATION,
  }
  return {
    directory,
    sqlite,
    faults,
    options,
    custodyOptions: overrides => ({
      ...options,
      maxCommandBytes: input.maxCommandBytes ?? MAX_COMMAND_BYTES,
      maxChunkBytes: 4096,
      ...overrides,
    }),
    store: createSqlToolLedgerStore(options),
    close: () => {
      sqlite.close()
      if (input.keep !== true) rmSync(directory, { recursive: true, force: true })
    },
  }
}
