import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { standingPrincipalRef } from '@omne-harness/identity'
import {
  principalVerifierKey,
  identityGovernanceKey,
  tenantStandingKey,
  standingReservationsKey,
  StandingDestinationResolverService,
  standingDestinationResolverKey,
} from '@omne-harness/identity/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { GovernanceIdSchema } from '@omne-harness/governance-contract'
import { createSettingsRegistry } from '@omne-harness/settings'
import type { SettingsSourceDestination } from '@omne-harness/settings-local/preparation'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { toolContributionAuthorityKey } from '@omne-harness/tool-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { governanceInstallationPrincipalsKey } from '../../entry/governance-installation-principals.ts'
import { governanceDirectoryPrincipalsKey } from '../../entry/governance-directory-principals.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { readSystemInstant, epochMillisOf } from '../../entry/session-clock.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import {
  SessionPermissionBackendService,
  sessionPermissionBackendKey,
} from './session-permission-backend-service.ts'
import { createToolGovernanceDefinitionSource } from './tool-definition-source.ts'
import { prepareInstalledTenantGovernance } from './tenant-installation.ts'
import { TenantGovernanceHost } from './tenant-host.ts'
import { openOrganizationSettingsSources } from './organization-settings.ts'
import { permissionOriginsOf } from './permission-origins.ts'
import { CurrentPermissionService, currentToolPermissionKey } from './current-permission-service.ts'

const configSchema = z.strictObject({
  deploymentId: GovernanceIdSchema,
  logicalServiceId: GovernanceIdSchema,
  recoveryPagesPerPass: z.number().int().min(1),
  closeTimeoutMs: z.number().int().min(0).max(60_000),
})

class SessionBackend extends SessionPermissionBackendService {
  readonly read: SessionPermissionBackendService['read']
  constructor(ctx: Context, host: TenantGovernanceHost) {
    super(ctx)
    this.read = async context => {
      const tenant = tenantCodec.encode(context.principal.tenant)
      if (!tenant.ok || tenant.value !== context.qualification.tenantRef) return undefined
      return (await host.runtime(tenant.value))?.backend
    }
  }
}

class StandingDestination extends StandingDestinationResolverService {
  readonly seal: StandingDestinationResolverService['seal']
  constructor(ctx: Context, host: TenantGovernanceHost) {
    super(ctx)
    this.seal = host.destination.seal
  }
}

export const governanceRow = defineRow({
  row: 'governance',
  implementation: 'real',
  manifest: {
    provides: [
      sessionPermissionBackendKey,
      standingDestinationResolverKey,
      currentToolPermissionKey,
    ],
    injects: [
      storageKey,
      tenantDomainLookupKey,
      principalVerifierKey,
      identityGovernanceKey,
      tenantStandingKey,
      standingReservationsKey,
      governanceDirectoryPrincipalsKey,
      governanceInstallationPrincipalsKey,
      toolContributionAuthorityKey,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx, raw) {
    const config = configSchema.parse(raw)
    const release = releaseOf(ctx)
    const materials = await productionStorageCatalog(async () => release)
    if (release.kind !== 'trusted') throw new Error('governance Tool release unavailable')
    const registry = createSettingsRegistry({ capacity: 1024 })
    ctx.effect(() => () => registry.close(), 'governance.settings-registry.close')
    for (const entry of release.manifest.entries)
      for (const definition of entry.governance.declaration.settings)
        if (registry.registerContribution(definition).kind !== 'registered')
          throw new Error('governance Settings definition registration failed')
    const identity = {
      verifier: ctx.principalVerifier,
      standing: ctx.tenantStanding,
      reservations: ctx.standingReservations,
    }
    let sourceDestination: SettingsSourceDestination | undefined
    const sources = await openOrganizationSettingsSources({
      storage: ctx.storage,
      materials,
      identity,
      destination: {
        recognize: request =>
          sourceDestination?.recognize(request) ?? Promise.resolve({ kind: 'unavailable' }),
        seal: request =>
          sourceDestination?.seal(request) ?? Promise.resolve({ kind: 'unavailable' }),
      },
    })
    if (sources.kind !== 'created')
      throw new Error('governance organization Settings sources unavailable')
    ctx.effect(() => () => sources.close(), 'governance.settings-sources.close')
    const host = new TenantGovernanceHost({
      domains: ctx.tenantDomainLookup,
      prepare(tenantRef, domain) {
        const tenant = tenantCodec.parse(tenantRef)
        const principal = tenant.ok
          ? ctx.governanceDirectoryPrincipals.forTenant(tenant.value)
          : undefined
        const installationPrincipal = tenant.ok
          ? ctx.governanceInstallationPrincipals.forTenant(tenant.value)
          : undefined
        if (!principal || !installationPrincipal)
          throw new Error('governance principal unavailable')
        const scope = {
          tenantRef,
          deploymentId: config.deploymentId,
          logicalServiceId: config.logicalServiceId,
          visibility: { kind: 'tenant' as const, tenantRef },
        }
        return prepareInstalledTenantGovernance({
          installationPrincipal,
          login: () => ctx.identityGovernance,
          release,
          permissionOrigins: () => permissionOriginsOf(ctx),
          organizationTargets: sources.targets,
          scope,
          domain,
          materials,
          storage: ctx.storage,
          catalogPrincipal: principal,
          destination: 'harness.governance',
          sourceRoute: 'harness.governance.session-write',
          identity,
          registry,
          clock: {
            now() {
              const instant = readSystemInstant()
              if (!instant.ok) throw new Error('governance Settings clock unavailable')
              return epochMillisOf(instant.text)
            },
          },
          cursorLifetimeMs: 60_000,
          sourceReservations: sources.reservations,
          grants: [
            {
              principalRef: standingPrincipalRef(principal),
              scope,
              action: 'catalog-management',
              required: [],
            },
          ],
          definitions: createToolGovernanceDefinitionSource(() => release),
          recoveryPagesPerPass: config.recoveryPagesPerPass,
          closeTimeoutMs: config.closeTimeoutMs,
        })
      },
    })
    sourceDestination = host.sourceDestination
    new StandingDestination(ctx, host)
    new SessionBackend(ctx, host)
    new CurrentPermissionService(ctx, {
      identity: {
        verifier: { verify: input => ctx.principalVerifier.verify(input) },
        standing: { read: input => ctx.tenantStanding.read(input) },
      },
      runtime: tenant => host.runtime(tenant),
    })
    ctx.effect(
      () => () => host.close(monotonicClock.now() + config.closeTimeoutMs),
      'governance.close',
    )
    return {
      async stop(deadline) {
        const result = await host.close(deadline)
        if (result.kind === 'settled') await sources.close()
        return result
      },
    }
  },
})
