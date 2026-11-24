import type { AssetsLocal } from '@omne-harness/assets-local'
import type { PermissionDeclaration } from '../../entry/permission-declarations.ts'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { createPermissionBasisRead, type PermissionOrigins } from './permission-basis-read.ts'
import { GOVERNANCE_PROJECTION_READ } from './storage-materials.ts'
import { readProjection } from './projection-read.ts'
import type { SessionPermissionLogin } from '../authorization/session-permission-write.ts'
import type { ActingForTenantPrincipal, StandingDestinationResolver } from '@omne-harness/identity'
import { access, tenantCodec } from '@omne-harness/legal-identity'
import { GovernanceScopeSchema } from '@omne-harness/governance-contract'
import type { ReadUnavailableReason, SqlMaterialCatalog } from '@omne-harness/sql-contract'
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
import type { GovernedCapture } from './governed-capture.ts'
import { createSessionPermissionBasisSource } from './session-permission-basis-source.ts'

export type TenantGovernanceOptions = Omit<
  GovernanceLocalOptions,
  'metadata' | 'combinations' | 'current' | 'projection'
> &
  Readonly<{
    materials: SqlMaterialCatalog
    catalogPrincipal: ActingForTenantPrincipal
    permissionRelease?: () => ToolRelease
    permissionDeclarations?: () => readonly PermissionDeclaration[]
    permissionDeclared?: () => readonly PermissionDeclaration[]
    permissionOrigins?: () => PermissionOrigins | undefined
    login?: () => SessionPermissionLogin | undefined
    settings?: SessionPermissionSettingsResolver
    capture: GovernedCapture
  }>
type Combinations = ReturnType<typeof governanceStorageCombinations>
const unavailable = (phase: 'binding' | 'registration' | 'startup', reason: string) => ({
  kind: 'unavailable' as const,
  owner: 'harness.tenant-governance',
  phase,
  reason,
})

function reference(registration: Combinations['metadata']) {
  return {
    combinationVersion: registration.combinationVersion,
    manifestDigest: registration.manifestDigest,
  }
}

async function readerFault(options: TenantGovernanceOptions): Promise<string | undefined> {
  const tenant = tenantCodec.encode(options.catalogPrincipal.tenant)
  if (
    !tenant.ok ||
    tenant.value !== options.scope.tenantRef ||
    options.domain.scope.kind !== 'tenant' ||
    options.domain.scope.tenant !== tenant.value
  )
    return 'catalog reader is not of this tenant'
  const verified = await options.identity.verifier.verify(options.catalogPrincipal)
  if (verified.kind !== 'verified') return `catalog reader verification answered ${verified.kind}`
  return verified.principal === options.catalogPrincipal
    ? undefined
    : 'catalog reader verified as another principal'
}

async function registrationFault(
  options: TenantGovernanceOptions,
  combinations: Combinations,
): Promise<string | undefined> {
  for (const [name, combination] of Object.entries(combinations)) {
    const result = await options.storage.registerCombination({ ...options.domain, ...combination })
    if (result.kind === 'rejected_before_accept')
      return `combination ${name} rejected: ${result.reason}`
    if (result.kind !== 'registered') return `combination ${name} registration ${result.kind}`
  }
  return undefined
}

async function open(options: TenantGovernanceOptions, combinations: Combinations) {
  let phase: 'binding' | 'registration' | 'startup' = 'binding'
  try {
    const reader = await readerFault(options)
    if (reader !== undefined) return unavailable(phase, reader)
    phase = 'registration'
    const registration = await registrationFault(options, combinations)
    if (registration !== undefined) return unavailable(phase, registration)
    phase = 'startup'
    const handler = options.materials.readHandlers.find(
      item => item.handler === GOVERNANCE_PROJECTION_READ,
    )
    let refused: ReadUnavailableReason | null = null
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
          refused = read.kind === 'unavailable' ? read.reason : null
          return read.kind === 'completed' ? read : { kind: 'unavailable' }
        },
      },
      current: {
        adoption: createGovernanceAdoptionProjection(options.domain.transactionDomain),
        catalog: governanceCatalogProjection(options.capture),
      },
    })
    if (runtime.kind !== 'created') return unavailable(phase, `${runtime.owner} ${runtime.kind}`)
    const { service } = runtime
    let closed = false
    const permissionBasis =
      options.permissionDeclarations === undefined || handler === undefined
        ? undefined
        : createPermissionBasisRead({
            scope: options.scope,
            declarations: options.permissionDeclarations,
            storage: options.storage,
            domain: options.domain,
            epoch: runtime.epoch,
            identity: options.identity,
            read: handler,
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
      /** Why the store refused the latest projection read; null when it answered. */
      readRefusal: () => refused,
      close: () => {
        closed = true
        return runtime.close()
      },
    }
  } catch {
    return unavailable(phase, 'threw')
  }
}

export type TenantSettingsAccess = Readonly<{
  read(request: SettingsViewRequest): Promise<SettingsBasis | SettingsFailure>
  writer: TenantSettingsWriter
}>

export type TenantAssetsAccess = Pick<AssetsLocal, 'readHolding'>

/** Publish the durable settlement routes before open() can begin historical recovery. */
export type TenantGovernanceAssembly = Readonly<{
  destination: StandingDestinationResolver
  settings?: TenantSettingsAccess
  assets?: TenantAssetsAccess
  open(): Promise<
    | Awaited<ReturnType<typeof open>>
    | Readonly<{
        kind: 'unavailable'
        owner: 'harness.tenant-governance'
        phase: 'installation'
        reason: string
        close: Extract<Awaited<ReturnType<typeof open>>, { kind: 'created' }>['close']
      }>
  >
}>

export function prepareTenantGovernance(input: TenantGovernanceOptions): TenantGovernanceAssembly {
  const options = {
    ...input,
    scope: GovernanceScopeSchema.parse(input.scope),
    domain: structuredClone(input.domain),
    grants: typeof input.grants === 'function' ? input.grants : structuredClone(input.grants),
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
    open: () => (opening ??= Promise.resolve().then(() => open(options, combinations))),
  }
}
