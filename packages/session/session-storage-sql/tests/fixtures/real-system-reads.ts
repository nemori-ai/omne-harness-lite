// The Session storage over the real sqlite-provider for the system reads (R10 references, R11
// releasedScopes): two tenants in their own transaction domains, and a directory and an access
// decision that a test can switch. The provider comes from `openRealApp`, so it is the real write
// Worker and the real read Worker pool behind the public entry of `@omne-harness/sqlite-provider`.
//
// The index rows are written straight into the domain files with `node:sqlite` while the provider
// is closed; the provider is then opened again on the same files. The rows therefore verify the
// read path only. They do not verify how the index is maintained by a commit (the W3 maintenance).
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TenantId } from '@omne-harness/legal-identity'
import { createPolicySessionAccessCheck, evidence } from '@omne-harness/session-contract/testing'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import type { SqlStorage, TenantDomain, TenantDomainAccess } from '@omne-harness/sql-contract'
import { createSessionStorage } from '../../src/index.ts'
import { openRealApp, TENANT_A, TENANT_B, textOf } from './real-provider.ts'

export { TENANT_A, TENANT_B }

/** A resident index row. `tenant` defaults to the tenant of the domain; a stray row names another. */
export type ResidentRow = Readonly<{
  domain: TenantId
  tenant?: TenantId
  session: string
  key: string
  capability: string
}>
export type ReleasedRow = Readonly<{
  domain: TenantId
  tenant?: TenantId
  session: string
  scope: string
}>
export type SystemRows = Readonly<{
  residents: readonly ResidentRow[]
  released: readonly ReleasedRow[]
}>

function writeRows(
  file: string,
  residents: readonly ResidentRow[],
  released: readonly ReleasedRow[],
) {
  const db = new DatabaseSync(file)
  try {
    const resident = db.prepare(
      'INSERT INTO sl_resident_idx (resident_key, tenant, session, capability, shape) VALUES (?, ?, ?, ?, ?)',
    )
    for (const row of residents)
      resident.run(
        row.key,
        textOf(row.tenant ?? row.domain),
        row.session,
        row.capability,
        JSON.stringify({ capability: row.capability }),
      )
    const scope = db.prepare(
      'INSERT INTO sl_released_scope_idx (tenant, session, scope, data) VALUES (?, ?, ?, ?)',
    )
    for (const row of released) {
      const tenant = textOf(row.tenant ?? row.domain)
      scope.run(
        tenant,
        row.session,
        row.scope,
        JSON.stringify({
          tenant: { $tenant: tenant },
          session: row.session,
          task: `sop_release-${row.scope}`,
          scope: row.scope,
        }),
      )
    }
  } finally {
    db.close()
  }
}

export async function openSystemReads(rows: SystemRows) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'session-system-reads-')))
  const first = await openRealApp({ root })
  await first.close()
  for (const tenant of [TENANT_A, TENANT_B])
    writeRows(
      first.domainFile(first.domainOf(tenant)),
      rows.residents.filter(row => row.domain === tenant),
      rows.released.filter(row => row.domain === tenant),
    )
  const real = await openRealApp({ root })

  /** Every tenant domain that a read reached. */
  const reads: string[] = []
  const storage: SqlStorage = {
    registerCombination: input => real.storage.registerCombination(input),
    commit: request => real.storage.commit(request),
    query: identity => real.storage.query(identity),
    read: (input, options) => {
      reads.push(input.domain.transactionDomain)
      return real.storage.read(input, options)
    },
  }

  const entries: TenantDomain[] = [TENANT_A, TENANT_B].map(tenant => ({
    tenant: textOf(tenant),
    domain: {
      scope: { kind: 'tenant', tenant: textOf(tenant) },
      transactionDomain: real.domainOf(tenant),
    },
  }))
  const directory = { readable: true, revision: '1' }
  const domains: TenantDomainAccess = {
    resolve: input => {
      const entry = entries.find(item => item.tenant === input.tenant)
      return Promise.resolve(
        entry === undefined
          ? { kind: 'unavailable', diagnostic: 'no domain for the tenant' }
          : { kind: 'ready', entry },
      )
    },
    snapshot: () =>
      Promise.resolve(
        directory.readable
          ? { kind: 'ready', value: { revision: directory.revision, entries: [...entries] } }
          : { kind: 'unavailable', diagnostic: 'the directory cannot be read' },
      ),
  }
  const denied = new Set<string>()
  const port = createSessionStorage<string>({
    storage,
    domains,
    accessCheck: createPolicySessionAccessCheck<string>(request =>
      denied.has(request.operation)
        ? { kind: 'denied' }
        : { kind: 'allowed', evidence: evidence(`access/${request.operation}`) },
    ),
    cursorSigning: createFixedSessionCursorSigning(),
    combination: real.combination,
  })

  return {
    port,
    reads,
    directory,
    /** The access decision stops allowing this operation. */
    deny: (operation: 'references' | 'releasedScopes') => denied.add(operation),
    dispose: async (): Promise<void> => {
      await real.dispose()
      await rm(root, { recursive: true, force: true })
    },
  }
}

export type SystemReads = Awaited<ReturnType<typeof openSystemReads>>
