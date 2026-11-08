import type { ToolPermissionContext } from '../authorization/current-tool-permission.ts'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { createTenantPermissionRead, type PermissionOrigins } from './permission-read-options.ts'
import type { SessionPermissionLogin } from '../authorization/session-permission-write.ts'
import type { ActingForTenantPrincipal, StandingDestinationResolver } from '@omne-harness/identity'
import { access, tenantCodec } from '@omne-harness/legal-identity'
import { GovernanceScopeSchema } from '@omne-harness/governance-contract'
import type { SettingsSourceDestination } from '@omne-harness/settings-local/preparation'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  createGovernanceLocal,
  createGovernanceLocalDestination,
  createGovernanceLocalSourceDestination,
  type GovernanceLocalOptions,
} from '@omne-harness/governance-local'
import type { SessionPermissionWriteContext } from './session-permission-commit.ts'
import type { SessionPermissionSettingsResolver } from './session-permission-settings.ts'
import { governanceStorageCombinations } from './storage-combinations.ts'
import { createGovernanceAdoptionProjection } from './adoption-current.ts'
import { governanceCatalogProjection } from './catalog-current.ts'
import { createSessionPermissionWriteResolver } from './session-permission-discovery.ts'
import { createSessionPermissionWritePlan } from './session-permission-plan.ts'

export type TenantGovernanceOptions = Omit<
  GovernanceLocalOptions<ToolPermissionContext, SessionPermissionWriteContext>,
  'metadata' | 'combinations' | 'current' | 'externalWrites' | 'permission'
> &
  Readonly<{
    materials: SqlMaterialCatalog
    catalogPrincipal: ActingForTenantPrincipal
    sourceRoute: string
    permissionRelease?: () => ToolRelease
    permissionOrigins?: () => PermissionOrigins | undefined
    login?: () => SessionPermissionLogin | undefined
    settings?: SessionPermissionSettingsResolver
  }>
type Combinations = ReturnType<typeof governanceStorageCombinations>
type Runtime = Extract<
  Awaited<
    ReturnType<typeof createGovernanceLocal<ToolPermissionContext, SessionPermissionWriteContext>>
  >,
  { kind: 'created' }
>
const unavailable = (phase: 'binding' | 'registration' | 'startup') => ({
  kind: 'unavailable' as const,
  owner: 'harness.tenant-governance',
  phase,
})

function reference(registration: Combinations['metadata']) {
  return {
    combinationVersion: registration.combinationVersion,
    manifestDigest: registration.manifestDigest,
  }
}

async function validReader(options: TenantGovernanceOptions): Promise<boolean> {
  const tenant = tenantCodec.encode(options.catalogPrincipal.tenant)
  if (
    !tenant.ok ||
    tenant.value !== options.scope.tenantRef ||
    options.domain.scope.kind !== 'tenant' ||
    options.domain.scope.tenant !== tenant.value
  )
    return false
  const verified = await options.identity.verifier.verify(options.catalogPrincipal)
  return verified.kind === 'verified' && verified.principal === options.catalogPrincipal
}

async function register(options: TenantGovernanceOptions, combinations: Combinations) {
  for (const combination of Object.values(combinations)) {
    const result = await options.storage.registerCombination({ ...options.domain, ...combination })
    if (result.kind !== 'registered') return false
  }
  return true
}

function writeOptions(
  options: TenantGovernanceOptions,
  combinations: Combinations,
  read: () => Runtime['service'] | undefined,
) {
  const resolve = createSessionPermissionWriteResolver({
    scope: options.scope,
    ...(options.login === undefined ? {} : { login: options.login }),
    readCatalog: request =>
      read()?.readCatalog(
        access(options.catalogPrincipal, options.catalogPrincipal.tenant),
        request,
      ) ?? Promise.resolve({ kind: 'unavailable', owner: 'harness.tenant-governance' }),
    ...(options.settings === undefined ? {} : { settings: options.settings }),
  })
  return {
    sourceRoute: options.sourceRoute,
    principalOf: (context: SessionPermissionWriteContext) => context.principal,
    resolve,
    plan: createSessionPermissionWritePlan({
      clear: { combination: reference(combinations.sessionClear), requiredConstraintIds: [] },
      unmapped: { combination: reference(combinations.sessionUnmapped), requiredConstraintIds: [] },
      mapped: { combination: reference(combinations.sessionMapped), requiredConstraintIds: [] },
    }),
  }
}

async function open(options: TenantGovernanceOptions, combinations: Combinations) {
  let phase: 'binding' | 'registration' | 'startup' = 'binding'
  try {
    if (!(await validReader(options))) return unavailable(phase)
    phase = 'registration'
    if (!(await register(options, combinations))) return unavailable(phase)
    phase = 'startup'
    let service: Runtime['service'] | undefined
    const reading =
      options.permissionRelease === undefined || options.settings === undefined
        ? undefined
        : createTenantPermissionRead({
            scope: options.scope,
            release: options.permissionRelease,
            settings: options.settings,
            sourceRoute: options.sourceRoute,
            storage: options.storage,
            domain: options.domain,
            combinations,
            origins: options.permissionOrigins ?? (() => undefined),
          })
    const runtime = await createGovernanceLocal<
      ToolPermissionContext,
      SessionPermissionWriteContext
    >({
      ...options,
      ...(reading === undefined ? {} : { permission: reading.permission }),
      metadata: reference(combinations.metadata),
      combinations: {
        mutation: reference(combinations.mutation),
        adoption: reference(combinations.adoption),
        catalog: reference(combinations.catalog),
      },
      current: {
        adoption: createGovernanceAdoptionProjection(options.domain.transactionDomain),
        catalog: governanceCatalogProjection,
      },
      externalWrites: writeOptions(options, combinations, () => service),
    })
    if (runtime.kind !== 'created') return unavailable(phase)
    if (runtime.externalWrites === undefined) {
      await runtime.close()
      return unavailable(phase)
    }
    service = runtime.service
    return {
      kind: runtime.kind,
      epoch: runtime.epoch,
      service,
      permissionBasis: runtime.permissionBasis,
      permissionRequest: reading?.requestFor ?? (async () => undefined),
      backend: { storage: options.storage, writes: runtime.externalWrites },
      close: runtime.close,
    }
  } catch {
    return unavailable(phase)
  }
}

/** Publish the durable settlement routes before open() can begin historical recovery. */
export type TenantGovernanceAssembly = Readonly<{
  destination: StandingDestinationResolver
  sourceDestination: SettingsSourceDestination
  open(): Promise<
    | Awaited<ReturnType<typeof open>>
    | Readonly<{
        kind: 'unavailable'
        owner: 'harness.tenant-governance'
        phase: 'installation'
        close: Extract<Awaited<ReturnType<typeof open>>, { kind: 'created' }>['close']
      }>
  >
}>

export function prepareTenantGovernance(input: TenantGovernanceOptions): TenantGovernanceAssembly {
  const options = {
    ...input,
    scope: GovernanceScopeSchema.parse(input.scope),
    domain: structuredClone(input.domain),
    grants: structuredClone(input.grants),
    identity: { ...input.identity },
  }
  const combinations = governanceStorageCombinations(input.materials)
  const coordination = {
    storage: options.storage,
    domain: options.domain,
    metadata: reference(combinations.metadata),
    destination: options.destination,
  }
  let opening: ReturnType<typeof open> | undefined
  return {
    destination: createGovernanceLocalDestination(coordination),
    sourceDestination: createGovernanceLocalSourceDestination({
      ...coordination,
      sourceRoute: options.sourceRoute,
    }),
    // One prepared assembly owns one attempt. Retry or remount creates a new assembly over the same durable domain.
    open: () => (opening ??= Promise.resolve().then(() => open(options, combinations))),
  }
}
