// Shared fixtures of the `session-provider` row tests. `loadProviderTree` loads the row with the
// rows and entry objects it injects (an access check double, a delegated-transactions double and
// the real principal entry objects) and hands out the Session faces by caller class, as
// `server-entry` asks for them. It does not import vitest.
import { Context, type Plugin } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal, SystemPrincipal } from '@omne-harness/identity'
import { principalIssuerKey, type PrincipalIssuerService } from '@omne-harness/identity/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  SessionAccessCheck,
  SessionAccessRequest,
  SessionDelegatedTransactions,
  SessionFaces,
} from '@omne-harness/session-contract'
import {
  createPolicySessionAccessCheck,
  evidence,
  testingTenant,
  type ScriptedSessionAccessCheck,
  type SessionAccessScript,
} from '@omne-harness/session-contract/testing'
import {
  SessionAccessCheckService,
  SessionDelegatedTransactionsService,
  sessionAccessCheckKey,
  sessionDelegatedTransactionsKey,
  sessionKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { principalIssuer, sessionPrincipals } from '../../../src/entry/principals.ts'
import { sessionWorkPrincipals } from '../../../src/entry/session-work-principals.ts'
import { LifecycleRegistry, S0AssemblyLifecycleService } from '../../../src/lifecycle.ts'
import { disposeTree, startTree, type EntryObject, type RowSpec } from '../../../src/loader.ts'
import { serveProfile } from '../../../src/profile.ts'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import {
  createSessionProviderRow,
  type CreateSessionProviderRowOptions,
  type SessionProviderArrival,
} from '../../../src/rows/session-provider/index.ts'
import { monotonicClock } from '../../../src/shutdown.ts'
import { createTrust } from '../../../src/trust.ts'
import type { EntryEnv, EntryObjectModule, RowId, TreeRow } from '../../../src/types.ts'

export const TENANT_A: TenantId = testingTenant(
  'org_app8c0pr0v1der000000000000',
  'acc_app8c0pr0v1der000000000000',
)
export const TENANT_B: TenantId = testingTenant(
  'org_app8c0ther0000000000000000',
  'acc_app8c0ther0000000000000000',
)

export function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('not a minted tenant')
  return encoded.value
}

type AccessPolicy = (request: SessionAccessRequest<unknown>) => SessionAccessScript

function tenantOfPrincipal(principal: unknown): string | undefined {
  if (typeof principal !== 'object' || principal === null || !('tenant' in principal))
    return undefined
  const tenant = principal.tenant
  const encoded = tenantCodec.encode(tenant as TenantId)
  return encoded.ok ? encoded.value : undefined
}

/**
 * The tenant rule of the authorization row, and nothing else: the principal's tenant must be the
 * tenant of the access. It does not know which tenant owns a session.
 */
export const sameTenantPolicy: AccessPolicy = request => {
  const principalTenant = tenantOfPrincipal(request.access.principal)
  const accessTenant = 'tenant' in request.access ? textOf(request.access.tenant) : undefined
  return principalTenant !== undefined && principalTenant === accessTenant
    ? { kind: 'allowed', evidence: evidence(`access/${request.operation}`) }
    : { kind: 'denied' }
}

/** A contract-double row `authorization` that provides `sessionAccessCheck` over `policy`. */
export function accessCheckRow(policy: AccessPolicy): Readonly<{
  plugin: Plugin.Object
  check: ScriptedSessionAccessCheck<unknown>
}> {
  const check = createPolicySessionAccessCheck<unknown>(policy)
  class PolicyAccessCheck extends SessionAccessCheckService<unknown> {
    readonly check: SessionAccessCheck<unknown>['check'] = request => check.check(request)
  }
  const plugin = defineRow({
    row: 'authorization',
    implementation: 'contract-double',
    manifest: { provides: [sessionAccessCheckKey], injects: [], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'policy-access-check',
      apply(ctx: Context) {
        new PolicyAccessCheck(ctx)
      },
    },
  })
  return { plugin, check }
}

/** A contract-double row `session-storage` that only provides the delegated entry, which no test uses. */
export const delegatedTransactionsRow = defineRow({
  row: 'session-storage',
  implementation: 'contract-double',
  manifest: {
    provides: [sessionDelegatedTransactionsKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'delegated-transactions-double',
    apply(ctx: Context) {
      class Unused extends SessionDelegatedTransactionsService<unknown> {
        readonly bind: SessionDelegatedTransactions<unknown>['bind'] = () => {
          throw new Error('the delegated entry is not used by these tests')
        }
      }
      new Unused(ctx)
    },
  },
}) as Plugin.Object

function treeRow(id: string, plugin: string): TreeRow {
  return { id: id as RowId, plugin, config: {}, source: 'distribution' }
}

function declared(plugin: Plugin.Object): RowSpec {
  const declaration = rowDeclarationOf(plugin)
  if (declaration === undefined) throw new Error('not a declared row')
  return {
    row: treeRow(declaration.row, 'declared'),
    manifest: declaration.manifest,
    plugin,
    implementation: declaration.implementation,
    declared: { row: declaration.row, via: null },
  }
}

export type ProviderTree = Readonly<{
  root: Context
  /** The Session faces as `server-entry` asks for them: `intake` for work and management, `reader` for history. */
  intake: SessionFaces<unknown>
  reader: SessionFaces<unknown>
  check: ScriptedSessionAccessCheck<unknown>
  arrivals: readonly SessionProviderArrival[]
  state(): string
  /** A principal that the in-process authority signed: the system part `component` acting for `tenant`. */
  principalFor(tenant: TenantId, component?: string): ActingForTenantPrincipal
  /** A system principal that the in-process authority signed, acting for no tenant. */
  systemFor(component: string): SystemPrincipal
  dispose(): Promise<void>
}>

export type ProviderTreeOptions = Readonly<{
  policy?: AccessPolicy
  row?: CreateSessionProviderRowOptions
}>

const ENTRY_OBJECTS: readonly EntryObjectModule[] = [
  principalIssuer,
  sessionPrincipals,
  sessionWorkPrincipals,
]

export async function loadProviderTree(options: ProviderTreeOptions = {}): Promise<ProviderTree> {
  const profile = serveProfile()
  const arrivals: SessionProviderArrival[] = []
  const policy = accessCheckRow(options.policy ?? sameTenantPolicy)
  const providerRow = createSessionProviderRow({
    ...options.row,
    observe: arrival => {
      arrivals.push(arrival)
      options.row?.observe?.(arrival)
    },
  })
  const specs: RowSpec[] = [
    declared(policy.plugin),
    declared(delegatedTransactionsRow),
    declared(providerRow),
  ]
  const root = new Context()
  const trust = createTrust(
    [...new Set([...profile.visibility.values()].flat())].map(name => ({
      id: name,
      names: [name],
    })),
    profile.visibility,
  )
  const registry = new LifecycleRegistry({
    expected: new Map(),
    clock: monotonicClock,
    requestStop: () => {},
  })
  await root.plugin(S0AssemblyLifecycleService, registry)
  const made = new Map<symbol, unknown>()
  const env: EntryEnv = {
    stateRoot: '.',
    readTrusted: name => trust.contextForName(root, name),
    once: <T>(key: symbol, create: () => T): T => {
      if (!made.has(key)) made.set(key, create())
      return made.get(key) as T
    },
  }
  const entryObjects: EntryObject[] = ENTRY_OBJECTS.map(module => ({
    name: module.name,
    implementation: module.implementation,
    registersFor: module.registersFor ?? [],
    install: scope => module.install(scope, env),
  }))
  const result = await startTree({
    root,
    trust,
    rows: specs,
    entryObjects,
    readinessTimeoutMs: 10_000,
    barrier: () => {},
  })
  if (result.kind !== 'started') throw new Error(`tree did not start: ${result.kind}`)
  const state = result.report.rows.find(row => row.id === 'session-provider')?.state ?? 'absent'
  const issuer: PrincipalIssuerService = trust
    .contextForName(root, principalIssuerKey)
    .get(principalIssuerKey) as PrincipalIssuerService
  const system = new Map<string, SystemPrincipal>()
  const systemFor = (component: string): SystemPrincipal => {
    let actor = system.get(component)
    if (actor === undefined) {
      const issued = issuer.issueSystem({ component })
      if ('failure' in issued) throw new Error('the authority refused the test component')
      actor = issued.ok
      system.set(component, actor)
    }
    return actor
  }
  let disposed = false
  return {
    root,
    intake: root.intercept(sessionKey, { caller: 'intake' }).session,
    reader: root.intercept(sessionKey, { caller: 'reader' }).session,
    check: policy.check,
    arrivals,
    state: () => state,
    systemFor,
    principalFor(tenant, component = 'server-entry') {
      const actor = systemFor(component)
      const issued = issuer.issueActingForTenant({
        actor,
        tenant,
        work: { owner: 'test', work: 'session-provider' },
      })
      if ('failure' in issued) throw new Error('the authority refused the test principal')
      return issued.ok
    },
    async dispose() {
      if (disposed) return
      disposed = true
      await disposeTree(root, result.rows)
    },
  }
}
