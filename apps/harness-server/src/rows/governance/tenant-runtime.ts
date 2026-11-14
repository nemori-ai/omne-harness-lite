import type { ToolRelease } from '../../entry/tool-release.ts'
import { createPermissionBasisRead, type PermissionOrigins } from './permission-basis-read.ts'
import { GOVERNANCE_PROJECTION_READ } from './storage-materials.ts'
import { readProjection } from './projection-read.ts'
import type { SessionPermissionLogin } from '../authorization/session-permission-write.ts'
import type { ActingForTenantPrincipal, StandingDestinationResolver } from '@omne-harness/identity'
import { access, tenantCodec } from '@omne-harness/legal-identity'
import { GovernanceScopeSchema } from '@omne-harness/governance-contract'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import type {
  SettingsBasis,
  SettingsFailure,
  SettingsViewRequest,
  TenantSettingsWriter,
} from '@omne-harness/settings'
import {
  createGovernanceLocal,
  createGovernanceLocalDestination,
  type GovernanceLocalOptions,
} from '@omne-harness/governance-local'
import type { SessionPermissionSettingsResolver } from './session-permission-settings.ts'
import { governanceStorageCombinations } from './storage-combinations.ts'
import { createGovernanceAdoptionProjection } from './adoption-current.ts'
import { governanceCatalogProjection } from './catalog-current.ts'
import { createSessionPermissionBasisSource } from './session-permission-basis-source.ts'

export type TenantGovernanceOptions = Omit<
  GovernanceLocalOptions,
  'metadata' | 'combinations' | 'current' | 'projection'
> &
  Readonly<{
    materials: SqlMaterialCatalog
    catalogPrincipal: ActingForTenantPrincipal
    permissionRelease?: () => ToolRelease
    permissionOrigins?: () => PermissionOrigins | undefined
    login?: () => SessionPermissionLogin | undefined
    settings?: SessionPermissionSettingsResolver
  }>
type Combinations = ReturnType<typeof governanceStorageCombinations>
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

async function open(options: TenantGovernanceOptions, combinations: Combinations) {
  let phase: 'binding' | 'registration' | 'startup' = 'binding'
  try {
    if (!(await validReader(options))) return unavailable(phase)
    phase = 'registration'
    if (!(await register(options, combinations))) return unavailable(phase)
    phase = 'startup'
    const handler = options.materials.readHandlers.find(
      item => item.handler === GOVERNANCE_PROJECTION_READ,
    )
    const runtime = await createGovernanceLocal({
      ...options,
      metadata: reference(combinations.metadata),
      combinations: {
        mutation: reference(combinations.mutation),
        adoption: reference(combinations.adoption),
      },
      projection: {
        read: async commands => {
          if (handler === undefined) return { kind: 'unavailable' }
          const read = await readProjection(options.storage, options.domain, handler, commands)
          return read.kind === 'completed' ? read : { kind: 'unavailable' }
        },
      },
      current: {
        adoption: createGovernanceAdoptionProjection(options.domain.transactionDomain),
        catalog: governanceCatalogProjection,
      },
    })
    if (runtime.kind !== 'created') return unavailable(phase)
    const { service } = runtime
    let closed = false
    const permissionBasis =
      options.permissionRelease === undefined || handler === undefined
        ? undefined
        : createPermissionBasisRead({
            scope: options.scope,
            release: options.permissionRelease,
            storage: options.storage,
            domain: options.domain,
            epoch: runtime.epoch,
            identity: options.identity,
            read: handler,
            conditions: {
              mapped: reference(combinations.toolStart),
              unmapped: reference(combinations.toolStartUnmapped),
            },
            origins: options.permissionOrigins ?? (() => undefined),
            accepting: () => !closed,
          })
    return {
      kind: runtime.kind,
      epoch: runtime.epoch,
      service,
      permissionBasis,
      sessionPermissionBasis: createSessionPermissionBasisSource({
        scope: options.scope,
        domain: options.domain,
        epoch: runtime.epoch,
        storage: options.storage,
        ...(options.login === undefined ? {} : { login: options.login }),
        ...(options.settings === undefined ? {} : { settings: options.settings }),
        readCatalog: request =>
          service.readCatalog(
            access(options.catalogPrincipal, options.catalogPrincipal.tenant),
            request,
          ),
        combinations: {
          clear: reference(combinations.sessionClear),
          unmapped: reference(combinations.sessionUnmapped),
          mapped: reference(combinations.sessionMapped),
        },
      }),
      close: () => {
        closed = true
        return runtime.close()
      },
    }
  } catch {
    return unavailable(phase)
  }
}

/** The Settings of one tenant: the catalog read and the tenant-layer write. */
export type TenantSettingsAccess = Readonly<{
  read(request: SettingsViewRequest): Promise<SettingsBasis | SettingsFailure>
  writer: TenantSettingsWriter
}>

/** Publish the durable settlement routes before open() can begin historical recovery. */
export type TenantGovernanceAssembly = Readonly<{
  destination: StandingDestinationResolver
  /** Present when the assembly composes the tenant Settings. */
  settings?: TenantSettingsAccess
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
    // One prepared assembly owns one attempt. Retry or remount creates a new assembly over the same durable domain.
    open: () => (opening ??= Promise.resolve().then(() => open(options, combinations))),
  }
}
