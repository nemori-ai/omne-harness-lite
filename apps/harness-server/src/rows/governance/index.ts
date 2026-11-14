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
import { fail } from '@omne-harness/operation-result'
import { GovernanceIdSchema } from '@omne-harness/governance-contract'
import { createSettingsRegistry } from '@omne-harness/settings'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { toolContributionAuthorityKey } from '@omne-harness/tool-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { classify } from '../authorization/principals.ts'
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
import { provideTenantSettings, tenantSettingsKey } from './tenant-settings-service.ts'
import { isHitlReservation } from '../tool-hitl/host.ts'
import { toolHitlHolder } from '../tool-hitl/holder.ts'

const configSchema = z.strictObject({
  deploymentId: GovernanceIdSchema,
  logicalServiceId: GovernanceIdSchema,
  recoveryPagesPerPass: z.number().int().min(1),
  closeTimeoutMs: z.number().int().min(0).max(60_000),
})

class SessionBackend extends SessionPermissionBackendService {
  readonly basis: SessionPermissionBackendService['basis']
  constructor(ctx: Context, host: TenantGovernanceHost) {
    super(ctx)
    this.basis = async commit => {
      const who = classify(commit.access.principal)
      if (who?.column !== 'login') return fail({ kind: 'denied', action: 'change' })
      const tenant = tenantCodec.encode(who.principal.tenant)
      const runtime = tenant.ok ? await host.runtime(tenant.value) : undefined
      return runtime === undefined
        ? fail({
            kind: 'unavailable',
            owner: 'harness.session-permission-write',
            diagnostic: 'the governance runtime of the tenant is unavailable',
          })
        : runtime.sessionPermissionBasis({
            ...commit,
            access: { ...commit.access, principal: who.principal },
          })
    }
  }
}

class StandingDestination extends StandingDestinationResolverService {
  readonly seal: StandingDestinationResolverService['seal']
  constructor(ctx: Context, host: TenantGovernanceHost) {
    super(ctx)
    this.seal = reservation =>
      isHitlReservation(reservation)
        ? (toolHitlHolder(ctx).host?.destination.seal(reservation) ??
          Promise.resolve({ kind: 'unavailable', diagnostic: 'the HITL host is not installed' }))
        : host.destination.seal(reservation)
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
      tenantSettingsKey,
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
    const sources = await openOrganizationSettingsSources({ storage: ctx.storage, materials })
    if (sources.kind !== 'created')
      throw new Error('governance organization Settings sources unavailable')
    ctx.effect(() => () => sources.close(), 'governance.settings-sources.close')
    const host = new TenantGovernanceHost({
      domains: ctx.tenantDomainLookup,
      report: failure =>
        ctx
          .logger('governance')
          .warn(
            `tenant governance did not open: tenant=${failure.tenantRef} phase=${failure.phase} failures=${failure.failures}; again in ${failure.againInMs} ms`,
          ),
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
    new StandingDestination(ctx, host)
    new SessionBackend(ctx, host)
    new CurrentPermissionService(ctx, {
      identity: {
        verifier: { verify: input => ctx.principalVerifier.verify(input) },
        standing: { read: input => ctx.tenantStanding.read(input) },
      },
      runtime: tenant => host.runtime(tenant),
    })
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'governance.tenant-settings.active',
    )
    provideTenantSettings(ctx, {
      host,
      scope: config,
      storage: ctx.storage,
      release: () => release,
      identity: {
        verifier: { verify: input => ctx.principalVerifier.verify(input) },
        standing: { read: input => ctx.tenantStanding.read(input) },
      },
      active: () => active,
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
