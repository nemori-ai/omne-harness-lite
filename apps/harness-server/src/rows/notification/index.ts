import { z } from 'zod'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { instantSchema, type Instant } from '@omne-harness/notification-contract'
import {
  notificationCatalogKey,
  notificationChangesKey,
  notificationChannelsKey,
  notificationDestinationsKey,
  notificationInboxKey,
  notificationSendingKey,
  notificationSourcesKey,
  notificationStandingKey,
  notificationSubscriptionsKey,
} from '@omne-harness/notification-cordis-contract/cordis'
import { notificationPolicySchema } from '@omne-harness/notification-local'
import { createNotificationLocalPlugin } from '@omne-harness/notification-local/cordis'
import {
  combinationManifest,
  manifestDigest,
  type SqlStorage,
  type TenantDomainLookup,
  type TenantDomains,
} from '@omne-harness/sql-contract'
import {
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import {
  runtimeContextTenantBlocksKey,
  runtimeContextTenantScopeKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { tenantScopePrincipalsKey } from '../../entry/tenant-scope-principals.ts'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { defineRow } from '../../row.ts'
import {
  tenantDomainRegistrationKey,
  type TenantDomainRegistration,
} from '../governance/tenant-domain-registration-service.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { liveCallOrigin } from '../tool-bindings/live-calls.ts'
import { createNotificationAuthority } from './authority.ts'
import { subscriptionCreators } from './creators.ts'
import { createTenantBindings, NOTIFICATION_PARTICIPANTS, type Combination } from './binding.ts'
import { OWNER_POSTS } from './owner-source.ts'
import { createStandingItemsReader, standingContribution } from './standing.ts'

export const notificationConfig = z.strictObject({ policy: notificationPolicySchema })

function now(): Instant {
  const instant = readSystemInstant()
  if (!instant.ok) throw new Error('notification clock unavailable')
  return instantSchema.parse(instant.text)
}

/** The storage combination of the notification participant, from the catalogue of the running code. */
export async function notificationCombination(): Promise<Combination> {
  const catalog = await productionStorageCatalog()
  const manifest = combinationManifest({ catalog, participants: NOTIFICATION_PARTICIPANTS })
  if (manifest.kind !== 'manifest') throw new Error('notification combination is not registrable')
  const digest = manifestDigest(manifest.manifest)
  return {
    combinationVersion: `harness-notification/${digest.slice(0, 16)}`,
    manifestDigest: digest,
  }
}

export const notificationRow = defineRow({
  row: 'notification',
  implementation: 'real',
  manifest: {
    provides: [
      notificationSendingKey,
      notificationInboxKey,
      notificationSubscriptionsKey,
      notificationDestinationsKey,
      notificationCatalogKey,
      notificationSourcesKey,
      notificationChannelsKey,
      notificationChangesKey,
      notificationStandingKey,
    ],
    injects: [
      storageKey,
      dynamisKey,
      tenantDomainLookupKey,
      tenantDomainsKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: notificationConfig,
  async body(ctx, raw) {
    const { policy } = notificationConfig.parse(raw)
    const logger = ctx.logger('notification')
    const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
    const scanner: unknown = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
    const bindings = createTenantBindings({
      storage: ctx.get(storageKey) as SqlStorage,
      lookup: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
      registration: () =>
        ctx.get(tenantDomainRegistrationKey) as TenantDomainRegistration | undefined,
      combination: notificationCombination,
      listing: () => directory.enumerate({ principal: scanner }),
      report: (tenant, reason) =>
        logger.warn('no notification storage for tenant %s: %s', tenant, reason),
    })
    const provider = ctx.plugin(createNotificationLocalPlugin(), {
      policy,
      sql: bindings,
      ports: {
        authority: createNotificationAuthority(),
        creators: subscriptionCreators(liveCallOrigin(ctx)),
        standing: createStandingItemsReader<unknown>({
          scope: () => ctx.get(runtimeContextTenantScopeKey),
          principal: async tenant => ctx.get(tenantScopePrincipalsKey)?.forTenant(tenant) ?? null,
        }),
      },
      clock: { now },
      report: error => logger.warn('notification work failed: %s', String(error)),
    })
    await provider.await()
    ctx.inject([notificationSourcesKey], child => {
      child.notificationSources.register(OWNER_POSTS)
    })
    ctx.inject([runtimeContextTenantBlocksKey, notificationStandingKey], child => {
      const blocked = child[notificationStandingKey].blocked
      child[runtimeContextTenantBlocksKey].register(standingContribution(blocked))
    })
    return {
      async stop() {
        await provider.dispose()
        return { kind: 'settled' }
      },
    }
  },
})
