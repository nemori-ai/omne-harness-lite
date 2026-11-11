import { SESSION_LOG_PARTICIPANTS } from '../../src/participants.ts'
// The composition of one test application: two tenants with their own transaction domains, a tenant
// domain directory, an explicit access policy, a fixed cursor signing double, and over the SQLite
// test provider the Session storage port, the pair of a public port and a delegated entry, and the
// session binding source.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { RoutedInput, SessionCommand, SessionAccess } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  ordinaryInput,
  sessionId,
  testingTenant,
  type ScriptedSessionAccessCheck,
} from '@omne-harness/session-contract/testing'
import {
  createFixedSessionCursorSigning,
  type FixedSessionCursorSigning,
} from '@omne-harness/session-cordis-contract/testing'
import type { DomainRef, TenantDomain, TenantDomainAccess } from '@omne-harness/sql-contract'
import {
  createSessionPrincipalBindings,
  createSessionStorage,
  createSessionStoragePair,
  type SessionStorageOptions,
} from '../../src/index.ts'
import { createSqliteStorage, type SqliteStorage } from './sqlite-storage.ts'

export const TENANT_A = testingTenant(
  'org_c0nf0rmance000000000000000',
  'acc_c0nf0rmance000000000000000',
)
export const TENANT_B = testingTenant(
  'org_c0nf0rmance0ther0000000000',
  'acc_c0nf0rmance0ther0000000000',
)
export const TENANT_C = testingTenant(
  'org_c0nf0rmance0thr33000000000',
  'acc_c0nf0rmance0thr33000000000',
)

export const textOf = (tenant: TenantId): string => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('not a minted tenant')
  return encoded.value
}

export type App = Awaited<ReturnType<typeof app>>

export async function app(
  options: {
    directory?: readonly TenantId[]
    now?: () => number
    /** The bounds of the work cache of the storage (SPEC RT-04); the member's defaults when absent. */
    workCache?: SessionStorageOptions<string>['workCache']
    intakeLimits?: SessionStorageOptions<string>['intakeLimits']
  } = {},
) {
  const provider: SqliteStorage = createSqliteStorage()
  const known = options.directory ?? [TENANT_A, TENANT_B]
  const entries: TenantDomain[] = known.map((tenant, index) => ({
    tenant: textOf(tenant),
    domain: {
      scope: { kind: 'tenant', tenant: textOf(tenant) },
      transactionDomain: `dom_${index}`,
    } satisfies DomainRef,
  }))
  const directory: { entries: TenantDomain[]; swap: TenantDomain | null; revision: string } = {
    entries,
    swap: null,
    revision: '1',
  }
  const domains: TenantDomainAccess = {
    resolve: input => {
      const entry = directory.swap ?? directory.entries.find(item => item.tenant === input.tenant)
      return Promise.resolve(
        entry === undefined
          ? { kind: 'unavailable', diagnostic: 'no domain for the tenant' }
          : { kind: 'ready', entry },
      )
    },
    snapshot: () =>
      Promise.resolve({
        kind: 'ready',
        value: { revision: directory.revision, entries: [...directory.entries] },
      }),
  }
  for (const entry of entries)
    await provider.storage.registerCombination({
      scope: entry.domain.scope,
      transactionDomain: entry.domain.transactionDomain,
      combinationVersion: 'c1',
      manifestDigest: 'a'.repeat(64),
      participants: SESSION_LOG_PARTICIPANTS,
    })
  const signing: FixedSessionCursorSigning = createFixedSessionCursorSigning()
  const denied = new Set<string>()
  const deniedTenants = new Set<string>()
  const accessCheck: ScriptedSessionAccessCheck<string> = createPolicySessionAccessCheck(request =>
    denied.has(request.operation) ||
    ('tenant' in request.access && deniedTenants.has(textOf(request.access.tenant)))
      ? { kind: 'denied' }
      : { kind: 'allowed', evidence: evidence(`access/${request.operation}`) },
  )
  let clock = 1_000_000
  const storageOptions: SessionStorageOptions<string> = {
    storage: provider.storage,
    domains,
    accessCheck,
    ...(options.intakeLimits === undefined ? {} : { intakeLimits: options.intakeLimits }),
    cursorSigning: signing,
    combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
    now: options.now ?? (() => clock),
    ...(options.workCache === undefined ? {} : { workCache: options.workCache }),
  }
  const port = createSessionStorage<string>(storageOptions)
  // The pair over the same options and storage: its public port and its delegated entry.
  const pair = createSessionStoragePair<string>(storageOptions)
  const bindings = createSessionPrincipalBindings({ storage: provider.storage, domains })
  const access = (tenant: TenantId, session = 'session-1'): SessionAccess<string> => ({
    principal: 'tester',
    tenant,
    session: sessionId(session),
  })
  const create = async (tenant: TenantId, session = 'session-1') => {
    const command: SessionCommand = {
      kind: 'create',
      input: {
        tenant,
        session: sessionId(session),
        operation: operationId(`create-${session}`),
        creation: creation(),
      },
    }
    const guards = [
      initializationFixtureGuard(
        initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
      ),
    ]
    return port.commit({ access: access(tenant, session), command, guards })
  }
  /** Accepts the ordinary input `name`; by default it came through the login entry. */
  const accept = (
    tenant: TenantId,
    session: string,
    name: string,
    value: Extract<RoutedInput, { kind: 'ordinary' }> = ordinaryInput(name),
  ) =>
    port.commit({
      access: access(tenant, session),
      command: {
        kind: 'accept',
        input: {
          tenant,
          session: sessionId(session),
          operation: operationId(`accept-${name}`),
          value,
        },
      },
      guards: [],
    })
  /** Registers a tenant in its own new domain; the directory publishes a new revision. */
  const register = async (tenant: TenantId) => {
    const entry: TenantDomain = {
      tenant: textOf(tenant),
      domain: {
        scope: { kind: 'tenant', tenant: textOf(tenant) },
        transactionDomain: `dom_${directory.entries.length}`,
      },
    }
    await provider.storage.registerCombination({
      scope: entry.domain.scope,
      transactionDomain: entry.domain.transactionDomain,
      combinationVersion: 'c1',
      manifestDigest: 'a'.repeat(64),
      participants: SESSION_LOG_PARTICIPANTS,
    })
    directory.entries.push(entry)
    directory.revision = String(Number(directory.revision) + 1)
    return entry.domain.transactionDomain
  }
  return {
    port,
    pair,
    /** The options of both ports, for a test that opens another port instance. */
    storageOptions,
    bindings,
    provider,
    register,
    signing,
    access,
    create,
    accept,
    directory,
    denyOperation: (operation: string) => denied.add(operation),
    denyTenant: (tenant: TenantId) => deniedTenants.add(textOf(tenant)),
    advance: (ms: number) => {
      clock += ms
    },
    accessCheck,
  }
}
